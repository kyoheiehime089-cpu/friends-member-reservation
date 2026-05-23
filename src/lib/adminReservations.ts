import type { SupabaseClient } from '@supabase/supabase-js';
import { uuidPattern } from '@/lib/adminServer';
import { effectiveCapacity, effectiveDefaultCapacity } from '@/lib/effectiveCapacity';
import { effectiveBookedReservations, type ReservationStateRow } from '@/lib/reservationState';

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

async function menuNameById(db: SupabaseClient, menuId: string | null | undefined) {
  if (!menuId) return { name: '', defaultCapacity: 5 };
  const { data, error } = await db.from('menus').select('name,default_capacity').eq('id', menuId).maybeSingle();
  if (error) throw new Error(`メニュー情報の取得に失敗しました: ${error.message}`);
  return { name: String(data?.name ?? ''), defaultCapacity: Number(data?.default_capacity ?? 5) };
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
  const menu = await menuNameById(db, menuId);
  const minutes = normalizePositiveNumber(body.minutes, 40, 5, 240);
  const requestedCapacity = normalizePositiveNumber(body.capacity, menu.defaultCapacity || 5, 1, 99);
  const capacity = effectiveDefaultCapacity(menu.name, requestedCapacity);
  const endsAt = new Date(new Date(startsAt).getTime() + minutes * 60000).toISOString();
  const { data: createdSlot, error: createError } = await db
    .from('reservation_slots')
    .insert({ store_id: storeId, menu_id: menuId, starts_at: startsAt, ends_at: endsAt, capacity, is_open: true })
    .select('id')
    .single();
  if (createError) throw new Error(`予約枠の作成に失敗しました: ${createError.message}`);
  return createdSlot.id as string;
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

async function insertCancellationMarker(db: SupabaseClient, slotId: string, memberId: string, adminId: string) {
  const payloadWithAudit = {
    reservation_slot_id: slotId,
    member_id: memberId,
    status: 'cancelled',
    created_by: adminId,
    cancelled_by: adminId,
    cancelled_at: new Date().toISOString()
  };
  const first = await db.from('reservations').insert(payloadWithAudit).select('id').single();
  if (!first.error) return first.data.id as string;

  const canFallback = isMissingColumnError(first.error, 'created_by') || isMissingColumnError(first.error, 'cancelled_by') || isMissingColumnError(first.error, 'cancelled_at');
  if (!canFallback) return null;

  const fallback = await db.from('reservations').insert({ reservation_slot_id: slotId, member_id: memberId, status: 'cancelled' }).select('id').single();
  return fallback.error ? null : fallback.data.id as string;
}

async function slotReservations(db: SupabaseClient, slotId: string) {
  const { data, error } = await db
    .from('reservations')
    .select('id,reservation_slot_id,member_id,status,created_at')
    .eq('reservation_slot_id', slotId);
  if (error) throw new Error(`予約状況の確認に失敗しました: ${error.message}`);
  return (data ?? []) as ReservationStateRow[];
}

export async function bookAdminReservation(db: SupabaseClient, body: AdminReservationBody, adminId: string): Promise<ReservationWriteResult> {
  const memberId = body.memberId?.trim();
  if (!memberId || !uuidPattern.test(memberId)) throw new Error('会員を選択してください。');

  const slotId = await ensureAdminReservationSlot(db, body);
  const { data: slot, error: slotError } = await db.from('reservation_slots').select('id,capacity,is_open,starts_at,menu_id').eq('id', slotId).maybeSingle();
  if (slotError) throw new Error(`予約枠の取得に失敗しました: ${slotError.message}`);
  if (!slot) throw new Error('予約枠が見つかりません。');
  if (slot.is_open === false) throw new Error('この枠は受付停止中です。');

  const menu = await menuNameById(db, slot.menu_id as string | null | undefined);
  const capacity = effectiveCapacity(menu.name, Number(slot.capacity ?? 0));

  const { data: member, error: memberError } = await db.from('members').select('id,full_name,email').eq('id', memberId).maybeSingle();
  if (memberError) throw new Error(`会員情報の取得に失敗しました: ${memberError.message}`);
  if (!member) throw new Error('会員が見つかりません。');

  const rows = await slotReservations(db, slotId);
  const effectiveBooked = effectiveBookedReservations(rows);
  if (effectiveBooked.some((row) => row.member_id === memberId)) {
    throw new Error('この会員はすでにこの枠を予約済みです。別の会員を選択してください。');
  }
  if (effectiveBooked.length >= capacity) throw new Error('この枠は満席です。');

  // 既存のcancelled行を再利用するとcreated_atが古いまま残り、後から表示判定が崩れるため、再予約は必ず新規booked行として作る。
  const reservationId = await insertReservation(db, slotId, memberId, adminId);
  return { reservationId, slotId, memberLabel: String(member.full_name || member.email || '会員') };
}

export async function cancelAdminReservation(db: SupabaseClient, reservationId: string, adminId: string) {
  if (!reservationId || !uuidPattern.test(reservationId)) throw new Error('reservationId が不正です。');

  const { data: before, error: beforeError } = await db
    .from('reservations')
    .select('id,reservation_slot_id,member_id,status')
    .eq('id', reservationId)
    .maybeSingle();
  if (beforeError) throw new Error(`キャンセル対象の確認に失敗しました: ${beforeError.message}`);
  if (!before) throw new Error('キャンセル対象の予約が見つかりません。');
  if (!before.reservation_slot_id || !before.member_id) throw new Error('キャンセル対象の予約情報が不足しています。');

  const { data: slot, error: slotError } = await db
    .from('reservation_slots')
    .select('id,menu_id,starts_at')
    .eq('id', before.reservation_slot_id)
    .maybeSingle();
  if (slotError) throw new Error(`キャンセル対象枠の確認に失敗しました: ${slotError.message}`);
  if (!slot?.menu_id || !slot?.starts_at) throw new Error('キャンセル対象枠の情報が不足しています。');

  const logicalSlot = {
    member_id: before.member_id as string,
    menu_id: slot.menu_id as string,
    starts_at: slot.starts_at as string,
  };
  const logicalSlotKey = `${logicalSlot.member_id}:${logicalSlot.menu_id}:${logicalSlot.starts_at}`;

  const { data: logicalSlots, error: logicalSlotError } = await db
    .from('reservation_slots')
    .select('id')
    .eq('menu_id', logicalSlot.menu_id)
    .eq('starts_at', logicalSlot.starts_at);
  if (logicalSlotError) throw new Error(`論理予約枠の取得に失敗しました: ${logicalSlotError.message}`);
  const logicalSlotIds = (logicalSlots ?? []).map((row) => String(row.id)).filter(Boolean);
  if (logicalSlotIds.length === 0) throw new Error('同一メニュー・同一開始時刻の予約枠が見つかりません。');

  const first = await db
    .from('reservations')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: adminId })
    .in('reservation_slot_id', logicalSlotIds)
    .eq('member_id', logicalSlot.member_id)
    .eq('status', 'booked')
    .select('id,status,reservation_slot_id,member_id');

  let cancelledRows = first.data ?? [];
  if (first.error) {
    if (!isMissingColumnError(first.error, 'cancelled_at') && !isMissingColumnError(first.error, 'cancelled_by')) {
      throw new Error(`キャンセル処理に失敗しました: ${first.error.message}`);
    }
    const fallback = await db
      .from('reservations')
      .update({ status: 'cancelled' })
      .in('reservation_slot_id', logicalSlotIds)
      .eq('member_id', logicalSlot.member_id)
      .eq('status', 'booked')
      .select('id,status,reservation_slot_id,member_id');
    if (fallback.error) throw new Error(`キャンセル処理に失敗しました: ${fallback.error.message}`);
    cancelledRows = fallback.data ?? [];
  }

  await insertCancellationMarker(db, before.reservation_slot_id, before.member_id, adminId);

  const { count, error: verifyError } = await db
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .in('reservation_slot_id', logicalSlotIds)
    .eq('member_id', logicalSlot.member_id)
    .eq('status', 'booked');
  if (verifyError) throw new Error(`キャンセル後の確認に失敗しました: ${verifyError.message}`);
  if ((count ?? 0) > 0) throw new Error('キャンセル後も予約済みデータが残っています。もう一度お試しください。');

  const cancelledReservationIds = cancelledRows.map((row) => String(row.id)).filter(Boolean);

  return {
    id: reservationId,
    status: 'cancelled',
    reservation_slot_id: before.reservation_slot_id,
    member_id: before.member_id,
    cancelledReservationIds,
    cancelledCount: cancelledReservationIds.length,
    logicalSlotKey,
    logicalSlot,
  };
}
