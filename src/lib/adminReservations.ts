import type { SupabaseClient } from '@supabase/supabase-js';
import { uuidPattern } from '@/lib/adminServer';

type MaybeError = { message?: string; code?: string } | null | undefined;

export type AdminReservationBody = {
  memberId?: string;
  slotId?: string;
  menuId?: string;
  date?: string;
  time?: string;
  capacity?: number;
  minutes?: number;
};

type ReservationWriteResult = {
  reservationId: string;
  slotId: string;
  memberLabel: string;
};

function isMissingColumnError(error: MaybeError, columnName: string) {
  const message = String(error?.message ?? '').toLowerCase();
  return message.includes(columnName.toLowerCase()) && (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find') ||
    message.includes('record "new" has no field')
  );
}

function normalizePositiveNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(Math.max(Math.floor(numberValue), min), max);
}

function localIso(date?: string, time?: string) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const value = `${date}T${time}:00+09:00`;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

async function firstStoreId(db: SupabaseClient) {
  const { data: storeRows, error: storeError } = await db.from('stores').select('id').order('created_at', { ascending: true }).limit(1);
  if (storeError || !storeRows?.[0]?.id) throw new Error(`店舗情報の取得に失敗しました: ${storeError?.message ?? '店舗が見つかりません'}`);
  return storeRows[0].id as string;
}

export async function ensureAdminReservationSlot(db: SupabaseClient, body: AdminReservationBody) {
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

  const storeId = await firstStoreId(db);
  const minutes = normalizePositiveNumber(body.minutes, 40, 5, 240);
  const capacity = normalizePositiveNumber(body.capacity, 5, 1, 99);
  const endsAt = new Date(new Date(startsAt).getTime() + minutes * 60000).toISOString();
  const { data: createdSlot, error: createError } = await db
    .from('reservation_slots')
    .insert({ store_id: storeId, menu_id: menuId, starts_at: startsAt, ends_at: endsAt, capacity, is_open: true })
    .select('id')
    .single();
  if (createError) throw new Error(`予約枠の作成に失敗しました: ${createError.message}`);
  return createdSlot.id as string;
}

async function updateReservationStatus(db: SupabaseClient, reservationId: string, adminId: string) {
  const payloadWithAudit = { status: 'booked', cancelled_at: null, cancelled_by: null, created_by: adminId };
  const first = await db.from('reservations').update(payloadWithAudit).eq('id', reservationId).select('id').single();
  if (!first.error) return first.data.id as string;
  if (!isMissingColumnError(first.error, 'created_by') && !isMissingColumnError(first.error, 'cancelled_by') && !isMissingColumnError(first.error, 'cancelled_at')) {
    throw new Error(`予約に失敗しました: ${first.error.message}`);
  }

  const fallback = await db.from('reservations').update({ status: 'booked' }).eq('id', reservationId).select('id').single();
  if (fallback.error) throw new Error(`予約に失敗しました: ${fallback.error.message}`);
  return fallback.data.id as string;
}

async function insertReservation(db: SupabaseClient, slotId: string, memberId: string, adminId: string) {
  const payloadWithAudit = { reservation_slot_id: slotId, member_id: memberId, status: 'booked', created_by: adminId };
  const first = await db.from('reservations').insert(payloadWithAudit).select('id').single();
  if (!first.error) return first.data.id as string;
  if (!isMissingColumnError(first.error, 'created_by')) throw new Error(`予約に失敗しました: ${first.error.message}`);

  const fallback = await db.from('reservations').insert({ reservation_slot_id: slotId, member_id: memberId, status: 'booked' }).select('id').single();
  if (fallback.error) throw new Error(`予約に失敗しました: ${fallback.error.message}`);
  return fallback.data.id as string;
}

export async function bookAdminReservation(db: SupabaseClient, body: AdminReservationBody, adminId: string): Promise<ReservationWriteResult> {
  const memberId = body.memberId?.trim();
  if (!memberId || !uuidPattern.test(memberId)) throw new Error('会員を選択してください。');

  const slotId = await ensureAdminReservationSlot(db, body);
  const { data: slot, error: slotError } = await db.from('reservation_slots').select('id,capacity,is_open,starts_at').eq('id', slotId).maybeSingle();
  if (slotError) throw new Error(`予約枠の取得に失敗しました: ${slotError.message}`);
  if (!slot) throw new Error('予約枠が見つかりません。');
  if (slot.is_open === false) throw new Error('この枠は受付停止中です。');

  const { data: member, error: memberError } = await db.from('members').select('id,full_name,email').eq('id', memberId).maybeSingle();
  if (memberError) throw new Error(`会員情報の取得に失敗しました: ${memberError.message}`);
  if (!member) throw new Error('会員が見つかりません。');

  const { data: existing, error: existingError } = await db.from('reservations').select('id,status').eq('reservation_slot_id', slotId).eq('member_id', memberId).maybeSingle();
  if (existingError) throw new Error(`予約確認に失敗しました: ${existingError.message}`);
  if (existing?.status === 'booked') throw new Error('この会員はすでにこの枠を予約済みです。');

  const { count, error: countError } = await db.from('reservations').select('id', { count: 'exact', head: true }).eq('reservation_slot_id', slotId).eq('status', 'booked');
  if (countError) throw new Error(`残席確認に失敗しました: ${countError.message}`);
  if ((count ?? 0) >= Number(slot.capacity ?? 0)) throw new Error('この枠は満席です。');

  const reservationId = existing?.id
    ? await updateReservationStatus(db, existing.id, adminId)
    : await insertReservation(db, slotId, memberId, adminId);

  return {
    reservationId,
    slotId,
    memberLabel: String(member.full_name || member.email || '会員')
  };
}

export async function cancelAdminReservation(db: SupabaseClient, reservationId: string, adminId: string) {
  if (!reservationId || !uuidPattern.test(reservationId)) throw new Error('reservationId が不正です。');

  const payloadWithAudit = { status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: adminId };
  const first = await db.from('reservations').update(payloadWithAudit).eq('id', reservationId).select('id,status,cancelled_at').single();
  if (!first.error) return first.data;
  if (!isMissingColumnError(first.error, 'cancelled_at') && !isMissingColumnError(first.error, 'cancelled_by')) {
    throw new Error(`キャンセル処理に失敗しました: ${first.error.message}`);
  }

  const fallback = await db.from('reservations').update({ status: 'cancelled' }).eq('id', reservationId).select('id,status').single();
  if (fallback.error) throw new Error(`キャンセル処理に失敗しました: ${fallback.error.message}`);
  return fallback.data;
}
