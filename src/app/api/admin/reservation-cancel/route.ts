import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';
import { shouldKeepEmptySlot } from '@/lib/yogaSchedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { reservationId?: string; slotId?: string | null; memberId?: string | null };

type CancelledReservation = {
  id?: string | null;
  status: 'cancelled';
  reservation_slot_id?: string | null;
  member_id?: string | null;
  removed_count?: number;
};

async function findByReservationId(db: ReturnType<typeof createServiceClient>, reservationId?: string | null) {
  const safeReservationId = reservationId?.trim();
  if (!safeReservationId || !uuidPattern.test(safeReservationId)) return null;
  const { data, error } = await db
    .from('reservations')
    .select('id,reservation_slot_id,member_id,status')
    .eq('id', safeReservationId)
    .maybeSingle();
  if (error) throw new Error(`キャンセル対象の確認に失敗しました: ${error.message}`);
  return data as { id: string; reservation_slot_id: string | null; member_id: string | null; status: string | null } | null;
}

async function removeReservations(db: ReturnType<typeof createServiceClient>, reservationId?: string | null, slotId?: string | null, memberId?: string | null) {
  const safeReservationId = reservationId?.trim() || null;
  let safeSlotId = slotId?.trim() || null;
  let safeMemberId = memberId?.trim() || null;
  let foundId: string | null = null;

  if ((!safeSlotId || !safeMemberId) && safeReservationId) {
    const row = await findByReservationId(db, safeReservationId);
    if (row) {
      foundId = row.id;
      safeSlotId = safeSlotId || row.reservation_slot_id;
      safeMemberId = safeMemberId || row.member_id;
    }
  }

  if (safeSlotId && safeMemberId && uuidPattern.test(safeSlotId) && uuidPattern.test(safeMemberId)) {
    const { data: rows, error: selectError } = await db
      .from('reservations')
      .select('id,reservation_slot_id,member_id,status')
      .eq('reservation_slot_id', safeSlotId)
      .eq('member_id', safeMemberId);
    if (selectError) throw new Error(`キャンセル対象の確認に失敗しました: ${selectError.message}`);

    const mark = await db
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('reservation_slot_id', safeSlotId)
      .eq('member_id', safeMemberId);
    if (mark.error) throw new Error(`キャンセル処理に失敗しました: ${mark.error.message}`);

    // 物理削除できる環境では削除する。FK等で削除できなくても、booked が残っていなければ成功扱いにする。
    await db
      .from('reservations')
      .delete()
      .eq('reservation_slot_id', safeSlotId)
      .eq('member_id', safeMemberId);

    const { count, error: verifyError } = await db
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('reservation_slot_id', safeSlotId)
      .eq('member_id', safeMemberId)
      .eq('status', 'booked');
    if (verifyError) throw new Error(`キャンセル後の確認に失敗しました: ${verifyError.message}`);
    if ((count ?? 0) > 0) throw new Error('キャンセル後も予約済みデータが残っています。もう一度お試しください。');

    return {
      id: foundId || rows?.[0]?.id || safeReservationId,
      status: 'cancelled',
      reservation_slot_id: safeSlotId,
      member_id: safeMemberId,
      removed_count: rows?.length ?? 0
    } as CancelledReservation;
  }

  if (safeReservationId && uuidPattern.test(safeReservationId)) {
    const row = await findByReservationId(db, safeReservationId);
    const mark = await db.from('reservations').update({ status: 'cancelled' }).eq('id', safeReservationId);
    if (mark.error) throw new Error(`キャンセル処理に失敗しました: ${mark.error.message}`);
    await db.from('reservations').delete().eq('id', safeReservationId);
    const { count, error: verifyError } = await db.from('reservations').select('id', { count: 'exact', head: true }).eq('id', safeReservationId).eq('status', 'booked');
    if (verifyError) throw new Error(`キャンセル後の確認に失敗しました: ${verifyError.message}`);
    if ((count ?? 0) > 0) throw new Error('キャンセル後も予約済みデータが残っています。もう一度お試しください。');
    return {
      id: safeReservationId,
      status: 'cancelled',
      reservation_slot_id: row?.reservation_slot_id ?? null,
      member_id: row?.member_id ?? null,
      removed_count: row ? 1 : 0
    } as CancelledReservation;
  }

  return null;
}

async function markSlotClosedIfEmptyOneOff(db: ReturnType<typeof createServiceClient>, slotId?: string | null) {
  const safeSlotId = slotId?.trim();
  if (!safeSlotId || !uuidPattern.test(safeSlotId)) return null;

  const { count, error: countError } = await db
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('reservation_slot_id', safeSlotId)
    .eq('status', 'booked');
  if (countError) throw new Error(`予約枠の空き確認に失敗しました: ${countError.message}`);
  if ((count ?? 0) > 0) return null;

  const { data: slot, error: slotError } = await db
    .from('reservation_slots')
    .select('id,menu_id,menus(name)')
    .eq('id', safeSlotId)
    .maybeSingle();
  if (slotError) throw new Error(`予約枠情報の取得に失敗しました: ${slotError.message}`);
  if (!slot) return null;

  const joinedMenu = slot.menus as { name?: string | null } | { name?: string | null }[] | null;
  const menuName = Array.isArray(joinedMenu) ? String(joinedMenu[0]?.name ?? '') : String(joinedMenu?.name ?? '');
  if (shouldKeepEmptySlot(menuName)) return null;

  const closeResult = await db.from('reservation_slots').update({ is_open: false }).eq('id', safeSlotId);
  if (closeResult.error) throw new Error(`空の単発枠の受付停止に失敗しました: ${closeResult.error.message}`);
  return safeSlotId;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config || !admin.adminId) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const body = await request.json().catch(() => ({})) as Body;
  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  try {
    const reservation = await removeReservations(db, body.reservationId, body.slotId, body.memberId);
    if (!reservation) {
      return NextResponse.json({ ok: false, message: 'キャンセルに必要な予約情報が足りません。画面を更新してからもう一度お試しください。' }, { status: 400 });
    }
    const deletedSlotId = await markSlotClosedIfEmptyOneOff(db, reservation.reservation_slot_id);
    return NextResponse.json({ ok: true, reservation, deleted: true, deletedSlotId, message: '予約をキャンセルしました。' });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'キャンセル処理に失敗しました。' }, { status: 400 });
  }
}
