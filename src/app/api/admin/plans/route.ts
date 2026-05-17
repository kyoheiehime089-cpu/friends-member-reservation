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

function normalizeWeeklyLimit(value: unknown, unlimited: boolean) {
  if (unlimited) return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 1 || numberValue > 14) return null;
  return Math.floor(numberValue);
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data, error } = await serviceClient.from('plans').select(planSelect).order('name', { ascending: true });

  if (error) return NextResponse.json({ ok: false, message: `プラン一覧の取得に失敗しました: ${error.message}` }, { status: 500 });
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
