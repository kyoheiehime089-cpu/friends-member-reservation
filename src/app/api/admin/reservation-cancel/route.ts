import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';
import { cancelAdminReservation } from '@/lib/adminReservations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { reservationId?: string; slotId?: string | null; memberId?: string | null };

async function deleteBySlotAndMember(db: ReturnType<typeof createServiceClient>, slotId?: string | null, memberId?: string | null) {
  const safeSlotId = slotId?.trim();
  const safeMemberId = memberId?.trim();
  if (!safeSlotId || !safeMemberId || !uuidPattern.test(safeSlotId) || !uuidPattern.test(safeMemberId)) return null;

  const { data: rows, error: selectError } = await db
    .from('reservations')
    .select('id,reservation_slot_id,member_id,status')
    .eq('reservation_slot_id', safeSlotId)
    .eq('member_id', safeMemberId);
  if (selectError) throw new Error(`キャンセル対象の確認に失敗しました: ${selectError.message}`);

  const deleteResult = await db
    .from('reservations')
    .delete()
    .eq('reservation_slot_id', safeSlotId)
    .eq('member_id', safeMemberId);
  if (deleteResult.error) throw new Error(`予約削除に失敗しました: ${deleteResult.error.message}`);

  return {
    id: rows?.[0]?.id ?? null,
    status: 'cancelled',
    reservation_slot_id: safeSlotId,
    member_id: safeMemberId,
    deleted_count: rows?.length ?? 0
  };
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config || !admin.adminId) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const body = await request.json().catch(() => ({})) as Body;
  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  try {
    const reservationId = body.reservationId?.trim() ?? '';

    if (!reservationId || !uuidPattern.test(reservationId)) {
      const fallback = await deleteBySlotAndMember(db, body.slotId, body.memberId);
      if (!fallback) return NextResponse.json({ ok: false, message: 'キャンセルに必要な予約情報が足りません。画面を更新してからもう一度お試しください。' }, { status: 400 });
      return NextResponse.json({ ok: true, reservation: fallback, deleted: true, message: '予約をキャンセルしました。' });
    }

    let reservation: Awaited<ReturnType<typeof cancelAdminReservation>> | null = null;
    try {
      reservation = await cancelAdminReservation(db, reservationId, admin.adminId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!message.includes('見つかりません')) throw error;
      const fallback = await deleteBySlotAndMember(db, body.slotId, body.memberId);
      if (!fallback) throw error;
      return NextResponse.json({ ok: true, reservation: fallback, deleted: true, message: '予約をキャンセルしました。' });
    }

    if (reservation.status !== 'cancelled') return NextResponse.json({ ok: false, message: 'キャンセル状態に更新できませんでした。' }, { status: 400 });

    if (reservation.reservation_slot_id && reservation.member_id) {
      const deleteSame = await db
        .from('reservations')
        .delete()
        .eq('reservation_slot_id', reservation.reservation_slot_id)
        .eq('member_id', reservation.member_id);
      if (deleteSame.error) throw new Error(`予約削除に失敗しました: ${deleteSame.error.message}`);
    } else {
      const deleteOne = await db.from('reservations').delete().eq('id', reservationId);
      if (deleteOne.error) throw new Error(`予約削除に失敗しました: ${deleteOne.error.message}`);
    }

    return NextResponse.json({ ok: true, reservation, deleted: true, message: '予約をキャンセルしました。' });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'キャンセル処理に失敗しました。' }, { status: 400 });
  }
}
