import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { canMemberBookByStatus, getMemberStatusLabel } from '@/lib/memberStatus';
import { effectiveCapacity } from '@/lib/effectiveCapacity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TZ = 'Asia/Tokyo';
const MAX_FUTURE_BOOKINGS = 2;
const dateParts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ });

type Slot = { id: string; store_id: string | null; menu_id: string | null; starts_at: string; ends_at: string | null; capacity: number; is_open: boolean | null };
type Reservation = { id: string; reservation_slot_id: string | null };
type Member = { id: string; plan_id: string | null; status: string | null };
type Plan = { name: string; weekly_limit: number | null; unlimited: boolean | null; is_active: boolean | null };

function parts(value: Date | string) {
  const d = typeof value === 'string' ? new Date(value) : value;
  const p = dateParts.formatToParts(d);
  return { y: Number(p.find((x) => x.type === 'year')?.value ?? '0'), m: Number(p.find((x) => x.type === 'month')?.value ?? '0'), d: Number(p.find((x) => x.type === 'day')?.value ?? '0') };
}
function dayKey(value: Date | string) { const p = parts(value); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; }
function weekRange(value: Date | string) { const p = parts(value); const weekday = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); const diff = (weekday + 6) % 7; return { start: new Date(Date.UTC(p.y, p.m - 1, p.d - diff, -9, 0, 0, 0)), end: new Date(Date.UTC(p.y, p.m - 1, p.d - diff + 7, -9, 0, 0, 0)) }; }
function deadline(value: Date | string) { const p = parts(value); return new Date(Date.UTC(p.y, p.m - 1, p.d - 1, 13, 0, 0, 0)); }
function isStillActiveFuture(slot: { starts_at?: string | null; ends_at?: string | null }) { const endOrStart = slot.ends_at || slot.starts_at; return Boolean(endOrStart && new Date(endOrStart) > new Date()); }

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) return NextResponse.json({ ok: false, message: 'Supabase環境変数が未設定です。' }, { status: 500 });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return NextResponse.json({ ok: false, message: 'ログイン情報が確認できません。' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { slotId?: string };
  const slotId = body.slotId?.trim();
  if (!slotId) return NextResponse.json({ ok: false, message: 'slotId がありません。' }, { status: 400 });

  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const db = createClient(url, service || anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData } = await userClient.auth.getUser(token);
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, message: 'ログイン情報を確認できません。' }, { status: 401 });

  const { data: slotData } = await db.from('reservation_slots').select('id,store_id,menu_id,starts_at,ends_at,capacity,is_open').eq('id', slotId).single();
  if (!slotData) return NextResponse.json({ ok: false, message: '予約枠が見つかりません。' }, { status: 404 });
  const slot = slotData as Slot;
  const startsAt = new Date(slot.starts_at);
  if (startsAt <= new Date()) return NextResponse.json({ ok: false, message: '開始済み、または過去の予約枠は予約できません。' }, { status: 400 });
  if (new Date() >= deadline(startsAt)) return NextResponse.json({ ok: false, message: 'この枠の予約受付は終了しました。予約は前日22:00までです。' }, { status: 400 });
  if (slot.is_open === false) return NextResponse.json({ ok: false, message: 'この予約枠は受付停止中です。' }, { status: 400 });

  const { data: menuData } = slot.menu_id ? await db.from('menus').select('name').eq('id', slot.menu_id).maybeSingle() : { data: null };
  const menuName = String(menuData?.name ?? '');
  const capacity = effectiveCapacity(menuName, slot.capacity);

  const name = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email || '会員');
  const email = user.email || `${user.id}@no-email.local`;
  const { data: memberData } = await db.from('members').select('id,plan_id,status').eq('id', user.id).maybeSingle();
  let member = memberData as Member | null;
  if (!member) {
    const { data: createdMember, error } = await db.from('members').insert({ id: user.id, store_id: slot.store_id, full_name: name, email, status: '有効' }).select('id,plan_id,status').single();
    if (error) return NextResponse.json({ ok: false, message: `会員情報の作成に失敗しました: ${error.message}` }, { status: 400 });
    member = createdMember as Member;
  }
  if (!canMemberBookByStatus(member.status)) return NextResponse.json({ ok: false, message: `現在の会員ステータスは「${getMemberStatusLabel(member.status)}」です。予約をご希望の場合はスタッフにご連絡ください。` }, { status: 403 });

  const { data: allReservations, error: reservationReadError } = await db.from('reservations').select('id,reservation_slot_id').eq('member_id', user.id).eq('status', 'booked');
  if (reservationReadError) return NextResponse.json({ ok: false, message: `予約履歴の確認に失敗しました: ${reservationReadError.message}` }, { status: 400 });
  const reservations = (allReservations ?? []) as Reservation[];
  const existingSlotIds = Array.from(new Set(reservations.map((r) => r.reservation_slot_id).filter(Boolean))) as string[];
  let existingSlots: { id: string; starts_at: string | null; ends_at: string | null }[] = [];
  if (existingSlotIds.length > 0) { const { data } = await db.from('reservation_slots').select('id,starts_at,ends_at').in('id', existingSlotIds); existingSlots = (data ?? []) as { id: string; starts_at: string | null; ends_at: string | null }[]; }
  if (existingSlots.some((s) => s.id === slot.id)) return NextResponse.json({ ok: false, message: 'この枠はすでに予約済みです。予約一覧をご確認ください。' }, { status: 409 });
  if (existingSlots.some((s) => s.starts_at && isStillActiveFuture(s) && dayKey(s.starts_at) === dayKey(startsAt))) return NextResponse.json({ ok: false, message: '同じ日に予約できるのは1枠までです。予約一覧をご確認ください。' }, { status: 409 });
  if (existingSlots.filter(isStillActiveFuture).length >= MAX_FUTURE_BOOKINGS) return NextResponse.json({ ok: false, message: `同時に保持できる予約は最大${MAX_FUTURE_BOOKINGS}枠までです。予約一覧からキャンセル後に予約してください。` }, { status: 409 });

  if (member.plan_id) {
    const { data: planData } = await db.from('plans').select('name,weekly_limit,unlimited,is_active').eq('id', member.plan_id).maybeSingle();
    const plan = planData as Plan | null;
    if (plan?.is_active === false) return NextResponse.json({ ok: false, message: '現在のプランは無効です。予約をご希望の場合はスタッフにご連絡ください。' }, { status: 403 });
    if (plan && plan.unlimited !== true && typeof plan.weekly_limit === 'number') {
      const week = weekRange(startsAt);
      const weeklyCount = existingSlots.filter((s) => s.starts_at && new Date(s.starts_at) >= week.start && new Date(s.starts_at) < week.end).length;
      if (weeklyCount >= plan.weekly_limit) return NextResponse.json({ ok: false, message: `${plan.name}では、この週の予約上限に達しています。` }, { status: 409 });
    }
  }

  const { data: bookedRows } = await db.from('reservations').select('id').eq('reservation_slot_id', slot.id).eq('status', 'booked');
  if ((bookedRows?.length ?? 0) >= capacity) return NextResponse.json({ ok: false, message: 'この枠は満席になりました。別の枠をお選びください。' }, { status: 409 });
  const { data: created, error: createError } = await userClient.from('reservations').insert({ reservation_slot_id: slot.id, member_id: user.id, status: 'booked', created_by: user.id }).select('id,member_id').single();
  if (createError || !created) return NextResponse.json({ ok: false, message: `予約処理でエラーが発生しました: ${createError?.message ?? '保存に失敗しました。'}` }, { status: 400 });
  return NextResponse.json({ ok: true, reservationId: created.id, memberMail: 'disabled', adminMail: 'disabled' });
}
