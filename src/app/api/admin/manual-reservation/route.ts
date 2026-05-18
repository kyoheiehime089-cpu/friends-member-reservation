import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  memberId?: string;
  slotId?: string;
  menuId?: string;
  date?: string;
  time?: string;
  capacity?: number;
  minutes?: number;
};

function normalizePositiveNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(Math.max(Math.floor(numberValue), min), max);
}

function localIso(date?: string, time?: string) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const value = `${date}T${time}:00+09:00`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

async function ensureSlot(db: ReturnType<typeof createServiceClient>, body: Body) {
  const slotId = body.slotId?.trim();
  if (slotId && uuidPattern.test(slotId)) return slotId;

  const menuId = body.menuId?.trim();
  if (!menuId || !uuidPattern.test(menuId)) throw new Error('メニューを選択してください。');
  const startsAt = localIso(body.date, body.time);
  if (!startsAt) throw new Error('日付と時間を正しく選択してください。');

  const { data: existingSlot, error: existingError } = await db
    .from('reservation_slots')
    .select('id')
    .eq('menu_id', menuId)
    .eq('starts_at', startsAt)
    .maybeSingle();
  if (existingError) throw new Error(`予約枠の確認に失敗しました: ${existingError.message}`);
  if (existingSlot?.id) return existingSlot.id as string;

  const { data: storeRows, error: storeError } = await db.from('stores').select('id').order('created_at', { ascending: true }).limit(1);
  if (storeError || !storeRows?.[0]?.id) throw new Error(`店舗情報の取得に失敗しました: ${storeError?.message ?? '店舗が見つかりません'}`);

  const minutes = normalizePositiveNumber(body.minutes, 40, 5, 240);
  const capacity = normalizePositiveNumber(body.capacity, 5, 1, 99);
  const endsAt = new Date(new Date(startsAt).getTime() + minutes * 60000).toISOString();
  const { data: createdSlot, error: createError } = await db
    .from('reservation_slots')
    .insert({ store_id: storeRows[0].id, menu_id: menuId, starts_at: startsAt, ends_at: endsAt, capacity, is_open: true })
    .select('id')
    .single();
  if (createError) throw new Error(`予約枠の作成に失敗しました: ${createError.message}`);
  return createdSlot.id as string;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  const body = await request.json().catch(() => ({})) as Body;
  const memberId = body.memberId?.trim();
  if (!memberId || !uuidPattern.test(memberId)) return NextResponse.json({ ok: false, message: '会員を選択してください。' }, { status: 400 });

  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  let slotId = '';
  try {
    slotId = await ensureSlot(db, body);
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : '予約枠を選択してください。' }, { status: 400 });
  }

  const { data: slot } = await db.from('reservation_slots').select('id,capacity,is_open,starts_at').eq('id', slotId).maybeSingle();
  if (!slot) return NextResponse.json({ ok: false, message: '予約枠が見つかりません。' }, { status: 404 });
  if (slot.is_open === false) return NextResponse.json({ ok: false, message: 'この枠は受付停止中です。' }, { status: 400 });

  const { data: member } = await db.from('members').select('id,full_name,email').eq('id', memberId).maybeSingle();
  if (!member) return NextResponse.json({ ok: false, message: '会員が見つかりません。' }, { status: 404 });

  const { data: existing } = await db.from('reservations').select('id,status').eq('reservation_slot_id', slotId).eq('member_id', memberId).maybeSingle();
  if (existing?.status === 'booked') return NextResponse.json({ ok: false, message: 'この会員はすでにこの枠を予約済みです。' }, { status: 409 });

  const { data: booked } = await db.from('reservations').select('id').eq('reservation_slot_id', slotId).eq('status', 'booked');
  if ((booked?.length ?? 0) >= slot.capacity) return NextResponse.json({ ok: false, message: 'この枠は満席です。' }, { status: 409 });

  if (existing) {
    const { data, error } = await db.from('reservations').update({ status: 'booked', cancelled_at: null, cancelled_by: null, created_by: admin.adminId }).eq('id', existing.id).select('id').single();
    if (error) return NextResponse.json({ ok: false, message: `予約に失敗しました: ${error.message}` }, { status: 400 });
    return NextResponse.json({ ok: true, reservationId: data.id, slotId, message: `${member.full_name || member.email || '会員'}さんの予約を入れました。` });
  }

  const { data, error } = await db.from('reservations').insert({ reservation_slot_id: slotId, member_id: memberId, status: 'booked', created_by: admin.adminId }).select('id').single();
  if (error) return NextResponse.json({ ok: false, message: `予約に失敗しました: ${error.message}` }, { status: 400 });
  return NextResponse.json({ ok: true, reservationId: data.id, slotId, message: `${member.full_name || member.email || '会員'}さんの予約を入れました。` });
}
