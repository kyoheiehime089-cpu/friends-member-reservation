import { NextResponse } from 'next/server';
import { allowedMemberStatuses, createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';
import { createInitialLoginCode, sendMemberLoginGuide } from '@/lib/memberInviteMail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PatchBody = {
  memberId?: string;
  planId?: string | null;
  status?: string;
  fullName?: string;
  email?: string;
};

type CreateBody = {
  fullName?: string;
  email?: string;
  password?: string;
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
  const { data: plan, error: planError } = await serviceClient.from('plans').select('id').eq('id', planId).maybeSingle();
  if (planError) throw new Error(`プラン確認に失敗しました: ${planError.message}`);
  if (!plan) throw new Error('指定されたプランが見つかりません。');
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  }

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const [{ data: members, error: membersError }, { data: plans, error: plansError }] = await Promise.all([
    serviceClient
      .from('members')
      .select('id,full_name,email,status,plan_id,created_at,updated_at')
      .order('created_at', { ascending: false }),
    serviceClient
      .from('plans')
      .select('id,name,weekly_limit,unlimited,is_active')
      .order('name', { ascending: true })
  ]);

  if (membersError) {
    return NextResponse.json({ ok: false, message: `会員一覧の取得に失敗しました: ${membersError.message}` }, { status: 500 });
  }

  if (plansError) {
    return NextResponse.json({ ok: false, message: `プラン一覧の取得に失敗しました: ${plansError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    members: members ?? [],
    plans: plans ?? [],
    statuses: allowedMemberStatuses
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  }

  const body = await request.json().catch(() => ({})) as CreateBody;
  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();
  const loginCode = body.password?.trim() || createInitialLoginCode();
  const planId = typeof body.planId === 'string' && body.planId.trim() ? body.planId.trim() : null;
  const status = body.status?.trim() || '有効';

  if (!fullName) return NextResponse.json({ ok: false, message: '会員名を入力してください。' }, { status: 400 });
  if (!email || !email.includes('@')) return NextResponse.json({ ok: false, message: 'メールアドレスを正しく入力してください。' }, { status: 400 });
  if (loginCode.length < 6) return NextResponse.json({ ok: false, message: '初期ログインコードは6文字以上で入力してください。' }, { status: 400 });
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

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  }

  const body = await request.json().catch(() => ({})) as PatchBody;
  const memberId = body.memberId?.trim();
  const planId = typeof body.planId === 'string' && body.planId.trim() ? body.planId.trim() : null;
  const status = body.status?.trim();
  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!memberId || !uuidPattern.test(memberId)) return NextResponse.json({ ok: false, message: 'memberId が不正です。' }, { status: 400 });
  if (status && !allowedMemberStatuses.includes(status)) return NextResponse.json({ ok: false, message: 'status が不正です。' }, { status: 400 });
  if (email && !email.includes('@')) return NextResponse.json({ ok: false, message: 'メールアドレスが不正です。' }, { status: 400 });

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);

  try {
    await assertPlanExists(serviceClient, planId);
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'プラン確認に失敗しました。' }, { status: 400 });
  }

  const updatePayload: { plan_id?: string | null; status?: string; full_name?: string; email?: string; updated_at: string } = { updated_at: new Date().toISOString() };
  updatePayload.plan_id = planId;
  if (status) updatePayload.status = status;
  if (fullName) updatePayload.full_name = fullName;
  if (email) updatePayload.email = email;

  const { data, error } = await serviceClient
    .from('members')
    .update(updatePayload)
    .eq('id', memberId)
    .select('id,full_name,email,status,plan_id,created_at,updated_at')
    .single();

  if (error) {
    return NextResponse.json({ ok: false, message: `会員情報の更新に失敗しました: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, member: data });
}
