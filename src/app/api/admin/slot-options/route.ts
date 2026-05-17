import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Slot = {
  id: string;
  menu_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  is_open: boolean | null;
};

type Menu = { id: string; name: string };

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });

  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 90);

  const { data: slots, error } = await db
    .from('reservation_slots')
    .select('id,menu_id,starts_at,ends_at,capacity,is_open')
    .gte('starts_at', start.toISOString())
    .lte('starts_at', end.toISOString())
    .order('starts_at', { ascending: true })
    .limit(800);

  if (error) return NextResponse.json({ ok: false, message: `予約枠の取得に失敗しました: ${error.message}` }, { status: 500 });

  const rows = (slots ?? []) as Slot[];
  const menuIds = Array.from(new Set(rows.map((slot) => slot.menu_id).filter(Boolean))) as string[];
  const menus: Menu[] = menuIds.length ? (((await db.from('menus').select('id,name').in('id', menuIds)).data ?? []) as Menu[]) : [];
  const menuMap = new Map(menus.map((menu) => [menu.id, menu]));

  const options = [];
  for (const slot of rows) {
    const { count } = await db
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('reservation_slot_id', slot.id)
      .eq('status', 'booked');
    const capacity = Number(slot.capacity ?? 0);
    const booked = count ?? 0;
    options.push({
      id: slot.id,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      menuName: slot.menu_id ? menuMap.get(slot.menu_id)?.name ?? 'メニュー未設定' : 'メニュー未設定',
      capacity,
      booked,
      remaining: capacity > 0 ? Math.max(capacity - booked, 0) : 0,
      isOpen: slot.is_open !== false
    });
  }

  return NextResponse.json({ ok: true, slots: options });
}
