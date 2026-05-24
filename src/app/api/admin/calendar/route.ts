import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin } from '@/lib/adminServer';
import { effectiveCapacity } from '@/lib/effectiveCapacity';
import { ensureFixedSlotsForRange, shouldKeepEmptySlot } from '@/lib/yogaSchedule';
import { effectiveBookedReservationsByLogicalSlot, type ReservationStateRow } from '@/lib/reservationState';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Slot = { id: string; menu_id: string | null; starts_at: string | null; ends_at: string | null; capacity: number | null; is_open: boolean | null };
type Menu = { id: string; name: string };
type Member = { id: string; full_name: string | null; email: string | null; plan_id: string | null };
type Plan = { id: string; name: string };

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}


function choosePreferredSlot(a: Slot, b: Slot, reservationsBySlot: Map<string, ReservationStateRow[]>) {
  const aBooked = (reservationsBySlot.get(String(a.id)) ?? []).length;
  const bBooked = (reservationsBySlot.get(String(b.id)) ?? []).length;
  if ((aBooked > 0) !== (bBooked > 0)) return aBooked > 0 ? a : b;
  const aOpen = a.is_open !== false;
  const bOpen = b.is_open !== false;
  if (aOpen !== bOpen) return aOpen ? a : b;
  return a.id.localeCompare(b.id) <= 0 ? a : b;
}
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const url = new URL(request.url);
  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setDate(defaultEnd.getDate() + 7);
  const start = parseDate(url.searchParams.get('start'), now);
  const end = parseDate(url.searchParams.get('end'), defaultEnd);
  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);

  try { await ensureFixedSlotsForRange(db, start, end); }
  catch (error) { return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Yoga slot sync failed.' }, { status: 500 }); }

  const { data: slotRows, error: slotError } = await db
    .from('reservation_slots')
    .select('id,menu_id,starts_at,ends_at,capacity,is_open')
    .gte('starts_at', start.toISOString())
    .lt('starts_at', end.toISOString())
    .order('starts_at', { ascending: true });
  if (slotError) return NextResponse.json({ ok: false, message: `Failed to load slots: ${slotError.message}` }, { status: 500 });

  const slots = (slotRows ?? []) as Slot[];
  const slotIds = slots.map((slot) => String(slot.id));
  const menuIds = Array.from(new Set(slots.map((slot) => slot.menu_id).filter(Boolean))) as string[];

  const allReservations: ReservationStateRow[] = slotIds.length ? (((await db
    .from('reservations')
    .select('id,reservation_slot_id,member_id,status,created_at')
    .in('reservation_slot_id', slotIds)).data ?? []) as ReservationStateRow[]) : [];
  const slotIdToLogicalKey = new Map<string, string>();
  const slotById = new Map<string, Slot>();
  const logicalSlots = new Map<string, { representative: Slot; slotIds: string[] }>();
  for (const slot of slots) {
    if (!slot.menu_id || !slot.starts_at) continue;
    const logicalKey = `${slot.menu_id}|${slot.starts_at}`;
    const slotId = String(slot.id);
    slotById.set(slotId, slot);
    slotIdToLogicalKey.set(slotId, logicalKey);
    const existing = logicalSlots.get(logicalKey);
    if (!existing) {
      logicalSlots.set(logicalKey, { representative: slot, slotIds: [slotId] });
      continue;
    }
    existing.slotIds.push(slotId);
  }

  const reservations = effectiveBookedReservationsByLogicalSlot(allReservations, slotIdToLogicalKey);

  const memberIds = Array.from(new Set(reservations.map((reservation) => reservation.member_id).filter(Boolean))) as string[];
  const members: Member[] = memberIds.length ? (((await db.from('members').select('id,full_name,email,plan_id').in('id', memberIds)).data ?? []) as Member[]) : [];
  const planIds = Array.from(new Set(members.map((member) => member.plan_id).filter(Boolean))) as string[];
  const menus: Menu[] = menuIds.length ? (((await db.from('menus').select('id,name').in('id', menuIds)).data ?? []) as Menu[]) : [];
  const plans: Plan[] = planIds.length ? (((await db.from('plans').select('id,name').in('id', planIds)).data ?? []) as Plan[]) : [];

  const menuMap = new Map(menus.map((menu) => [menu.id, menu]));
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const planMap = new Map(plans.map((plan) => [plan.id, plan]));
  const reservationsBySlot = new Map<string, ReservationStateRow[]>();
  reservations.forEach((reservation) => {
    if (!reservation.reservation_slot_id) return;
    const slotId = String(reservation.reservation_slot_id);
    reservationsBySlot.set(slotId, [...(reservationsBySlot.get(slotId) ?? []), reservation]);
  });

  Array.from(logicalSlots.values()).forEach((logical) => {
    const groupedSlots = logical.slotIds
      .map((slotId: string) => slotById.get(slotId))
      .filter((slot): slot is Slot => Boolean(slot));
    logical.representative = groupedSlots.reduce(
      (selected: Slot | null, current: Slot) => (selected ? choosePreferredSlot(selected, current, reservationsBySlot) : current),
      null
    ) ?? logical.representative;
  });

  const calendarSlots = Array.from(logicalSlots.values()).flatMap(({ representative: slot, slotIds }) => {
    const slotReservations = slotIds.flatMap((slotId) => reservationsBySlot.get(String(slotId)) ?? []);
    const menuName = slot.menu_id ? menuMap.get(slot.menu_id)?.name ?? 'メニュー未設定' : 'メニュー未設定';
    if (slot.is_open === false && slotReservations.length === 0) return [];
    if (slotReservations.length === 0 && !shouldKeepEmptySlot(menuName)) return [];
    const capacity = effectiveCapacity(menuName, slot.capacity);
    return [{
      id: slot.id,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      capacity,
      booked: slotReservations.length,
      isOpen: slot.is_open !== false,
      menuName,
      reservations: slotReservations.map((reservation) => {
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
    }];
  });

  return NextResponse.json({ ok: true, start: start.toISOString(), end: end.toISOString(), slots: calendarSlots });
}
