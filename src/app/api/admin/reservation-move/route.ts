import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { reservationId?: string; slotId?: string; targetSlotId?: string };

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const body = await request.json().catch(() => ({})) as Body;
  const reservationId = body.reservationId?.trim();
  const slotId = (body.targetSlotId || body.slotId)?.trim();
  if (!reservationId || !uuidPattern.test(reservationId)) return NextResponse.json({ ok: false, message: '予約IDが不正です。' }, { status: 400 });
  if (!slotId || !uuidPattern.test(slotId)) return NextResponse.json({ ok: false, message: '変更先の予約枠を選択してください。' }, { status: 400 });

  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data: reservation, error: reservationError } = await db.from('reservations').select('id,member_id,status,reservation_slot_id').eq('id', reservationId).maybeSingle();
  if (reservationError || !reservation || reservation.status === 'cancelled') return NextResponse.json({ ok: false, message: '移動できる予約が見つかりません。' }, { status: 404 });

  const { data: slot, error: slotError } = await db.from('reservation_slots').select('id,capacity,is_open,starts_at').eq('id', slotId).single();
  if (slotError || !slot) return NextResponse.json({ ok: false, message: '変更先の予約枠が見つかりません。' }, { status: 404 });
  if (slot.is_open === false) return NextResponse.json({ ok: false, message: '変更先の予約枠は受付停止中です。' }, { status: 400 });

  const { data: duplicate } = await db.from('reservations').select('id,status').eq('reservation_slot_id', slotId).eq('member_id', reservation.member_id).neq('id', reservationId).maybeSingle();
  if (duplicate?.status === 'booked') return NextResponse.json({ ok: false, message: 'この会員は変更先の枠をすでに予約済みです。' }, { status: 409 });
  if (duplicate?.id) await db.from('reservations').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: admin.adminId }).eq('id', duplicate.id);

  const { count, error: countError } = await db.from('reservations').select('id', { count: 'exact', head: true }).eq('reservation_slot_id', slotId).eq('status', 'booked').neq('id', reservationId);
  if (countError) return NextResponse.json({ ok: false, message: `残席確認に失敗しました: ${countError.message}` }, { status: 400 });
  if (Number(slot.capacity ?? 0) > 0 && (count ?? 0) >= Number(slot.capacity ?? 0)) return NextResponse.json({ ok: false, message: '変更先の予約枠は満席です。' }, { status: 400 });

  const { data, error } = await db
    .from('reservations')
    .update({ reservation_slot_id: slotId, status: 'booked', cancelled_at: null, cancelled_by: null, created_by: admin.adminId })
    .eq('id', reservationId)
    .select('id,reservation_slot_id,status')
    .single();

  if (error) return NextResponse.json({ ok: false, message: `日程変更に失敗しました: ${error.message}` }, { status: 400 });
  return NextResponse.json({ ok: true, reservation: data, message: '予約日程を変更しました。' });
}
