import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  id?: string;
  menuId?: string;
  date?: string;
  time?: string;
  minutes?: number;
  capacity?: number;
  isOpen?: boolean;
};

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

function localIso(date?: string, time?: string) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const value = `${date}T${time}:00+09:00`;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

async function firstStoreId(db: ReturnType<typeof createServiceClient>) {
  const { data, error } = await db.from('stores').select('id').order('created_at', { ascending: true }).limit(1);
  if (error) throw new Error(`店舗情報の取得に失敗しました: ${error.message}`);
  if (data?.[0]?.id) return data[0].id as string;
  const created = await db.from('stores').insert({ name: 'friends 行徳' }).select('id').single();
  if (created.error) throw new Error(`店舗情報の作成に失敗しました: ${created.error.message}`);
  return created.data.id as string;
}

function slotPayload(body: Body) {
  const menuId = body.menuId?.trim();
  if (!menuId || !uuidPattern.test(menuId)) throw new Error('メニューを選択してください。');
  const startsAt = localIso(body.date, body.time);
  if (!startsAt) throw new Error('日付と時間を正しく入力してください。');
  const minutes = numberInRange(body.minutes, 40, 5, 240);
  const capacity = numberInRange(body.capacity, 5, 1, 99);
  return {
    menu_id: menuId,
    starts_at: startsAt,
    ends_at: new Date(new Date(startsAt).getTime() + minutes * 60000).toISOString(),
    capacity,
    is_open: body.isOpen !== false,
    updated_at: new Date().toISOString()
  };
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  const body = await request.json().catch(() => ({})) as Body;
  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);

  try {
    const storeId = await firstStoreId(db);
    const payload = slotPayload(body);
    const { data, error } = await db.from('reservation_slots').insert({ store_id: storeId, ...payload }).select('id').single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, slot: data, message: '予約枠を作成しました。' });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : '予約枠の作成に失敗しました。' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  const body = await request.json().catch(() => ({})) as Body;
  const id = body.id?.trim();
  if (!id || !uuidPattern.test(id)) return NextResponse.json({ ok: false, message: '予約枠IDが不正です。' }, { status: 400 });
  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);

  try {
    const payload = slotPayload(body);
    const { data, error } = await db.from('reservation_slots').update(payload).eq('id', id).select('id').single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, slot: data, message: '予約枠を保存しました。' });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : '予約枠の保存に失敗しました。' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  const body = await request.json().catch(() => ({})) as { id?: string };
  const id = body.id?.trim();
  if (!id || !uuidPattern.test(id)) return NextResponse.json({ ok: false, message: '予約枠IDが不正です。' }, { status: 400 });

  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { count, error: countError } = await db.from('reservations').select('id', { count: 'exact', head: true }).eq('reservation_slot_id', id).eq('status', 'booked');
  if (countError) return NextResponse.json({ ok: false, message: `予約数の確認に失敗しました: ${countError.message}` }, { status: 400 });

  const result = (count ?? 0) > 0
    ? await db.from('reservation_slots').update({ is_open: false, updated_at: new Date().toISOString() }).eq('id', id).select('id').single()
    : await db.from('reservation_slots').delete().eq('id', id).select('id').single();
  if (result.error) return NextResponse.json({ ok: false, message: `予約枠の削除に失敗しました: ${result.error.message}` }, { status: 400 });
  return NextResponse.json({ ok: true, message: (count ?? 0) > 0 ? '予約があるため受付停止にしました。' : '予約枠を削除しました。' });
}
