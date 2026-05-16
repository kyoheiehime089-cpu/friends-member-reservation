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

  const { data: existing } = await serviceClient.from('members').select('id').eq('email', email).maybeSingle();
  if (existing) return NextResponse.json({ ok: false, message: '同じメールアドレスの会員がすでに存在します。' }, { status: 409 });

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
  return NextResponse.json({ ok: true, member, mail, temporaryLoginCode: mail.ok ? null : loginCode });
}
