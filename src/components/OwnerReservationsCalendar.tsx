"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { CalendarDayHeader } from '@/components/CalendarDayHeader';
import { getSupabaseClient } from '@/lib/supabaseClient';

type CalReservation = { id: string; status: string; memberName: string; memberEmail: string; planName: string };
type CalSlot = { id: string; startsAt: string | null; endsAt: string | null; menuName: string; capacity: number; booked: number; isOpen: boolean; reservations: CalReservation[] };
type CalBody = { ok?: boolean; message?: string; slots?: CalSlot[] };

const zone = 'Asia/Tokyo';
const keyFmt = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });
const dateFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: zone });
const weekFmt = new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: zone });
const monthFmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', timeZone: zone });
const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });

function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function addMonths(date: Date, months: number) { const next = new Date(date); next.setMonth(next.getMonth() + months); return next; }
function addYears(date: Date, years: number) { const next = new Date(date); next.setFullYear(next.getFullYear() + years); return next; }
function weekStart(date: Date) { const d = new Date(date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0); return d; }
function dayKey(value: Date | string | null | undefined) { return value ? keyFmt.format(typeof value === 'string' ? new Date(value) : value) : ''; }
function timeKey(value: string | null | undefined) { return value ? timeFmt.format(new Date(value)) : ''; }
function inputDate(date: Date) { return keyFmt.format(date); }
function addMinutes(time: string, minutes: number) { const [h, m] = time.split(':').map(Number); const d = new Date(2000, 0, 1, h, m + minutes); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function defaultTimes() { const times: string[] = []; for (let t = '09:00'; t <= '22:30'; t = addMinutes(t, 30)) times.push(t); return times; }
function displayName(name: string) { return (name || '名前未設定').replace(/\s+/g, '').slice(0, 12); }
function menuColor(menu: string) { if (menu.includes('ヨガ')) return 'bg-purple-600 text-white ring-purple-800'; if (menu.includes('イベント') || menu.includes('セミナー') || menu.includes('座学')) return 'bg-red-600 text-white ring-red-800'; if (menu.includes('ブロック') || menu.includes('停止')) return 'bg-gray-300 text-gray-950 ring-gray-400'; return 'bg-blue-700 text-white ring-blue-900'; }
function statusText(status: string) { if (status === 'cancelled') return '取消'; if (status === 'attended') return '済'; if (status === 'no_show') return '無断'; return ''; }

export function OwnerReservationsCalendar() {
  const [slots, setSlots] = useState<CalSlot[]>([]);
  const [message, setMessage] = useState('週間予約カレンダーを読み込んでいます。');
  const [search, setSearch] = useState('');
  const [baseDate, setBaseDate] = useState<Date>(() => today());
  const [busyId, setBusyId] = useState('');

  const start = useMemo(() => weekStart(baseDate), [baseDate]);
  const end = useMemo(() => addDays(start, 7), [start]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);

  async function token() { const client = getSupabaseClient(); if (!client) return ''; const { data } = await client.auth.getSession(); return data.session?.access_token ?? ''; }
  async function adminFetch(path: string, init?: RequestInit) { const accessToken = await token(); if (!accessToken) throw new Error('管理者としてサインインしてください。'); return fetch(path, { ...init, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, cache: 'no-store' }); }

  const load = useCallback(async () => {
    try {
      setMessage('週間予約カレンダーを読み込んでいます。');
      const response = await adminFetch(`/api/admin/calendar?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
      const body = await response.json().catch(() => ({})) as CalBody;
      if (!response.ok || !body.ok) throw new Error(body.message ?? '予約カレンダーの取得に失敗しました。');
      setSlots(body.slots ?? []);
      setMessage('前週・次週・前月・翌月・前年・翌年・日付指定で、過去も未来も確認できます。予約カードを押すとキャンセルできます。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '予約カレンダーの取得に失敗しました。');
    }
  }, [start, end]);

  useEffect(() => { void load(); }, [load]);

  const filteredSlots = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return slots;
    return slots.map((slot) => ({ ...slot, reservations: slot.reservations.filter((r) => `${r.memberName} ${r.memberEmail} ${r.planName} ${slot.menuName}`.toLowerCase().includes(keyword)) })).filter((slot) => slot.reservations.length > 0 || slot.menuName.toLowerCase().includes(keyword));
  }, [slots, search]);

  const times = useMemo(() => Array.from(new Set([...defaultTimes(), ...filteredSlots.map((slot) => timeKey(slot.startsAt))].filter(Boolean))).sort(), [filteredSlots]);
  const slotMap = useMemo(() => {
    const map = new Map<string, CalSlot[]>();
    filteredSlots.forEach((slot) => {
      const key = `${dayKey(slot.startsAt)}-${timeKey(slot.startsAt)}`;
      map.set(key, [...(map.get(key) ?? []), slot]);
    });
    return map;
  }, [filteredSlots]);

  async function cancelReservation(row: CalReservation, slot: CalSlot) {
    if (row.status === 'cancelled') return;
    if (!window.confirm(`${row.memberName}さんの ${timeKey(slot.startsAt)} ${slot.menuName} の予約をキャンセルしますか？`)) return;
    setBusyId(row.id);
    try {
      const response = await adminFetch('/api/admin/reservation-cancel', { method: 'POST', body: JSON.stringify({ reservationId: row.id }) });
      const body = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) throw new Error(body.message ?? 'キャンセルに失敗しました。');
      setMessage('予約をキャンセルしました。');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'キャンセルに失敗しました。');
    } finally {
      setBusyId('');
    }
  }

  return (
    <AdminPage title="予約カレンダー" description="1週間の予約を、時間軸×日付軸で確認できます。">
      <div className="space-y-3">
        <div className="rounded-3xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <button type="button" onClick={() => setBaseDate((d) => addDays(d, -7))} className="rounded-full border px-3 py-2 text-xs font-black">‹前週</button>
            <div className="text-center"><p className="text-lg font-black text-gray-950">{monthFmt.format(start)}</p><p className="text-xs font-bold text-gray-500">{dateFmt.format(days[0])}〜{dateFmt.format(days[6])}</p></div>
            <button type="button" onClick={() => setBaseDate((d) => addDays(d, 7))} className="rounded-full border px-3 py-2 text-xs font-black">次週›</button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-7">
            <button type="button" onClick={() => setBaseDate(today())} className="rounded-full bg-yellow-400 px-2 py-2 text-xs font-black">今日</button>
            <button type="button" onClick={() => setBaseDate((d) => addMonths(d, -1))} className="rounded-full border px-2 py-2 text-xs font-black">前月</button>
            <button type="button" onClick={() => setBaseDate((d) => addMonths(d, 1))} className="rounded-full border px-2 py-2 text-xs font-black">次月</button>
            <button type="button" onClick={() => setBaseDate((d) => addYears(d, -1))} className="rounded-full border px-2 py-2 text-xs font-black">前年</button>
            <button type="button" onClick={() => setBaseDate((d) => addYears(d, 1))} className="rounded-full border px-2 py-2 text-xs font-black">翌年</button>
            <input type="date" value={inputDate(baseDate)} onChange={(e) => setBaseDate(new Date(`${e.target.value}T00:00:00+09:00`))} className="rounded-full border px-2 py-2 text-xs font-black" />
            <Link href="/owner/manual-reservation" className="rounded-full bg-blue-600 px-2 py-2 text-center text-xs font-black text-white">＋代理予約</Link>
          </div>
          <input className="mt-3 w-full rounded-xl border px-3 py-3 text-sm font-bold" placeholder="会員名・メール・メニューで検索" value={search} onChange={(e) => setSearch(e.target.value)} />
          <p className={`mt-3 rounded-2xl px-4 py-3 text-sm font-bold ${message.includes('失敗') || message.includes('サインイン') ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-900'}`}>{message}</p>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
          <div className="w-full overflow-x-hidden">
            <div className="grid w-full gap-0 border-l border-t border-gray-200" style={{ gridTemplateColumns: '42px repeat(7, minmax(0, 1fr))' }}>
              <div className="sticky left-0 z-20 border-b border-r border-gray-200 bg-white p-1 text-center text-[10px] font-black text-gray-500">時間</div>
              {days.map((day) => <div key={dayKey(day)} className="border-b border-r border-gray-200"><CalendarDayHeader dateKey={dayKey(day)} dateLabel={dateFmt.format(day)} weekdayLabel={weekFmt.format(day)} dense /></div>)}
              {times.map((time) => <div key={time} className="contents">
                <div className="sticky left-0 z-10 min-h-[62px] border-b border-r border-gray-200 bg-white p-1 text-center text-[10px] font-black text-gray-900">{time}</div>
                {days.map((day) => {
                  const key = `${dayKey(day)}-${time}`;
                  const cellSlots = slotMap.get(key) ?? [];
                  return <div key={key} className="min-h-[62px] overflow-hidden border-b border-r border-gray-200 bg-white p-0.5">
                    {cellSlots.map((slot) => {
                      const active = slot.reservations.filter((row) => row.status !== 'cancelled');
                      if (active.length === 0) return <div key={slot.id} className="mb-0.5 rounded border border-dashed border-gray-300 bg-gray-50 px-0.5 py-1 text-center text-[9px] font-bold leading-tight text-gray-400">空{slot.booked}/{slot.capacity}</div>;
                      return <div key={slot.id} className="mb-0.5 flex gap-0.5 overflow-hidden">
                        {active.map((row) => <button key={row.id} type="button" disabled={busyId === row.id} title={`${row.memberName} / ${slot.menuName}`} onClick={() => void cancelReservation(row, slot)} className={`min-h-[56px] min-w-0 flex-1 rounded px-0.5 py-1 text-[10px] font-black leading-tight ring-1 disabled:opacity-50 ${menuColor(slot.menuName)}`} style={{ writingMode: 'vertical-rl' }}>
                          {displayName(row.memberName)}{statusText(row.status)}
                        </button>)}
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
