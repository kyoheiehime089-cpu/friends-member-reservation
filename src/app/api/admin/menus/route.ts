import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MenuBody = {
  id?: string;
  name?: string;
  description?: string | null;
  defaultCapacity?: number;
  isActive?: boolean;
};

function normalizeCapacity(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 1 || numberValue > 99) return null;
  return Math.floor(numberValue);
}

function isBookableMenu(row: { name?: string | null; is_active?: boolean | null }) {
  const name = String(row.name ?? '').trim();
  if (row.is_active === false) return false;
  if (!name) return false;
  return name !== '全メニュー';
}

const menuSelect = 'id,name,description,default_capacity,is_active,created_at';
const defaultMenus = [
  { name: 'セミパーソナル', description: '少人数でフォーム確認を受けながらトレーニングできます。', default_capacity: 5, is_active: true },
  { name: 'ヨガ', description: 'blossom yoga のレッスンです。', default_capacity: 7, is_active: true },
  { name: 'イベント', description: '特別イベント・ワークショップ用の枠です。', default_capacity: 8, is_active: true },
  { name: '整体', description: '単発で追加する整体・リラクゼーション用の枠です。', default_capacity: 1, is_active: true }
];

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  let { data, error } = await serviceClient.from('menus').select(menuSelect).order('name', { ascending: true });

  if (error) return NextResponse.json({ ok: false, message: `メニュー一覧の取得に失敗しました: ${error.message}` }, { status: 500 });
  if ((data ?? []).length === 0) {
    const { error: seedError } = await serviceClient.from('menus').insert(defaultMenus);
    if (seedError) return NextResponse.json({ ok: false, message: `標準メニューの作成に失敗しました: ${seedError.message}` }, { status: 400 });
    const result = await serviceClient.from('menus').select(menuSelect).order('name', { ascending: true });
    data = result.data;
    error = result.error;
    if (error) return NextResponse.json({ ok: false, message: `メニュー一覧の取得に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, menus: (data ?? []).filter(isBookableMenu) });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const body = await request.json().catch(() => ({})) as MenuBody;
  const name = body.name?.trim();
  const description = body.description?.trim() || null;
  const defaultCapacity = normalizeCapacity(body.defaultCapacity);

  if (!name) return NextResponse.json({ ok: false, message: 'メニュー名を入力してください。' }, { status: 400 });
  if (!defaultCapacity) return NextResponse.json({ ok: false, message: '定員は1〜99名で入力してください。' }, { status: 400 });

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data, error } = await serviceClient
    .from('menus')
    .insert({ name, description, default_capacity: defaultCapacity, is_active: body.isActive !== false })
    .select(menuSelect)
    .single();

  if (error) return NextResponse.json({ ok: false, message: `メニューの作成に失敗しました: ${error.message}` }, { status: 400 });
  return NextResponse.json({ ok: true, menu: data });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const body = await request.json().catch(() => ({})) as MenuBody;
  const id = body.id?.trim();
  if (!id || !uuidPattern.test(id)) return NextResponse.json({ ok: false, message: 'メニューIDが不正です。' }, { status: 400 });

  const updatePayload: { name?: string; description?: string | null; default_capacity?: number; is_active?: boolean } = {};
  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ ok: false, message: 'メニュー名を入力してください。' }, { status: 400 });
    updatePayload.name = name;
  }
  if (body.description !== undefined) updatePayload.description = body.description?.trim() || null;
  if (body.defaultCapacity !== undefined) {
    const defaultCapacity = normalizeCapacity(body.defaultCapacity);
    if (!defaultCapacity) return NextResponse.json({ ok: false, message: '定員は1〜99名で入力してください。' }, { status: 400 });
    updatePayload.default_capacity = defaultCapacity;
  }
  if (typeof body.isActive === 'boolean') updatePayload.is_active = body.isActive;

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data, error } = await serviceClient.from('menus').update(updatePayload).eq('id', id).select(menuSelect).single();

  if (error) return NextResponse.json({ ok: false, message: `メニューの更新に失敗しました: ${error.message}` }, { status: 400 });
  return NextResponse.json({ ok: true, menu: data });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id || !uuidPattern.test(id)) return NextResponse.json({ ok: false, message: 'メニューIDが不正です。' }, { status: 400 });

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data, error } = await serviceClient.from('menus').update({ is_active: false }).eq('id', id).select(menuSelect).single();

  if (error) return NextResponse.json({ ok: false, message: `メニューの停止に失敗しました: ${error.message}` }, { status: 400 });
  return NextResponse.json({ ok: true, menu: data });
}
