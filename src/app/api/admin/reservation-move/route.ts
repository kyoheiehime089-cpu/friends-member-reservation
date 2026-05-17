import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { reservationId?: string; slotId?: string };

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  }

  const body = await request.json().catch(() => ({})) as Body;
  const reservationId = body.reservationId?.trim();
  const slotId = body.slotId?.trim();
  if (!reservationId || !uuidPattern.test(reservationId)) {
    return NextResponse.json({ ok: false, message: '予約IDが不正です。' }, { status: 400 });
  }
  if (!slotId || !uuidPattern.test(slotId)) {
    return NextResponse.json({ ok: false, message: '変更先の予約枠を選択してください。' }, { status: 400 });
  }

  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data: slot, error: slotError } = await db
    .from('reservation_slots')
    .select('id,capacity,is_open,starts_at')
    .eq('id', slotId)
    .single();
  if (slotError || !slot) {
    return NextResponse.json({ ok: false, message: '変更先の予約枠が見つかりません。' }, { status: 404 });
  }
  if (slot.is_open === false) {
    return NextResponse.json({ ok: false, message: '変更先の予約枠は受付停止中です。' }, { status: 400 });
  }

  const start = new Date(slot.starts_at ?? '');
  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) {
    return NextResponse.json({ ok: false, message: '過去の予約枠には変更できません。' }, { status: 400 });
  }

  const { count, error: countError } = await db
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('reservation_slot_id', slotId)
    .eq('status', 'booked');
  if (countError) {
    return NextResponse.json({ ok: false, message: `残席確認に失敗しました: ${countError.message}` }, { status: 400 });
  }

  const capacity = Number(slot.capacity ?? 0);
  if (capacity > 0 && (count ?? 0) >= capacity) {
    return NextResponse.json({ ok: false, message: '変更先の予約枠は満席です。' }, { status: 400 });
  }

  const { data, error } = await db
    .from('reservations')
    .update({ reservation_slot_id: slotId })
    .eq('id', reservationId)
    .select('id,reservation_slot_id,status')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, message: `日程変更に失敗しました: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, reservation: data, message: '予約日程を変更しました。' });
}
