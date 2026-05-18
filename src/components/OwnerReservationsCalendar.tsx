"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { CalendarDayHeader } from '@/components/CalendarDayHeader';
import { getSupabaseClient } from '@/lib/supabaseClient';

type ReservationRow = {
  id: string;
  slotId: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  menuName: string;
  memberName: string;
  memberEmail: string;
  planName: string;
};

type SlotOption = {
  id: string;
  startsAt: string | null;
  endsAt: string | null;
  menuName: string;
  capacity: number;
  booked: number;
  remaining: number;
  isOpen: boolean;
};

type ReservationBody = { ok?: boolean; message?: string; reservations?: ReservationRow[] };
type SlotBody = { ok?: boolean; message?: string; slots?: SlotOption[] };

const zone = 'Asia/Tokyo';
const keyFmt = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });
const dateFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: zone });
const weekFmt = new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: zone });
const monthFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', timeZone: zone });
const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });

function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function weekStart(date: Date) { const d = new Date(date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0); return d; }
function dayKey(value: Date | string | null | undefined) { if (!value) return ''; return keyFmt.format(typeof value === 'string' ? new Date(value) : value); }
function timeKey(value: string | null | undefined) { if (!value) return ''; return timeFmt.format(new Date(value)); }
function addMinutes(time: string, minutes: number) { const [h, m] = time.split(':').map(Number); const d = new Date(2000, 0, 1, h, m + minutes); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function defaultTimes() { const result: string[] = []; let t = '09:00'; while (t <= '22:30') { result.push(t); t = addMinutes(t, 30); } return result; }
function shortName(name: string) { return name.replace(/\s+/g, '').slice(0, 10); }
function menuColor(menuName: string) { if (menuName.includes('ブロック') || menuName.includes('停止')) return 'bg-gray-300 text-gray-950 ring-red-500'; if (menuName.includes('ヨガ')) return 'bg-purple-600 text-white ring-purple-700'; if (menuName.includes('イベント') || menuName.includes('セミナー') || menuName.includes('座学')) return 'bg-red-600 text-white ring-red-700'; return 'bg-blue-700 text-white ring-blue-800'; }
function statusLabel(status: string) { if (status === 'cancelled') return 'キャンセル'; if (status === 'attended') return '来店済'; if (status === 'no_show') return '無断'; return ''; }

export function OwnerReservationsCalendar() {
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [message, setMessage] = useState('週間予約カレンダーを読み込んでいます。');
  const [search, setSearch] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);

  const start = useMemo(() => addDays(weekStart(today()), weekOffset), [weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(start, index)), [start]);
  const end = useMemo(() => addDays(start, 7), [start]);

  async function token() {
    const client = getSupabaseClient();
    if (!client) return '';
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? '';
  }

  async function adminFetch(path: string) {
    const accessToken = await token();
    if (!accessToken) throw new Error('管理者としてサインインしてください。');
    return fetch(path, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
  }

  async function load() {
    try {
      setMessage('週間予約カレンダーを読み込んでいます。');
      const [reservationResponse, slotResponse] = await Promise.all([
        adminFetch('/api/admin/reservation-list'),
        adminFetch('/api/admin/slot-options')
      ]);
      const reservationBody = await reservationResponse.json().catch(() => ({})) as ReservationBody;
      const slotBody = await slotResponse.json().catch(() => ({})) as SlotBody;
      if (!reservationResponse.ok || !reservationBody.ok) throw new Error(reservationBody.message ?? '予約一覧の取得に失敗しました。');
      if (!slotResponse.ok || !slotBody.ok) throw new Error(slotBody.message ?? '予約枠の取得に失敗しました。');
      setReservations(reservationBody.reservations ?? []);
      setSlots(slotBody.slots ?? []);
      setMessage('1週間の予約状況を時間軸で表示しています。青はセミパ、紫はヨガ、赤はイベント系です。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '週間予約カレンダーの取得に失敗しました。');
    }
  }

  useEffect(() => { void load(); }, []);

  const weekSlots = useMemo(() => slots.filter((slot) => {
    if (!slot.startsAt) return false;
    const d = new Date(slot.startsAt);
    return d >= start && d < end;
  }), [slots, start, end]);

  const weekReservations = useMemo(() => reservations.filter((row) => {
    if (!row.startsAt) return false;
    const d = new Date(row.startsAt);
    const key = search.trim().toLowerCase();
    const matched = !key || `${row.memberName} ${row.memberEmail} ${row.menuName} ${row.planName}`.toLowerCase().includes(key);
    return d >= start && d < end && matched;
  }), [reservations, start, end, search]);

  const reservationsBySlot = useMemo(() => {
    const map = new Map<string, ReservationRow[]>();
    weekReservations.forEach((row) => {
      if (!row.slotId) return;
      map.set(row.slotId, [...(map.get(row.slotId) ?? []), row]);
    });
    return map;
  }, [weekReservations]);

  const times = useMemo(() => Array.from(new Set([...defaultTimes(), ...weekSlots.map((slot) => timeKey(slot.startsAt)), ...weekReservations.map((row) => timeKey(row.startsAt))].filter(Boolean))).sort(), [weekSlots, weekReservations]);

  const slotMap = useMemo(() => {
    const map = new Map<string, SlotOption[]>();
    weekSlots.forEach((slot) => {
      const key = `${dayKey(slot.startsAt)}-${timeKey(slot.startsAt)}`;
      map.set(key, [...(map.get(key) ?? []), slot]);
    });
    return map;
  }, [weekSlots]);

  return (
    <AdminPage title="予約カレンダー" description="1週間の予約を、時間軸×日付軸で確認できます。">
      <div className="space-y-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-sm font-black">
              <button type="button" onClick={() => setWeekOffset((value) => value - 7)} className="rounded-full border px-3 py-2">‹</button>
              <button type="button" onClick={() => setWeekOffset(0)} className="rounded-full border px-3 py-2">今日</button>
              <button type="button" onClick={() => setWeekOffset((value) => value + 7)} className="rounded-full border px-3 py-2">›</button>
            </div>
            <p className="text-lg font-black text-gray-950">{monthFmt.format(start)}</p>
            <div className="flex items-center gap-2">
              <Link href="/owner/manual-reservation" className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white">＋予約</Link>
              <button type="button" onClick={() => void load()} className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-black">更新</button>
            </div>
          </div>
          <input className="mt-3 w-full rounded-xl border px-3 py-3 text-sm font-bold" placeholder="会員名・メール・メニューで検索" value={search} onChange={(event) => setSearch(event.target.value)} />
          <p className={`mt-3 rounded-2xl px-4 py-3 text-sm font-bold ${message.includes('失敗') || message.includes('サインイン') ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-900'}`}>{message}</p>
        </div>

        <section className="rounded-3xl border border-gray-200 bg-white p-2 shadow-sm">
          <div className="overflow-x-auto">
            <div className="grid min-w-[920px] gap-0 border-l border-t border-gray-200" style={{ gridTemplateColumns: '58px repeat(7, minmax(118px, 1fr))' }}>
              <div className="sticky left-0 z-20 border-b border-r border-gray-200 bg-white p-2 text-center text-xs font-black text-gray-500">時間</div>
              {days.map((day) => <div key={dayKey(day)} className="border-b border-r border-gray-200"><CalendarDayHeader dateKey={dayKey(day)} dateLabel={dateFmt.format(day)} weekdayLabel={weekFmt.format(day)} dense /></div>)}
              {times.map((time) => <div key={time} className="contents">
                <div className="sticky left-0 z-10 min-h-[74px] border-b border-r border-gray-200 bg-white p-1 text-center text-xs font-black text-gray-900">{time}</div>
                {days.map((day) => {
                  const key = `${dayKey(day)}-${time}`;
                  const cellSlots = slotMap.get(key) ?? [];
                  return <div key={key} className="min-h-[74px] border-b border-r border-gray-200 bg-white p-1">
                    {cellSlots.map((slot) => {
                      const booked = (reservationsBySlot.get(slot.id) ?? []).filter((row) => row.status !== 'cancelled');
                      if (booked.length === 0) {
                        return <div key={slot.id} className="mb-1 rounded border border-dashed border-gray-300 bg-gray-50 p-1 text-[10px] font-bold text-gray-400">{slot.menuName} 空 {slot.booked}/{slot.capacity}</div>;
                      }
                      return <div key={slot.id} className="mb-1 flex gap-1 overflow-hidden">
                        {booked.map((row) => <div key={row.id} className={`min-h-[64px] min-w-[30px] flex-1 rounded px-1 py-1 text-[11px] font-black leading-tight ring-1 ${menuColor(row.menuName)}`} style={{ writingMode: 'vertical-rl' }}>
                          {shortName(row.memberName)}{statusLabel(row.status)}
                        </div>)}
                      </div>;
                    })}
                  </div>;
                })}
              </div>)}
            </div>
          </div>
        </section>
      </div>
    </AdminPage>
  );
}
