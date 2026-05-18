import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin } from '@/lib/adminServer';
import { bookAdminReservation, type AdminReservationBody } from '@/lib/adminReservations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = Pick<AdminReservationBody, 'memberId' | 'slotId'>;

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config || !admin.adminId) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const body = await request.json().catch(() => ({})) as Body;
  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  try {
    const result = await bookAdminReservation(db, body, admin.adminId);
    return NextResponse.json({ ok: true, reservationId: result.reservationId, slotId: result.slotId, message: `${result.memberLabel}さんの予約を入れました。` });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : '予約保存に失敗しました。' }, { status: 400 });
  }
}
