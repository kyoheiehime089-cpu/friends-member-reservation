"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { AdminScheduleRows } from '@/components/AdminScheduleRows';
import { getSupabaseClient } from '@/lib/supabaseClient';

type Menu = { id: string; name: string; default_capacity: number };
type Slot = { id: string; menu_id: string; starts_at: string; ends_at: string; capacity: number; is_open: boolean };

const zone = 'Asia/Tokyo';
const keyFmt = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });
const dayFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: zone });
const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });
const baseTimes = ['09:00', '10:00', '10:50', '11:40', '12:00', '12:30', '17:20', '18:30', '19:20', '20:10', '21:00'];

function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function addDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function weekStart(date: Date) { const d = new Date(date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0); return d; }
function menuOrder(name: string) { if (name.includes('セミ')) return 0; if (name.includes('ヨガ')) return 1; if (name.includes('イベント')) return 2; return 9; }

export function AdminSchedulesClient() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState('予約枠を読み込んでいます。');
  const [offset, setOffset] = useState(0);
  const [menuId, setMenuId] = useState('all');

  const start = useMemo(() => addDays(weekStart(today()), offset), [offset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const menuMap = useMemo(() => new Map(menus.map((m) => [m.id, m.name])), [menus]);
  const visibleSlots = useMemo(() => menuId === 'all' ? slots : slots.filter((s) => s.menu_id === menuId), [slots, menuId]);
  const times = useMemo(() => Array.from(new Set([...baseTimes, ...visibleSlots.map((s) => timeFmt.format(new Date(s.starts_at)))])).sort(), [visibleSlots]);
  const slotMap = useMemo(() => {
    const map = new Map<string, Slot[]>();
    visibleSlots.forEach((slot) => {
      const key = `${keyFmt.format(new Date(slot.starts_at))}-${timeFmt.format(new Date(slot.starts_at))}`;
      map.set(key, [...(map.get(key) ?? []), slot]);
    });
    return map;
  }, [visibleSlots]);

  const load = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) { setMessage('Supabase環境変数を設定してください。'); return; }
    const [{ data: menuRows, error: menuError }, { data: slotRows, error: slotError }] = await Promise.all([
      client.from('menus').select('id,name,default_capacity').eq('is_active', true).order('name'),
      client.from('reservation_slots').select('id,menu_id,starts_at,ends_at,capacity,is_open').gte('starts_at', start.toISOString()).lt('starts_at', addDays(start, 7).toISOString()).order('starts_at')
    ]);
    if (menuError || slotError) { setMessage(menuError?.message ?? slotError?.message ?? '予約枠の読み込みに失敗しました。'); return; }
    const nextMenus = ((menuRows ?? []) as Menu[]).sort((a, b) => menuOrder(a.name) - menuOrder(b.name) || a.name.localeCompare(b.name, 'ja'));
    const nextSlots = (slotRows ?? []) as Slot[];
    setMenus(nextMenus);
    setSlots(nextSlots);
    if (nextSlots.length) {
      const { data } = await client.rpc('get_slot_booking_counts', { slot_ids: nextSlots.map((slot) => slot.id) });
      const nextCounts: Record<string, number> = {};
      ((data ?? []) as { reservation_slot_id: string; booked_count: number }[]).forEach((row) => { nextCounts[row.reservation_slot_id] = Number(row.booked_count); });
      setCounts(nextCounts);
    } else {
      setCounts({});
    }
    setMessage('1週間分の予約枠を一覧表示しています。下の編集欄で時間・定員・受付状態を保存できます。');
  }, [start]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AdminPage title="予約枠管理" description="週間カレンダーで予約状況を一目で確認できます。">
      <div className="space-y-4">
        <div className="rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-900">{message}</div>
        <div className="flex flex-wrap gap-2 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
          <button type="button" onClick={() => setOffset((v) => v - 7)} className="rounded-full border px-4 py-2 text-sm font-black">前週</button>
          <button type="button" onClick={() => setOffset(0)} className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-black">今週</button>
          <button type="button" onClick={() => setOffset((v) => v + 7)} className="rounded-full border px-4 py-2 text-sm font-black">次週</button>
          <select value={menuId} onChange={(e) => setMenuId(e.target.value)} className="rounded-full border px-4 py-2 text-sm font-black">
            <option value="all">全メニュー</option>
            {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
          </select>
          <button type="button" onClick={() => void load()} className="rounded-full bg-gray-900 px-4 py-2 text-sm font-black text-white">再読み込み</button>
        </div>
        <section className="rounded-3xl border border-gray-200 bg-white p-2 shadow-sm">
          <div className="overflow-x-auto">
            <div className="grid min-w-[920px] gap-1" style={{ gridTemplateColumns: '70px repeat(7, minmax(115px, 1fr))' }}>
              <div className="sticky left-0 z-10 rounded-xl bg-white p-2 text-center text-xs font-black shadow-sm">時間</div>
              {days.map((day) => <div key={keyFmt.format(day)} className="rounded-xl bg-yellow-100 p-2 text-center text-xs font-black">{dayFmt.format(day)}</div>)}
              {times.map((time) => <div key={time} className="contents">
                <div className="sticky left-0 z-10 rounded-xl bg-white p-2 text-center text-xs font-black shadow-sm">{time}</div>
                {days.map((day) => {
                  const key = `${keyFmt.format(day)}-${time}`;
                  const cellSlots = slotMap.get(key) ?? [];
                  return <div key={key} className="min-h-[54px] rounded-xl border border-gray-100 bg-gray-50 p-1">
                    {cellSlots.map((slot) => <div key={slot.id} className={`mb-1 rounded-lg p-1 text-[11px] font-black ${slot.is_open ? 'bg-yellow-50 text-gray-900 ring-1 ring-yellow-200' : 'bg-gray-200 text-gray-500'}`}>
                      <div className="truncate">{menuMap.get(slot.menu_id) ?? '未設定'}</div>
                      <div>{counts[slot.id] ?? 0}/{slot.capacity}名 {slot.is_open ? '受付中' : '受付停止'}</div>
                    </div>)}
                  </div>;
                })}
              </div>)}
            </div>
          </div>
        </section>
        <AdminScheduleRows slots={visibleSlots} menus={menus} counts={counts} onSaved={load} onMessage={setMessage} />
      </div>
    </AdminPage>
  );
}
