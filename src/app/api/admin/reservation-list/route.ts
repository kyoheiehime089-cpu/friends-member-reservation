import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin } from '@/lib/adminServer';
import { latestReservationsBySlotMember, type ReservationStateRow } from '@/lib/reservationState';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Reservation = {
  id: string;
  reservation_slot_id: string | null;
  member_id: string | null;
  status: string | null;
  created_at: string | null;
};

type Slot = { id: string; menu_id: string | null; starts_at: string | null; ends_at: string | null; capacity: number | null };
type Menu = { id: string; name: string };
type Member = { id: string; full_name: string | null; email: string | null; plan_id: string | null };
type Plan = { id: string; name: string };

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data: reservations, error } = await db
    .from('reservations')
    .select('id,reservation_slot_id,member_id,status,created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ ok: false, message: `予約一覧の取得に失敗しました: ${error.message}` }, { status: 500 });

  const rows = Array.from(latestReservationsBySlotMember((reservations ?? []) as ReservationStateRow[]).values()) as Reservation[];
  const slotIds = Array.from(new Set(rows.map((r) => r.reservation_slot_id).filter(Boolean))) as string[];
  const memberIds = Array.from(new Set(rows.map((r) => r.member_id).filter(Boolean))) as string[];

  const slots: Slot[] = slotIds.length ? (((await db.from('reservation_slots').select('id,menu_id,starts_at,ends_at,capacity').in('id', slotIds)).data ?? []) as Slot[]) : [];
  const menuIds = Array.from(new Set(slots.map((s) => s.menu_id).filter(Boolean))) as string[];
  const menus: Menu[] = menuIds.length ? (((await db.from('menus').select('id,name').in('id', menuIds)).data ?? []) as Menu[]) : [];
  const members: Member[] = memberIds.length ? (((await db.from('members').select('id,full_name,email,plan_id').in('id', memberIds)).data ?? []) as Member[]) : [];
  const planIds = Array.from(new Set(members.map((m) => m.plan_id).filter(Boolean))) as string[];
  const plans: Plan[] = planIds.length ? (((await db.from('plans').select('id,name').in('id', planIds)).data ?? []) as Plan[]) : [];

  const slotMap = new Map(slots.map((s) => [s.id, s]));
  const menuMap = new Map(menus.map((m) => [m.id, m]));
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const planMap = new Map(plans.map((p) => [p.id, p]));

  const list = rows.map((reservation) => {
    const slot = reservation.reservation_slot_id ? slotMap.get(reservation.reservation_slot_id) : null;
    const menu = slot?.menu_id ? menuMap.get(slot.menu_id) : null;
    const member = reservation.member_id ? memberMap.get(reservation.member_id) : null;
    const plan = member?.plan_id ? planMap.get(member.plan_id) : null;
    return {
      id: reservation.id,
      slotId: reservation.reservation_slot_id,
      status: reservation.status ?? 'booked',
      createdAt: reservation.created_at,
      startsAt: slot?.starts_at ?? null,
      endsAt: slot?.ends_at ?? null,
      capacity: slot?.capacity ?? null,
      menuName: menu?.name ?? 'メニュー未設定',
      memberName: member?.full_name ?? '会員名未設定',
      memberEmail: member?.email ?? 'メール未設定',
      planName: plan?.name ?? 'プラン未設定'
    };
  });

  return NextResponse.json({ ok: true, reservations: list });
}
