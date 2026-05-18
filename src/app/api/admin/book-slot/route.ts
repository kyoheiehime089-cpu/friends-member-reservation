import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { memberId?: string; slotId?: string };

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const body = await request.json().catch(() => ({})) as Body;
  const memberId = body.memberId?.trim();
  const slotId = body.slotId?.trim();
  if (!memberId || !uuidPattern.test(memberId)) return NextResponse.json({ ok: false, message: '会員を選択してください。' }, { status: 400 });
  if (!slotId || !uuidPattern.test(slotId)) return NextResponse.json({ ok: false, message: '予約枠を選択してください。' }, { status: 400 });

  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data: member, error: memberError } = await db.from('members').select('id,full_name,email').eq('id', memberId).maybeSingle();
  if (memberError || !member) return NextResponse.json({ ok: false, message: memberError?.message ?? '会員が見つかりません。' }, { status: 404 });

  const { data: slot, error: slotError } = await db.from('reservation_slots').select('id,capacity,is_open').eq('id', slotId).maybeSingle();
  if (slotError || !slot) return NextResponse.json({ ok: false, message: slotError?.message ?? '予約枠が見つかりません。' }, { status: 404 });
  if (slot.is_open === false) return NextResponse.json({ ok: false, message: 'この枠は受付停止中です。' }, { status: 400 });

  const { data: existing, error: existingError } = await db.from('reservations').select('id,status').eq('reservation_slot_id', slotId).eq('member_id', memberId).maybeSingle();
  if (existingError) return NextResponse.json({ ok: false, message: `予約確認に失敗しました: ${existingError.message}` }, { status: 400 });
  if (existing?.status === 'booked') return NextResponse.json({ ok: false, message: 'この会員はすでにこの枠を予約済みです。' }, { status: 409 });

  const { count, error: countError } = await db.from('reservations').select('id', { count: 'exact', head: true }).eq('reservation_slot_id', slotId).eq('status', 'booked');
  if (countError) return NextResponse.json({ ok: false, message: `残席確認に失敗しました: ${countError.message}` }, { status: 400 });
  if ((count ?? 0) >= Number(slot.capacity ?? 0)) return NextResponse.json({ ok: false, message: 'この枠は満席です。' }, { status: 409 });

  if (existing?.id) {
    const { data, error } = await db.from('reservations').update({ status: 'booked', cancelled_at: null, cancelled_by: null, created_by: admin.adminId }).eq('id', existing.id).select('id').single();
    if (error) return NextResponse.json({ ok: false, message: `予約保存に失敗しました: ${error.message}` }, { status: 400 });
    return NextResponse.json({ ok: true, reservationId: data.id, message: `${member.full_name || member.email || '会員'}さんの予約を入れました。` });
  }

  const { data, error } = await db.from('reservations').insert({ reservation_slot_id: slotId, member_id: memberId, status: 'booked', created_by: admin.adminId }).select('id').single();
  if (error) return NextResponse.json({ ok: false, message: `予約保存に失敗しました: ${error.message}` }, { status: 400 });
  return NextResponse.json({ ok: true, reservationId: data.id, message: `${member.full_name || member.email || '会員'}さんの予約を入れました。` });
}
