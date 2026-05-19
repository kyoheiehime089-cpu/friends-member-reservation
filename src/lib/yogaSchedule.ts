import type { SupabaseClient } from '@supabase/supabase-js';

const yogaScheduleByWeekday: Record<number, string[]> = {
  1: ['09:00'],
  2: ['12:30'],
  4: ['12:00'],
  6: ['09:00'],
  0: ['08:10', '09:00']
};

const zone = 'Asia/Tokyo';
const dayFmt = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });

function localDateKey(value: Date) {
  return dayFmt.format(value);
}

function addDaysKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function weekdayFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function toLocalIso(dateKey: string, time: string) {
  return `${dateKey}T${time}:00+09:00`;
}

function addMinutesToIso(localIso: string, minutes: number) {
  return new Date(new Date(localIso).getTime() + minutes * 60_000).toISOString();
}

async function firstStoreId(db: SupabaseClient) {
  const { data, error } = await db.from('stores').select('id').order('created_at', { ascending: true }).limit(1);
  if (error || !data?.[0]?.id) throw new Error(`店舗情報の取得に失敗しました: ${error?.message ?? '店舗が見つかりません'}`);
  return data[0].id as string;
}

async function yogaMenuId(db: SupabaseClient) {
  const { data, error } = await db.from('menus').select('id,name,default_capacity,is_active').eq('name', 'ヨガ').maybeSingle();
  if (error) throw new Error(`ヨガメニューの取得に失敗しました: ${error.message}`);
  if (data?.id) return { id: data.id as string, capacity: Number(data.default_capacity ?? 7) || 7 };

  const { data: created, error: createError } = await db
    .from('menus')
    .insert({ name: 'ヨガ', description: 'blossom yoga のレッスンです。', default_capacity: 7, is_active: true })
    .select('id,default_capacity')
    .single();
  if (createError) throw new Error(`ヨガメニューの作成に失敗しました: ${createError.message}`);
  return { id: created.id as string, capacity: Number(created.default_capacity ?? 7) || 7 };
}

export async function ensureYogaSlotsForRange(db: SupabaseClient, start: Date, end: Date) {
  const rangeMs = end.getTime() - start.getTime();
  if (!Number.isFinite(rangeMs) || rangeMs <= 0 || rangeMs > 1000 * 60 * 60 * 24 * 70) return;

  const menu = await yogaMenuId(db);
  const storeId = await firstStoreId(db);
  const planned: { starts_at: string; ends_at: string }[] = [];

  for (let key = addDaysKey(localDateKey(start), -1), guard = 0; guard < 80; key = addDaysKey(key, 1), guard += 1) {
    const dayStart = new Date(toLocalIso(key, '00:00'));
    if (dayStart >= end) break;
    const times = yogaScheduleByWeekday[weekdayFromKey(key)] ?? [];
    for (const time of times) {
      const startsAt = toLocalIso(key, time);
      const startDate = new Date(startsAt);
      if (startDate < start || startDate >= end) continue;
      planned.push({ starts_at: startsAt, ends_at: addMinutesToIso(startsAt, 40) });
    }
  }

  if (!planned.length) return;
  const startValues = planned.map((slot) => slot.starts_at);
  const { data: existing, error: existingError } = await db
    .from('reservation_slots')
    .select('starts_at')
    .eq('menu_id', menu.id)
    .in('starts_at', startValues);
  if (existingError) throw new Error(`ヨガ枠の確認に失敗しました: ${existingError.message}`);

  const existingSet = new Set((existing ?? []).map((row: { starts_at?: string | null }) => row.starts_at).filter(Boolean));
  const insertRows = planned
    .filter((slot) => !existingSet.has(slot.starts_at))
    .map((slot) => ({ store_id: storeId, menu_id: menu.id, starts_at: slot.starts_at, ends_at: slot.ends_at, capacity: Math.max(1, menu.capacity || 7), is_open: true }));

  if (!insertRows.length) return;
  const { error } = await db.from('reservation_slots').insert(insertRows);
  if (error) throw new Error(`ヨガ枠の反映に失敗しました: ${error.message}`);
}

export function shouldKeepEmptySlot(menuName: string) {
  return menuName.includes('セミパーソナル') || menuName.includes('ヨガ');
}
