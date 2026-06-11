import type { SupabaseClient } from '@supabase/supabase-js';
import { getJpHolidayName } from '@/lib/jpHolidays';

type ScheduleRule = { weekdays: number[]; times: string[]; durationMinutes: number; capacity: number };
type MenuRow = { id: string; name: string; default_capacity: number | null; is_active: boolean | null };
type ExistingSlot = { id: string; menu_id: string; starts_at: string; is_open: boolean | null; created_at: string | null };
type ReservationSlotRow = { id: string; menu_id: string; starts_at: string; is_open: boolean | null };
type ReservationRow = { reservation_slot_id: string };

const yogaScheduleRules: ScheduleRule[] = [
  { weekdays: [1], times: ['09:00'], durationMinutes: 40, capacity: 7 },
  { weekdays: [2], times: ['09:00', '12:30'], durationMinutes: 40, capacity: 7 },
  { weekdays: [4], times: ['12:00', '20:45'], durationMinutes: 40, capacity: 7 },
  { weekdays: [6], times: ['08:10', '09:00'], durationMinutes: 40, capacity: 7 },
  { weekdays: [0], times: ['08:10', '09:00'], durationMinutes: 40, capacity: 7 }
];
const yogaHolidayTimes = ['09:00'];

const semiPersonalWeekdayTimes = ['18:30', '19:20', '20:10', '21:00'];
const semiPersonalWeekendTimes = ['10:00', '10:50', '11:40', '12:30'];
const zone = 'Asia/Tokyo';
const dayFmt = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });

function localDateKey(value: Date) { return dayFmt.format(value); }
function addDaysKey(dateKey: string, days: number) { const [y, m, d] = dateKey.split('-').map(Number); const date = new Date(Date.UTC(y, m - 1, d + days)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
function weekdayFromKey(dateKey: string) { const [y, m, d] = dateKey.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function toLocalIso(dateKey: string, time: string) { return `${dateKey}T${time}:00+09:00`; }
function addMinutesToIso(localIso: string, minutes: number) { return new Date(new Date(localIso).getTime() + minutes * 60_000).toISOString(); }

async function firstStoreId(db: SupabaseClient) {
  const { data, error } = await db.from('stores').select('id').order('created_at', { ascending: true }).limit(1);
  if (error || !data?.[0]?.id) throw new Error(`店舗情報の取得に失敗しました: ${error?.message ?? '店舗が見つかりません'}`);
  return data[0].id as string;
}

async function yogaMenu(db: SupabaseClient) {
  const { data, error } = await db.from('menus').select('id,name,default_capacity,is_active').eq('name', 'ヨガ').maybeSingle();
  if (error) throw new Error(`ヨガメニューの取得に失敗しました: ${error.message}`);
  if (data?.id) return { id: data.id as string, capacity: Number(data.default_capacity ?? 7) || 7 };
  const { data: created, error: createError } = await db.from('menus').insert({ name: 'ヨガ', description: 'blossom yoga のレッスンです。', default_capacity: 7, is_active: true }).select('id,default_capacity').single();
  if (createError) throw new Error(`ヨガメニューの作成に失敗しました: ${createError.message}`);
  return { id: created.id as string, capacity: Number(created.default_capacity ?? 7) || 7 };
}

async function semiPersonalMenus(db: SupabaseClient) {
  const { data, error } = await db.from('menus').select('id,name,default_capacity,is_active').ilike('name', '%セミパーソナル%').eq('is_active', true).order('created_at', { ascending: true });
  if (error) throw new Error(`セミパーソナルメニューの取得に失敗しました: ${error.message}`);
  return ((data ?? []) as MenuRow[]).map((menu) => ({ id: menu.id, capacity: Number(menu.default_capacity ?? 5) || 5 }));
}

function isHoliday(dateKey: string) { return Boolean(getJpHolidayName(dateKey)); }

function buildSemiPersonalTimes(weekday: number, dateKey?: string) {
  // friends のセミパーソナルは木曜休み。木曜祝日も必ず生成しない。
  if (weekday === 4) return [];
  if (dateKey && isHoliday(dateKey)) return semiPersonalWeekendTimes;
  if (weekday === 0 || weekday === 6) return semiPersonalWeekendTimes;
  return semiPersonalWeekdayTimes;
}

function buildYogaTimes(weekday: number, dateKey: string) {
  if (isHoliday(dateKey)) return yogaHolidayTimes.map((time) => ({ time, durationMinutes: 40, capacity: 7 }));
  return yogaScheduleRules
    .filter((rule) => rule.weekdays.includes(weekday))
    .flatMap((rule) => rule.times.map((time) => ({ time, durationMinutes: rule.durationMinutes, capacity: rule.capacity })));
}

export type UnavailableBlock = { start: string; end: string; label: 'セミパーソナル' | '通常ヨガ'; source: 'semi-personal' | 'yoga' };

function addMinutesToTime(time: string, minutes: number) {
  const [hour, minute] = time.split(':').map(Number);
  const date = new Date(Date.UTC(2000, 0, 1, hour, minute + minutes));
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

function mergeBlocks(blocks: UnavailableBlock[]) {
  return blocks
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.label.localeCompare(b.label))
    .reduce<UnavailableBlock[]>((merged, block) => {
      const previous = merged[merged.length - 1];
      if (previous && previous.label === block.label && previous.source === block.source && block.start <= previous.end) {
        previous.end = previous.end.localeCompare(block.end) >= 0 ? previous.end : block.end;
        return merged;
      }
      merged.push({ ...block });
      return merged;
    }, []);
}

export function fixedUnavailableBlocksForDate(dateKey: string): UnavailableBlock[] {
  const weekday = weekdayFromKey(dateKey);
  const yogaBlocks = buildYogaTimes(weekday, dateKey).map((rule) => ({
    start: addMinutesToTime(rule.time, -30),
    end: addMinutesToTime(rule.time, rule.durationMinutes + 30),
    label: '通常ヨガ' as const,
    source: 'yoga' as const
  }));
  const semiBlocks = buildSemiPersonalTimes(weekday, dateKey).map((time) => ({
    start: addMinutesToTime(time, -30),
    end: addMinutesToTime(time, 40 + 30),
    label: 'セミパーソナル' as const,
    source: 'semi-personal' as const
  }));
  return mergeBlocks([...yogaBlocks, ...semiBlocks]);
}

async function cleanupThursdaySemiPersonalSlots(db: SupabaseClient, menuRows: { id: string; capacity: number }[]) {
  if (!menuRows.length) return;

  const { data: slotRows, error: slotError } = await db
    .from('reservation_slots')
    .select('id,menu_id,starts_at,is_open')
    .in('menu_id', menuRows.map((menu) => menu.id))
    .gte('starts_at', new Date().toISOString());

  if (slotError) throw new Error(`木曜セミパーソナル枠の確認に失敗しました: ${slotError.message}`);

  const thursdaySlots = ((slotRows ?? []) as ReservationSlotRow[]).filter((slot) => weekdayFromKey(localDateKey(new Date(slot.starts_at))) === 4);
  if (!thursdaySlots.length) return;

  const slotIds = thursdaySlots.map((slot) => slot.id);
  const { data: reservationRows, error: reservationError } = await db
    .from('reservations')
    .select('reservation_slot_id')
    .in('reservation_slot_id', slotIds)
    .eq('status', 'booked');

  if (reservationError) throw new Error(`木曜セミパーソナル枠の予約確認に失敗しました: ${reservationError.message}`);

  const bookedSlotIds = new Set(((reservationRows ?? []) as ReservationRow[]).map((row) => row.reservation_slot_id));
  const emptySlotIds = slotIds.filter((slotId) => !bookedSlotIds.has(slotId));
  const bookedIds = Array.from(bookedSlotIds);

  if (emptySlotIds.length) {
    const { error } = await db.from('reservation_slots').delete().in('id', emptySlotIds);
    if (error) throw new Error(`予約なし木曜セミパーソナル枠の削除に失敗しました: ${error.message}`);
  }

  if (bookedIds.length) {
    const { error } = await db.from('reservation_slots').update({ is_open: false }).in('id', bookedIds);
    if (error) throw new Error(`予約済み木曜セミパーソナル枠の受付停止に失敗しました: ${error.message}`);
  }
}

async function ensureFixedSlots(db: SupabaseClient, start: Date, end: Date, menuRows: { id: string; capacity: number }[], ruleForDay: (weekday: number, dateKey: string) => { time: string; durationMinutes: number; capacity: number }[]) {
  if (!menuRows.length) return;
  const storeId = await firstStoreId(db);
  const planned: { menu_id: string; starts_at: string; ends_at: string; capacity: number }[] = [];

  for (let key = addDaysKey(localDateKey(start), -1), guard = 0; guard < 120; key = addDaysKey(key, 1), guard += 1) {
    const dayStart = new Date(toLocalIso(key, '00:00'));
    if (dayStart >= end) break;
    const weekday = weekdayFromKey(key);
    const rules = ruleForDay(weekday, key);
    if (!rules.length) continue;
    for (const menu of menuRows) {
      for (const rule of rules) {
        const startsAt = toLocalIso(key, rule.time);
        const startDate = new Date(startsAt);
        if (startDate < start || startDate >= end) continue;
        planned.push({ menu_id: menu.id, starts_at: startsAt, ends_at: addMinutesToIso(startsAt, rule.durationMinutes), capacity: Math.max(1, menu.capacity || rule.capacity) });
      }
    }
  }

  if (!planned.length) return;
  const menuIds = Array.from(new Set(planned.map((s) => s.menu_id)));
  const startsAts = Array.from(new Set(planned.map((s) => s.starts_at)));
  const { data: existingRows, error: existingError } = await db.from('reservation_slots').select('id,menu_id,starts_at,is_open,created_at').in('menu_id', menuIds).in('starts_at', startsAts).order('created_at', { ascending: true });
  if (existingError) throw new Error(`固定枠の既存確認に失敗しました: ${existingError.message}`);
  const existing = (existingRows ?? []) as ExistingSlot[];
  const byKey = new Map<string, ExistingSlot[]>();
  for (const row of existing) {
    const key = `${row.menu_id}|${row.starts_at}`;
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }

  const toInsert = [] as { store_id: string; menu_id: string; starts_at: string; ends_at: string; capacity: number; is_open: boolean }[];
  const toOpenIds: string[] = [];
  for (const slot of planned) {
    const key = `${slot.menu_id}|${slot.starts_at}`;
    const found = (byKey.get(key) ?? []).sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))[0];
    if (!found) {
      toInsert.push({ store_id: storeId, menu_id: slot.menu_id, starts_at: slot.starts_at, ends_at: slot.ends_at, capacity: slot.capacity, is_open: true });
      continue;
    }
    if (found.is_open === false) toOpenIds.push(found.id);
  }

  if (toOpenIds.length) {
    const { error } = await db.from('reservation_slots').update({ is_open: true }).in('id', Array.from(new Set(toOpenIds)));
    if (error) throw new Error(`固定枠の再オープンに失敗しました: ${error.message}`);
  }
  if (toInsert.length) {
    const { error } = await db.from('reservation_slots').insert(toInsert);
    if (error) throw new Error(`固定枠の作成に失敗しました: ${error.message}`);
  }
}

export async function ensureFixedSlotsForRange(db: SupabaseClient, start: Date, end: Date) {
  const rangeMs = end.getTime() - start.getTime();
  if (!Number.isFinite(rangeMs) || rangeMs <= 0 || rangeMs > 1000 * 60 * 60 * 24 * 70) return;

  const yoga = await yogaMenu(db);
  await ensureFixedSlots(db, start, end, [yoga], (weekday, dateKey) => buildYogaTimes(weekday, dateKey));

  const semiMenus = await semiPersonalMenus(db);
  await cleanupThursdaySemiPersonalSlots(db, semiMenus);
  await ensureFixedSlots(db, start, end, semiMenus, (weekday, dateKey) => buildSemiPersonalTimes(weekday, dateKey).map((time) => ({ time, durationMinutes: 40, capacity: 5 })));
}

export function shouldKeepEmptySlot(menuName: string) { return menuName.includes('セミパーソナル') || menuName.includes('ヨガ'); }
