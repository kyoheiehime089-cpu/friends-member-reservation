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
    return NextResponse.json({ ok: true, reservation, message: '予約をキャンセルしました。' });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'キャンセル処理に失敗しました。' }, { status: 400 });
  }
}
