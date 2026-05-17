import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { reservationId?: string };

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  }

  const body = await request.json().catch(() => ({})) as Body;
  const reservationId = body.reservationId?.trim();
  if (!reservationId || !uuidPattern.test(reservationId)) {
    return NextResponse.json({ ok: false, message: 'reservationId が不正です。' }, { status: 400 });
  }

  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data, error } = await db
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', reservationId)
    .select('id,status')
    .single();

  if (error) {
    return NextResponse.json({ ok: false, message: `キャンセル処理に失敗しました: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, reservation: data, message: '予約をキャンセルしました。' });
}
