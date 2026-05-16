import { NextResponse } from 'next/server';
import { allowedMemberStatuses, createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';
import { createInitialLoginCode, sendMemberLoginGuide } from '@/lib/memberInviteMail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type InviteBody = {
  fullName?: string;
  email?: string;
  planId?: string | null;
  status?: string;
};

async function getDefaultStoreId(serviceClient: ReturnType<typeof createServiceClient>) {
  const { data, error } = await serviceClient.from('stores').select('id').order('created_at', { ascending: true }).limit(1);
  if (error) throw new Error(`店舗情報の取得に失敗しました: ${error.message}`);
  return data?.[0]?.id ?? null;
}

async function assertPlanExists(serviceClient: ReturnType<typeof createServiceClient>, planId: string | null) {
  if (!planId) return;
  if (!uuidPattern.test(planId)) throw new Error('planId が不正です。');
  const { data: plan, error } = await serviceClient.from('plans').select('id').eq('id', planId).maybeSingle();
  if (error) throw new Error(`プラン確認に失敗しました: ${error.message}`);
  if (!plan) throw new Error('指定されたプランが見つかりません。');
}

async function sendMemberResetGuide(params: { to: string; link: string }) {
  const apiKey = process.env.MAIL_API_KEY?.trim();
  const from = process.env.MAIL_FROM_FRIENDS?.trim() || 'onboarding@resend.dev';
  if (!apiKey) return { ok: false, message: 'MAIL_API_KEY が未設定です。' };

  const text = `friends予約システムのログイン再設定メールです。

下記リンクからログイン情報を再設定してください。

${params.link}

リンクの有効期限が切れた場合は、スタッフへ再送をご依頼ください。

friends`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: '【friends】予約システム ログイン再設定のお知らせ',
      text
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { ok: false, message: detail || `メール送信に失敗しました。status=${response.status}` };
  }

  return { ok: true, message: 'ログイン再設定メールを送信しました。' };
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  }

  const body = await request.json().catch(() => ({})) as InviteBody;
  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();
  const planId = typeof body.planId === 'string' && body.planId.trim() ? body.planId.trim() : null;
  const status = body.status?.trim() || '有効';
  const loginCode = createInitialLoginCode();

  if (!fullName) return NextResponse.json({ ok: false, message: '会員名を入力してください。' }, { status: 400 });
  if (!email || !email.includes('@')) return NextResponse.json({ ok: false, message: 'メールアドレスを正しく入力してください。' }, { status: 400 });
  if (!allowedMemberStatuses.includes(status)) return NextResponse.json({ ok: false, message: 'status が不正です。' }, { status: 400 });

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);

  try {
    await assertPlanExists(serviceClient, planId);
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'プラン確認に失敗しました。' }, { status: 400 });
  }

  const { data: existing } = await serviceClient
    .from('members')
    .select('id,full_name,email,status,plan_id')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    await serviceClient
      .from('members')
      .update({ full_name: fullName, status, plan_id: planId, updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    const { data: resetData, error: resetError } = await serviceClient.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: 'https://friends-member-reservation.vercel.app/login' }
    });

    if (resetError || !resetData.properties?.action_link) {
      return NextResponse.json({ ok: false, message: `ログイン再設定リンクの作成に失敗しました: ${resetError?.message ?? 'link not created'}` }, { status: 400 });
    }

    const mail = await sendMemberResetGuide({ to: email, link: resetData.properties.action_link });
    return NextResponse.json({ ok: true, existing: true, member: existing, mail });
  }

  const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
    email,
    password: loginCode,
    email_confirm: true,
    user_metadata: { full_name: fullName, name: fullName }
  });

  if (authError || !authData.user) {
    return NextResponse.json({ ok: false, message: `ログインユーザーの作成に失敗しました: ${authError?.message ?? '作成できませんでした。'}` }, { status: 400 });
  }

  let storeId: string | null = null;
  try {
    storeId = await getDefaultStoreId(serviceClient);
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : '店舗情報の取得に失敗しました。' }, { status: 400 });
  }

  const { data: member, error: memberError } = await serviceClient
    .from('members')
    .insert({ id: authData.user.id, store_id: storeId, full_name: fullName, email, status, plan_id: planId })
    .select('id,full_name,email,status,plan_id,created_at,updated_at')
    .single();

  if (memberError) {
    return NextResponse.json({ ok: false, message: `会員情報の作成に失敗しました: ${memberError.message}` }, { status: 400 });
  }

  const mail = await sendMemberLoginGuide({ to: email, fullName, loginCode });
  return NextResponse.json({ ok: true, existing: false, member, mail, temporaryLoginCode: mail.ok ? null : loginCode });
}
