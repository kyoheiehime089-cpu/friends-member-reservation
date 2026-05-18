import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SlotRow = {
  id: string;
  store_id: string | null;
  starts_at: string;
  capacity: number;
  is_open: boolean | null;
};

const TZ = 'Asia/Tokyo';
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: TZ
});

function dayKey(value: string) {
  return dateFmt.format(new Date(value));
}

function friendly(message?: string) {
  const text = message ?? '';
  if (text.includes('duplicate') || text.includes('unique')) return 'この枠はすでに予約済みです。';
  if (text.includes('定員') || text.includes('capacity')) return 'この枠は満席です。';
  if (text.includes('created_by')) return '予約DBの列設定に合わせて保存できませんでした。';
  return text || '予約処理でエラーが発生しました。';
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || anon;
  if (!url || !anon) return NextResponse.json({ ok: false, message: 'Supabase環境変数が未設定です。' }, { status: 500 });

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return NextResponse.json({ ok: false, message: 'ログイン情報が確認できません。' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { slotId?: string };
  const slotId = body.slotId?.trim();
  if (!slotId) return NextResponse.json({ ok: false, message: '予約枠が指定されていません。' }, { status: 400 });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const db = createClient(url, serverKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: userData } = await userClient.auth.getUser(token);
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, message: 'ログイン情報を確認できません。' }, { status: 401 });

  const { data: slotData, error: slotError } = await db
    .from('reservation_slots')
    .select('id,store_id,starts_at,capacity,is_open')
    .eq('id', slotId)
    .single();
  if (slotError || !slotData) return NextResponse.json({ ok: false, message: '予約枠が見つかりません。' }, { status: 404 });

  const slot = slotData as SlotRow;
  if (slot.is_open === false) return NextResponse.json({ ok: false, message: 'この予約枠は受付停止中です。' }, { status: 400 });
  if (new Date(slot.starts_at) <= new Date()) return NextResponse.json({ ok: false, message: '過去の予約枠は予約できません。' }, { status: 400 });

  const { data: member } = await db.from('members').select('id,status').eq('id', user.id).maybeSingle();
  if (!member) {
    const name = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email || '会員');
    const email = user.email || `${user.id}@no-email.local`;
    const { error } = await db.from('members').insert({ id: user.id, store_id: slot.store_id, full_name: name, email, status: '有効' });
    if (error) return NextResponse.json({ ok: false, message: `会員情報の作成に失敗しました: ${friendly(error.message)}` }, { status: 400 });
  } else if (!['有効', '退会予定'].includes(String(member.status ?? '有効'))) {
    return NextResponse.json({ ok: false, message: '現在の会員ステータスでは予約できません。スタッフにご連絡ください。' }, { status: 403 });
  }

  const { data: activeReservations, error: activeError } = await db
    .from('reservations')
    .select('id,reservation_slot_id')
    .eq('member_id', user.id)
    .eq('status', 'booked');
  if (activeError) return NextResponse.json({ ok: false, message: `予約状況の確認に失敗しました: ${friendly(activeError.message)}` }, { status: 400 });

  const activeSlotIds = Array.from(new Set((activeReservations ?? []).map((r) => r.reservation_slot_id).filter(Boolean))) as string[];
  if (activeSlotIds.includes(slot.id)) return NextResponse.json({ ok: false, message: 'この枠はすでに予約済みです。' }, { status: 409 });

  if (activeSlotIds.length > 0) {
    const { data: activeSlots } = await db.from('reservation_slots').select('id,starts_at').in('id', activeSlotIds);
    const hasSameDay = (activeSlots ?? []).some((item) => item.starts_at && dayKey(item.starts_at) === dayKey(slot.starts_at));
    if (hasSameDay) return NextResponse.json({ ok: false, message: '同じ日に予約できるのは1枠までです。' }, { status: 409 });
    if ((activeSlots ?? []).filter((item) => item.starts_at && new Date(item.starts_at) > new Date()).length >= 2) {
      return NextResponse.json({ ok: false, message: '同時に保持できる予約は最大2枠までです。' }, { status: 409 });
    }
  }

  const { data: bookedRows } = await db.from('reservations').select('id').eq('reservation_slot_id', slot.id).eq('status', 'booked');
  if ((bookedRows?.length ?? 0) >= slot.capacity) return NextResponse.json({ ok: false, message: 'この枠は満席になりました。' }, { status: 409 });

  const { data: created, error: createError } = await userClient
    .from('reservations')
    .insert({ reservation_slot_id: slot.id, member_id: user.id, status: 'booked' })
    .select('id')
    .single();

  if (createError || !created) return NextResponse.json({ ok: false, message: `予約処理でエラーが発生しました: ${friendly(createError?.message)}` }, { status: 400 });

  return NextResponse.json({ ok: true, reservationId: created.id });
}
