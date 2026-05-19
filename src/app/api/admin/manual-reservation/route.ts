import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin } from '@/lib/adminServer';
import { bookAdminReservation, type AdminReservationBody } from '@/lib/adminReservations';
import { effectiveCapacity } from '@/lib/effectiveCapacity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MenuRow = { id: string; name: string | null };
type ReservationRow = { id: string; reservation_slot_id: string | null; member_id: string | null; status: string | null; created_at: string | null };
type MemberRow = { id: string; full_name: string | null; email: string | null; plan_id: string | null };
type PlanRow = { id: string; name: string | null };

async function getCalendarSlot(db: ReturnType<typeof createServiceClient>, slotId: string) {
  const { data: slot, error: slotError } = await db
    .from('reservation_slots')
    .select('id,menu_id,starts_at,ends_at,capacity,is_open')
    .eq('id', slotId)
    .single();
  if (slotError || !slot) throw new Error(`予約枠の再取得に失敗しました: ${slotError?.message ?? '枠が見つかりません'}`);

  const menuResult = slot.menu_id
    ? await db.from('menus').select('id,name').eq('id', slot.menu_id).maybeSingle()
    : { data: null, error: null };
  if (menuResult.error) throw new Error(`メニュー情報の再取得に失敗しました: ${menuResult.error.message}`);
  const menu = menuResult.data as MenuRow | null;
  const menuName = String(menu?.name ?? 'メニュー未設定');

  const { data: reservationRows, error: reservationError } = await db
    .from('reservations')
    .select('id,reservation_slot_id,member_id,status,created_at')
    .eq('reservation_slot_id', slotId)
    .eq('status', 'booked')
    .order('created_at', { ascending: true });
  if (reservationError) throw new Error(`予約情報の再取得に失敗しました: ${reservationError.message}`);

  const reservations = (reservationRows ?? []) as ReservationRow[];
  const memberIds = Array.from(new Set(reservations.map((reservation) => reservation.member_id).filter(Boolean))) as string[];
  const members: MemberRow[] = memberIds.length
    ? (((await db.from('members').select('id,full_name,email,plan_id').in('id', memberIds)).data ?? []) as MemberRow[])
    : [];
  const planIds = Array.from(new Set(members.map((member) => member.plan_id).filter(Boolean))) as string[];
  const plans: PlanRow[] = planIds.length
    ? (((await db.from('plans').select('id,name').in('id', planIds)).data ?? []) as PlanRow[])
    : [];
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const planMap = new Map(plans.map((plan) => [plan.id, plan]));
  const capacity = effectiveCapacity(menuName, Number(slot.capacity ?? 0));

  return {
    id: slot.id,
    startsAt: slot.starts_at,
    endsAt: slot.ends_at,
    capacity,
    booked: reservations.length,
    isOpen: slot.is_open !== false,
    menuName,
    reservations: reservations.map((reservation) => {
      const member = reservation.member_id ? memberMap.get(reservation.member_id) : null;
      const plan = member?.plan_id ? planMap.get(member.plan_id) : null;
      return {
        id: reservation.id,
        status: reservation.status ?? 'booked',
        memberId: reservation.member_id,
        memberName: member?.full_name || member?.email || '会員名未設定',
        memberEmail: member?.email || '',
        planName: plan?.name || 'プラン未設定',
        createdAt: reservation.created_at
      };
    })
  };
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config || !admin.adminId) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  const body = await request.json().catch(() => ({})) as AdminReservationBody;
  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);

  try {
    const result = await bookAdminReservation(db, body, admin.adminId);
    const slot = await getCalendarSlot(db, result.slotId);
    return NextResponse.json({
      ok: true,
      reservationId: result.reservationId,
      slotId: result.slotId,
      memberLabel: result.memberLabel,
      slot,
      message: `${result.memberLabel}さんの予約を入れました。`
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : '予約に失敗しました。' }, { status: 400 });
  }
}
