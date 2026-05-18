import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SlotBody = {
  id?: string;
  menuId?: string;
  date?: string;
  time?: string;
  durationMinutes?: number;
  capacity?: number;
  isOpen?: boolean;
};

function toLocalDateTimeIso(date: string, time: string) {
  return `${date}T${time}:00+09:00`;
}

function normalizeCapacity(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 1 || numberValue > 99) return null;
  return Math.floor(numberValue);
}

function normalizeDuration(value: unknown) {
  const numberValue = Number(value ?? 40);
  if (!Number.isFinite(numberValue) || numberValue < 5 || numberValue > 240) return null;
  return Math.floor(numberValue);
}

async function getDefaultStoreId(serviceClient: ReturnType<typeof createServiceClient>) {
  const { data, error } = await serviceClient.from('stores').select('id').order('created_at', { ascending: true }).limit(1);
  if (error) throw new Error(`店舗情報の取得に失敗しました: ${error.message}`);
  return data?.[0]?.id ?? null;
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(Number(searchParams.get('days') ?? 60), 1), 180);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const [{ data: menus, error: menusError }, { data: slots, error: slotsError }] = await Promise.all([
    serviceClient.from('menus').select('id,name,default_capacity,is_active').order('name', { ascending: true }),
    serviceClient
      .from('reservation_slots')
      .select('id,menu_id,starts_at,ends_at,capacity,is_open,created_at')
      .gte('starts_at', start.toISOString())
      .lte('starts_at', end.toISOString())
      .order('starts_at', { ascending: true })
      .limit(500)
  ]);

  if (menusError) return NextResponse.json({ ok: false, message: `メニュー一覧の取得に失敗しました: ${menusError.message}` }, { status: 500 });
  if (slotsError) return NextResponse.json({ ok: false, message: `予約枠の取得に失敗しました: ${slotsError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, menus: menus ?? [], slots: slots ?? [] });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const body = await request.json().catch(() => ({})) as SlotBody;
  const menuId = body.menuId?.trim();
  const date = body.date?.trim();
  const time = body.time?.trim();
  const capacity = normalizeCapacity(body.capacity);
  const duration = normalizeDuration(body.durationMinutes);

  if (!menuId || !uuidPattern.test(menuId)) return NextResponse.json({ ok: false, message: 'メニューを選択してください。' }, { status: 400 });
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ ok: false, message: '日付を正しく入力してください。' }, { status: 400 });
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return NextResponse.json({ ok: false, message: '開始時間を正しく入力してください。' }, { status: 400 });
  if (!capacity) return NextResponse.json({ ok: false, message: '定員は1〜99名で入力してください。' }, { status: 400 });
  if (!duration) return NextResponse.json({ ok: false, message: '時間は5〜240分で入力してください。' }, { status: 400 });

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data: menu } = await serviceClient.from('menus').select('id').eq('id', menuId).maybeSingle();
  if (!menu) return NextResponse.json({ ok: false, message: '指定されたメニューが見つかりません。' }, { status: 404 });

  let storeId: string | null = null;
  try {
    storeId = await getDefaultStoreId(serviceClient);
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : '店舗情報の取得に失敗しました。' }, { status: 400 });
  }

  const startsAt = toLocalDateTimeIso(date, time);
  const endsAt = new Date(new Date(startsAt).getTime() + duration * 60 * 1000).toISOString();
  const { data, error } = await serviceClient
    .from('reservation_slots')
    .insert({ store_id: storeId, menu_id: menuId, starts_at: startsAt, ends_at: endsAt, capacity, is_open: body.isOpen !== false })
    .select('id,menu_id,starts_at,ends_at,capacity,is_open,created_at')
    .single();

  if (error) return NextResponse.json({ ok: false, message: `予約枠の作成に失敗しました: ${error.message}` }, { status: 400 });
  return NextResponse.json({ ok: true, slot: data });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const body = await request.json().catch(() => ({})) as SlotBody;
  const id = body.id?.trim();
  if (!id || !uuidPattern.test(id)) return NextResponse.json({ ok: false, message: '予約枠IDが不正です。' }, { status: 400 });

  const updatePayload: { menu_id?: string; starts_at?: string; ends_at?: string; capacity?: number; is_open?: boolean } = {};
  if (body.menuId !== undefined) {
    const menuId = body.menuId?.trim();
    if (!menuId || !uuidPattern.test(menuId)) return NextResponse.json({ ok: false, message: 'メニューを正しく選択してください。' }, { status: 400 });
    updatePayload.menu_id = menuId;
  }
  if (body.capacity !== undefined) {
    const capacity = normalizeCapacity(body.capacity);
    if (!capacity) return NextResponse.json({ ok: false, message: '定員は1〜99名で入力してください。' }, { status: 400 });
    updatePayload.capacity = capacity;
  }
  if (typeof body.isOpen === 'boolean') updatePayload.is_open = body.isOpen;
  if (body.date && body.time) {
    const duration = normalizeDuration(body.durationMinutes);
    if (!duration) return NextResponse.json({ ok: false, message: '時間は5〜240分で入力してください。' }, { status: 400 });
    const startsAt = toLocalDateTimeIso(body.date, body.time);
    updatePayload.starts_at = startsAt;
    updatePayload.ends_at = new Date(new Date(startsAt).getTime() + duration * 60 * 1000).toISOString();
  }

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data, error } = await serviceClient
    .from('reservation_slots')
    .update(updatePayload)
    .eq('id', id)
    .select('id,menu_id,starts_at,ends_at,capacity,is_open,created_at')
    .single();

  if (error) return NextResponse.json({ ok: false, message: `予約枠の更新に失敗しました: ${error.message}` }, { status: 400 });
  return NextResponse.json({ ok: true, slot: data });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id || !uuidPattern.test(id)) return NextResponse.json({ ok: false, message: '予約枠IDが不正です。' }, { status: 400 });

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data: reservations, error: reservationsError } = await serviceClient.from('reservations').select('id').eq('reservation_slot_id', id).limit(1);
  if (reservationsError) return NextResponse.json({ ok: false, message: `予約確認に失敗しました: ${reservationsError.message}` }, { status: 400 });

  if ((reservations ?? []).length > 0) {
    const { data, error } = await serviceClient
      .from('reservation_slots')
      .update({ is_open: false })
      .eq('id', id)
      .select('id,menu_id,starts_at,ends_at,capacity,is_open,created_at')
      .single();
    if (error) return NextResponse.json({ ok: false, message: `予約済み枠の停止に失敗しました: ${error.message}` }, { status: 400 });
    return NextResponse.json({ ok: true, slot: data, deleted: false, message: '予約があるため削除ではなく受付停止にしました。' });
  }

  const { error } = await serviceClient.from('reservation_slots').delete().eq('id', id);
  if (error) return NextResponse.json({ ok: false, message: `予約枠の削除に失敗しました: ${error.message}` }, { status: 400 });
  return NextResponse.json({ ok: true, deleted: true });
}
