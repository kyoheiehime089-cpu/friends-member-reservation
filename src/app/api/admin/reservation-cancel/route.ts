import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';
import { cancelAdminReservation } from '@/lib/adminReservations';
import { shouldKeepEmptySlot } from '@/lib/yogaSchedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { reservationId?: string; slotId?: string | null; memberId?: string | null };

async function markSlotClosedIfEmptyOneOff(db: ReturnType<typeof createServiceClient>, slotId?: string | null) {
  const safeSlotId = slotId?.trim();
  if (!safeSlotId || !uuidPattern.test(safeSlotId)) return null;

  const { count, error: countError } = await db
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('reservation_slot_id', safeSlotId)
    .eq('status', 'booked');
  if (countError) throw new Error(`slot check failed: ${countError.message}`);
  if ((count ?? 0) > 0) return null;

  const { data: slot, error: slotError } = await db
    .from('reservation_slots')
    .select('id,menu_id,menus(name)')
    .eq('id', safeSlotId)
    .maybeSingle();
  if (slotError) throw new Error(`slot load failed: ${slotError.message}`);
  if (!slot) return null;

  const joinedMenu = slot.menus as { name?: string | null } | { name?: string | null }[] | null;
  const menuName = Array.isArray(joinedMenu) ? String(joinedMenu[0]?.name ?? '') : String(joinedMenu?.name ?? '');
  if (shouldKeepEmptySlot(menuName)) return null;

  const closeResult = await db.from('reservation_slots').update({ is_open: false }).eq('id', safeSlotId);
  if (closeResult.error) throw new Error(`slot close failed: ${closeResult.error.message}`);
  return safeSlotId;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config || !admin.adminId) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const body = await request.json().catch(() => ({})) as Body;
  const reservationId = body.reservationId?.trim();
  if (!reservationId || !uuidPattern.test(reservationId)) {
    return NextResponse.json({ ok: false, message: 'キャンセル対象の予約IDが不正です。画面を更新してからもう一度お試しください。' }, { status: 400 });
  }

  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  try {
    const reservation = await cancelAdminReservation(db, reservationId, admin.adminId);
    const deletedSlotId = await markSlotClosedIfEmptyOneOff(db, reservation.reservation_slot_id);
    return NextResponse.json({ ok: true, reservation, deleted: true, deletedSlotId, message: '予約をキャンセルしました。' });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'キャンセル処理に失敗しました。' }, { status: 400 });
  }
}
