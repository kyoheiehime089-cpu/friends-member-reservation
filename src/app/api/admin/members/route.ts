import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedStatuses = ['有効', '休会中', '退会予定', '退会済み', '停止中', '未払い'];

type PatchBody = {
  memberId?: string;
  planId?: string | null;
  status?: string;
};

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !anonKey || !serviceKey) return null;
  return { supabaseUrl, anonKey, serviceKey };
}

function createUserClient(supabaseUrl: string, anonKey: string, token: string) {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function createServiceClient(supabaseUrl: string, serviceKey: string) {
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function requireAdmin(request: Request) {
  const config = getConfig();
  if (!config) {
    return { ok: false as const, status: 500, message: 'Supabase環境変数が未設定です。', config: null, adminId: null };
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) {
    return { ok: false as const, status: 401, message: 'ログイン情報が確認できません。', config, adminId: null };
  }

  const userClient = createUserClient(config.supabaseUrl, config.anonKey, token);
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false as const, status: 401, message: 'ログイン情報を確認できません。', config, adminId: null };
  }

  const serviceClient = createServiceClient(config.supabaseUrl, config.serviceKey);
  const { data: adminRow, error: adminError } = await serviceClient
    .from('admin_users')
    .select('id')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (adminError) {
    return { ok: false as const, status: 500, message: `管理者権限の確認に失敗しました: ${adminError.message}`, config, adminId: null };
  }

  if (!adminRow) {
    return { ok: false as const, status: 403, message: '管理者権限がありません。', config, adminId: null };
  }

  return { ok: true as const, status: 200, message: 'OK', config, adminId: userData.user.id };
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
    statuses: allowedStatuses
  });
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

  if (!memberId || !uuidPattern.test(memberId)) {
    return NextResponse.json({ ok: false, message: 'memberId が不正です。' }, { status: 400 });
  }

  if (planId && !uuidPattern.test(planId)) {
    return NextResponse.json({ ok: false, message: 'planId が不正です。' }, { status: 400 });
  }

  if (status && !allowedStatuses.includes(status)) {
    return NextResponse.json({ ok: false, message: 'status が不正です。' }, { status: 400 });
  }

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);

  if (planId) {
    const { data: plan, error: planError } = await serviceClient
      .from('plans')
      .select('id')
      .eq('id', planId)
      .maybeSingle();

    if (planError) {
      return NextResponse.json({ ok: false, message: `プラン確認に失敗しました: ${planError.message}` }, { status: 400 });
    }

    if (!plan) {
      return NextResponse.json({ ok: false, message: '指定されたプランが見つかりません。' }, { status: 404 });
    }
  }

  const updatePayload: { plan_id?: string | null; status?: string; updated_at: string } = {
    updated_at: new Date().toISOString()
  };
  updatePayload.plan_id = planId;
  if (status) updatePayload.status = status;

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
