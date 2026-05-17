import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PlanBody = {
  id?: string;
  name?: string;
  weeklyLimit?: number | null;
  unlimited?: boolean;
  isActive?: boolean;
};

const planSelect = 'id,name,weekly_limit,unlimited,is_active,created_at';
const defaultPlans = [
  { name: 'セミパーソナル週1', weekly_limit: 1, unlimited: false, is_active: true },
  { name: 'セミパーソナル週2', weekly_limit: 2, unlimited: false, is_active: true },
  { name: 'セミパーソナル通い放題', weekly_limit: null, unlimited: true, is_active: true },
  { name: 'ヨガ週1', weekly_limit: 1, unlimited: false, is_active: true },
  { name: 'ヨガ週2', weekly_limit: 2, unlimited: false, is_active: true },
  { name: 'ヨガ通い放題', weekly_limit: null, unlimited: true, is_active: true },
  { name: '個別設定', weekly_limit: null, unlimited: true, is_active: true },
  { name: '未設定', weekly_limit: 1, unlimited: false, is_active: true }
];

function normalizeWeeklyLimit(value: unknown, unlimited: boolean) {
  if (unlimited) return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 1 || numberValue > 14) return null;
  return Math.floor(numberValue);
}

function defaultCapacityForPlan(name: string) {
  if (name.includes('ヨガ')) return 7;
  if (name.includes('セミ')) return 5;
  return 8;
}

async function ensureMenuForPlan(serviceClient: ReturnType<typeof createServiceClient>, planName: string) {
  if (planName.includes('＋') || planName.includes('+')) return;
  const { data: store } = await serviceClient.from('stores').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
  const { data: existing } = await serviceClient.from('menus').select('id').eq('name', planName).maybeSingle();
  if (existing?.id || !store?.id) return;
  await serviceClient.from('menus').insert({
    store_id: store.id,
    name: planName,
    description: `${planName}用の予約枠です。`,
    default_capacity: defaultCapacityForPlan(planName),
    is_active: true
  });
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  let { data, error } = await serviceClient.from('plans').select(planSelect).order('name', { ascending: true });

  if (error) return NextResponse.json({ ok: false, message: `プラン一覧の取得に失敗しました: ${error.message}` }, { status: 500 });
  if ((data ?? []).length === 0) {
    const { error: seedError } = await serviceClient.from('plans').insert(defaultPlans);
    if (seedError) return NextResponse.json({ ok: false, message: `標準プランの作成に失敗しました: ${seedError.message}` }, { status: 400 });
    const result = await serviceClient.from('plans').select(planSelect).order('name', { ascending: true });
    data = result.data;
    error = result.error;
    if (error) return NextResponse.json({ ok: false, message: `プラン一覧の取得に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, plans: data ?? [] });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const body = await request.json().catch(() => ({})) as PlanBody;
  const name = body.name?.trim();
  const unlimited = body.unlimited === true;
  const weeklyLimit = normalizeWeeklyLimit(body.weeklyLimit, unlimited);

  if (!name) return NextResponse.json({ ok: false, message: 'プラン名を入力してください。' }, { status: 400 });
  if (!unlimited && !weeklyLimit) return NextResponse.json({ ok: false, message: '週回数は1〜14回で入力してください。' }, { status: 400 });

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data, error } = await serviceClient
    .from('plans')
    .insert({ name, weekly_limit: weeklyLimit, unlimited, is_active: body.isActive !== false })
    .select(planSelect)
    .single();

  if (error) return NextResponse.json({ ok: false, message: `プランの作成に失敗しました: ${error.message}` }, { status: 400 });
  await ensureMenuForPlan(serviceClient, name);
  return NextResponse.json({ ok: true, plan: data });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const body = await request.json().catch(() => ({})) as PlanBody;
  const id = body.id?.trim();
  if (!id || !uuidPattern.test(id)) return NextResponse.json({ ok: false, message: 'プランIDが不正です。' }, { status: 400 });

  const updatePayload: { name?: string; weekly_limit?: number | null; unlimited?: boolean; is_active?: boolean } = {};

  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ ok: false, message: 'プラン名を入力してください。' }, { status: 400 });
    updatePayload.name = name;
  }

  if (typeof body.unlimited === 'boolean') updatePayload.unlimited = body.unlimited;
  const nextUnlimited = body.unlimited === true;
  if (body.weeklyLimit !== undefined || body.unlimited !== undefined) {
    const weeklyLimit = normalizeWeeklyLimit(body.weeklyLimit, nextUnlimited);
    if (!nextUnlimited && !weeklyLimit) return NextResponse.json({ ok: false, message: '週回数は1〜14回で入力してください。' }, { status: 400 });
    updatePayload.weekly_limit = weeklyLimit;
  }

  if (typeof body.isActive === 'boolean') updatePayload.is_active = body.isActive;

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data, error } = await serviceClient.from('plans').update(updatePayload).eq('id', id).select(planSelect).single();

  if (error) return NextResponse.json({ ok: false, message: `プランの更新に失敗しました: ${error.message}` }, { status: 400 });
  if (data?.name) await ensureMenuForPlan(serviceClient, data.name);
  return NextResponse.json({ ok: true, plan: data });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id || !uuidPattern.test(id)) return NextResponse.json({ ok: false, message: 'プランIDが不正です。' }, { status: 400 });

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data, error } = await serviceClient.from('plans').update({ is_active: false }).eq('id', id).select(planSelect).single();

  if (error) return NextResponse.json({ ok: false, message: `プランの停止に失敗しました: ${error.message}` }, { status: 400 });
  return NextResponse.json({ ok: true, plan: data });
}