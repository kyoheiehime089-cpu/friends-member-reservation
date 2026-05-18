import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin } from '@/lib/adminServer';
import { cancelAdminReservation } from '@/lib/adminReservations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { reservationId?: string };

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config || !admin.adminId) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const body = await request.json().catch(() => ({})) as Body;
  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  try {
    const reservation = await cancelAdminReservation(db, body.reservationId?.trim() ?? '', admin.adminId);
    if (reservation.status !== 'cancelled') return NextResponse.json({ ok: false, message: 'キャンセル状態に更新できませんでした。' }, { status: 400 });

    // 管理カレンダーでは「キャンセル＝枠から消える」を最優先にする。
    // 既存DBの重複bookedやトリガーの影響で再表示されないよう、同じ枠・同じ会員の予約行を物理削除する。
    if (reservation.reservation_slot_id && reservation.member_id) {
      const deleteSame = await db
        .from('reservations')
        .delete()
        .eq('reservation_slot_id', reservation.reservation_slot_id)
        .eq('member_id', reservation.member_id);
      if (deleteSame.error) throw new Error(`予約削除に失敗しました: ${deleteSame.error.message}`);
    } else if (body.reservationId) {
      const deleteOne = await db.from('reservations').delete().eq('id', body.reservationId);
      if (deleteOne.error) throw new Error(`予約削除に失敗しました: ${deleteOne.error.message}`);
    }

    return NextResponse.json({ ok: true, reservation, deleted: true, message: '予約をキャンセルしました。' });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'キャンセル処理に失敗しました。' }, { status: 400 });
  }
}
