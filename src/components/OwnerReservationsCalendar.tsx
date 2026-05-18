"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { CalendarDayHeader } from '@/components/CalendarDayHeader';
import { getSupabaseClient } from '@/lib/supabaseClient';

type CalReservation = { id: string; status: string; memberName: string; memberEmail: string; planName: string };
type CalSlot = { id: string; startsAt: string | null; endsAt: string | null; menuName: string; capacity: number; booked: number; isOpen: boolean; reservations: CalReservation[] };
type CalBody = { ok?: boolean; message?: string; slots?: CalSlot[] };
type Member = { id: string; full_name: string | null; email: string | null };
type Menu = { id: string; name: string; default_capacity: number };
type ViewMode = 'day' | 'week' | 'month';
type ModalState = { dateKey: string; time?: string; slots: CalSlot[] } | null;

const zone = 'Asia/Tokyo';
const keyFmt = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });
const dateFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: zone });
const weekFmt = new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: zone });
const monthFmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', timeZone: zone });
const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });

function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function parseDateKey(dateKey: string) { return new Date(`${dateKey}T00:00:00+09:00`); }
function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function addMonths(date: Date, months: number) { const next = new Date(date); next.setMonth(next.getMonth() + months); return next; }
function addYears(date: Date, years: number) { const next = new Date(date); next.setFullYear(next.getFullYear() + years); return next; }
function weekStart(date: Date) { const d = new Date(date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0); return d; }
function monthStart(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function monthGridStart(date: Date) { return weekStart(monthStart(date)); }
function dayKey(value: Date | string | null | undefined) { return value ? keyFmt.format(typeof value === 'string' ? new Date(value) : value) : ''; }
function timeKey(value: string | null | undefined) { return value ? timeFmt.format(new Date(value)) : ''; }
function inputDate(date: Date) { return keyFmt.format(date); }
function addMinutes(time: string, minutes: number) { const [h, m] = time.split(':').map(Number); const d = new Date(2000, 0, 1, h, m + minutes); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function defaultTimes() { const times: string[] = []; for (let t = '09:00'; t <= '22:30'; t = addMinutes(t, 30)) times.push(t); return times; }
function displayName(name: string) { return (name || '名前未設定').replace(/\s+/g, '').slice(0, 12); }
function menuColor(menu: string) { if (menu.includes('ヨガ')) return 'bg-purple-600 text-white ring-purple-800'; if (menu.includes('イベント') || menu.includes('セミナー') || menu.includes('座学')) return 'bg-red-600 text-white ring-red-800'; if (menu.includes('ブロック') || menu.includes('停止')) return 'bg-gray-300 text-gray-950 ring-gray-400'; return 'bg-blue-700 text-white ring-blue-900'; }
function statusText(status: string) { if (status === 'cancelled') return '取消'; if (status === 'attended') return '済'; if (status === 'no_show') return '無断'; return ''; }
function activeReservations(slot: CalSlot) { return slot.reservations.filter((row) => row.status !== 'cancelled'); }

export function OwnerReservationsCalendar() {
  const [slots, setSlots] = useState<CalSlot[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [message, setMessage] = useState('予約カレンダーを読み込んでいます。');
  const [search, setSearch] = useState('');
  const [baseDate, setBaseDate] = useState<Date>(() => today());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [busyId, setBusyId] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [reserveMemberId, setReserveMemberId] = useState('');
  const [reserveMenuId, setReserveMenuId] = useState('');
  const [reserveSlotId, setReserveSlotId] = useState('');
  const [reserveMinutes, setReserveMinutes] = useState(40);
  const [reserveCapacity, setReserveCapacity] = useState(5);

  const range = useMemo(() => {
    if (viewMode === 'day') {
      const start = new Date(baseDate); start.setHours(0, 0, 0, 0);
      return { start, end: addDays(start, 1) };
    }
    if (viewMode === 'month') {
      const start = monthGridStart(baseDate);
      return { start, end: addDays(start, 42) };
    }
    const start = weekStart(baseDate);
    return { start, end: addDays(start, 7) };
  }, [baseDate, viewMode]);

  const days = useMemo(() => {
    const length = viewMode === 'day' ? 1 : viewMode === 'month' ? 42 : 7;
    return Array.from({ length }, (_, i) => addDays(range.start, i));
  }, [range.start, viewMode]);

  async function token() { const client = getSupabaseClient(); if (!client) return ''; const { data } = await client.auth.getSession(); return data.session?.access_token ?? ''; }
  async function adminFetch(path: string, init?: RequestInit) { const accessToken = await token(); if (!accessToken) throw new Error('管理者としてサインインしてください。'); return fetch(path, { ...init, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, cache: 'no-store' }); }

  const load = useCallback(async () => {
    try {
      setMessage('予約カレンダーを読み込んでいます。');
      const [calendarResponse, memberResponse, menuResponse] = await Promise.all([
        adminFetch(`/api/admin/calendar?start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}`),
        adminFetch('/api/admin/members'),
        adminFetch('/api/admin/menus')
      ]);
      const calendarBody = await calendarResponse.json().catch(() => ({})) as CalBody;
      const memberBody = await memberResponse.json().catch(() => ({})) as { ok?: boolean; members?: Member[]; message?: string };
      const menuBody = await menuResponse.json().catch(() => ({})) as { ok?: boolean; menus?: Menu[]; message?: string };
      if (!calendarResponse.ok || !calendarBody.ok) throw new Error(calendarBody.message ?? '予約カレンダーの取得に失敗しました。');
      if (!memberResponse.ok || !memberBody.ok) throw new Error(memberBody.message ?? '会員一覧の取得に失敗しました。');
      if (!menuResponse.ok || !menuBody.ok) throw new Error(menuBody.message ?? 'メニュー一覧の取得に失敗しました。');
      setSlots(calendarBody.slots ?? []);
      setMembers(memberBody.members ?? []);
      setMenus(menuBody.menus ?? []);
      setReserveMemberId((current) => current || memberBody.members?.[0]?.id || '');
      setReserveMenuId((current) => current || menuBody.menus?.[0]?.id || '');
      setReserveCapacity((current) => current || menuBody.menus?.[0]?.default_capacity || 5);
      setMessage('時間枠を押すと代理予約、予約入りの枠を押すと予約者確認・キャンセルができます。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '予約カレンダーの取得に失敗しました。');
    }
  }, [range.start, range.end]);

  useEffect(() => { void load(); }, [load]);

  const filteredSlots = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return slots;
    return slots.map((slot) => ({ ...slot, reservations: slot.reservations.filter((r) => `${r.memberName} ${r.memberEmail} ${r.planName} ${slot.menuName}`.toLowerCase().includes(keyword)) })).filter((slot) => slot.reservations.length > 0 || slot.menuName.toLowerCase().includes(keyword));
  }, [slots, search]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, CalSlot[]>();
    filteredSlots.forEach((slot) => {
      const key = dayKey(slot.startsAt);
      map.set(key, [...(map.get(key) ?? []), slot]);
    });
    return map;
  }, [filteredSlots]);

  const times = useMemo(() => Array.from(new Set([...defaultTimes(), ...filteredSlots.map((slot) => timeKey(slot.startsAt))].filter(Boolean))).sort(), [filteredSlots]);
  const slotMap = useMemo(() => {
    const map = new Map<string, CalSlot[]>();
    filteredSlots.forEach((slot) => {
      const key = `${dayKey(slot.startsAt)}-${timeKey(slot.startsAt)}`;
      map.set(key, [...(map.get(key) ?? []), slot]);
    });
    return map;
  }, [filteredSlots]);

  function openCell(dateKeyValue: string, time?: string, cellSlots: CalSlot[] = []) {
    setModal({ dateKey: dateKeyValue, time, slots: cellSlots });
    setReserveSlotId(cellSlots[0]?.id ?? '');
    const slotMenu = cellSlots[0]?.menuName;
    const menu = slotMenu ? menus.find((m) => m.name === slotMenu) : menus[0];
    setReserveMenuId(menu?.id ?? menus[0]?.id ?? '');
    setReserveCapacity(menu?.default_capacity ?? 5);
  }

  async function cancelReservation(row: CalReservation, slot: CalSlot) {
    if (row.status === 'cancelled') return;
    if (!window.confirm(`${row.memberName}さんの ${timeKey(slot.startsAt)} ${slot.menuName} の予約をキャンセルしますか？`)) return;
    setBusyId(row.id);
    try {
      const response = await adminFetch('/api/admin/reservation-cancel', { method: 'POST', body: JSON.stringify({ reservationId: row.id }) });
      const body = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) throw new Error(body.message ?? 'キャンセルに失敗しました。');
      setMessage('予約をキャンセルしました。');
      setModal(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'キャンセルに失敗しました。');
    } finally {
      setBusyId('');
    }
  }

  async function proxyReserve() {
    if (!modal) return;
    if (!reserveMemberId) return setMessage('会員を選択してください。');
    const existingSlot = modal.slots.find((slot) => slot.id === reserveSlotId);
    const body = existingSlot
      ? { memberId: reserveMemberId, slotId: existingSlot.id }
      : { memberId: reserveMemberId, menuId: reserveMenuId, date: modal.dateKey, time: modal.time, minutes: reserveMinutes, capacity: reserveCapacity };
    setBusyId('reserve');
    try {
      const response = await adminFetch('/api/admin/manual-reservation', { method: 'POST', body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message ?? '代理予約に失敗しました。');
      setMessage(result.message ?? '代理予約を入れました。');
      setModal(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '代理予約に失敗しました。');
    } finally {
      setBusyId('');
    }
  }

  function move(delta: number) {
    if (viewMode === 'day') setBaseDate((d) => addDays(d, delta));
    else if (viewMode === 'month') setBaseDate((d) => addMonths(d, delta));
    else setBaseDate((d) => addDays(d, delta * 7));
  }

  const headerRange = viewMode === 'day' ? `${dateFmt.format(days[0])}（${weekFmt.format(days[0])}）` : viewMode === 'month' ? monthFmt.format(baseDate) : `${dateFmt.format(days[0])}〜${dateFmt.format(days[6])}`;

  return (
    <AdminPage title="予約カレンダー" description="1日・1週間・1ヶ月の予約を確認できます。">
      <div className="space-y-3">
        <div className="rounded-3xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <button type="button" onClick={() => move(-1)} className="rounded-full border px-3 py-2 text-xs font-black">‹前</button>
            <div className="text-center"><p className="text-lg font-black text-gray-950">{monthFmt.format(baseDate)}</p><p className="text-xs font-bold text-gray-500">{headerRange}</p></div>
            <button type="button" onClick={() => move(1)} className="rounded-full border px-3 py-2 text-xs font-black">次›</button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-8">
            <button type="button" onClick={() => setBaseDate(today())} className="rounded-full bg-yellow-400 px-2 py-2 text-xs font-black">今日</button>
            {(['day', 'week', 'month'] as const).map((mode) => <button key={mode} type="button" onClick={() => setViewMode(mode)} className={`rounded-full px-2 py-2 text-xs font-black ${viewMode === mode ? 'bg-gray-900 text-white' : 'border'}`}>{mode === 'day' ? '1日' : mode === 'week' ? '1週間' : '1ヶ月'}</button>)}
            <button type="button" onClick={() => setBaseDate((d) => addMonths(d, -1))} className="rounded-full border px-2 py-2 text-xs font-black">前月</button>
            <button type="button" onClick={() => setBaseDate((d) => addMonths(d, 1))} className="rounded-full border px-2 py-2 text-xs font-black">次月</button>
            <input type="date" value={inputDate(baseDate)} onChange={(e) => setBaseDate(new Date(`${e.target.value}T00:00:00+09:00`))} className="rounded-full border px-2 py-2 text-xs font-black" />
            <Link href="/owner/manual-reservation" className="rounded-full bg-blue-600 px-2 py-2 text-center text-xs font-black text-white">＋代理予約</Link>
          </div>
          <input className="mt-3 w-full rounded-xl border px-3 py-3 text-sm font-bold" placeholder="会員名・メール・メニューで検索" value={search} onChange={(e) => setSearch(e.target.value)} />
          <p className={`mt-3 rounded-2xl px-4 py-3 text-sm font-bold ${message.includes('失敗') || message.includes('サインイン') ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-900'}`}>{message}</p>
        </div>

        {viewMode === 'month' ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
            <div className="grid grid-cols-7 gap-0 border-l border-t border-gray-200">
              {days.map((day) => {
                const key = dayKey(day);
                const daySlots = slotsByDay.get(key) ?? [];
                const inMonth = day.getMonth() === baseDate.getMonth();
                return <button key={key} type="button" onClick={() => openCell(key, '09:00', daySlots)} className={`min-h-[92px] border-b border-r border-gray-200 p-1 text-left ${inMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'}`}>
                  <p className="text-xs font-black">{dateFmt.format(day)}</p>
                  <div className="mt-1 space-y-0.5">{daySlots.slice(0, 4).map((slot) => <div key={slot.id} className={`truncate rounded px-1 py-0.5 text-[10px] font-black ${activeReservations(slot).length ? menuColor(slot.menuName) : 'bg-gray-100 text-gray-500'}`}>{timeKey(slot.startsAt)} {activeReservations(slot).map((r) => displayName(r.memberName)).join('、') || `空${slot.booked}/${slot.capacity}`}</div>)}</div>
                </button>;
              })}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
            <div className="w-full overflow-x-hidden">
              <div className="grid w-full gap-0 border-l border-t border-gray-200" style={{ gridTemplateColumns: `42px repeat(${days.length}, minmax(0, 1fr))` }}>
                <div className="sticky left-0 z-20 border-b border-r border-gray-200 bg-white p-1 text-center text-[10px] font-black text-gray-500">時間</div>
                {days.map((day) => <div key={dayKey(day)} className="border-b border-r border-gray-200"><CalendarDayHeader dateKey={dayKey(day)} dateLabel={dateFmt.format(day)} weekdayLabel={weekFmt.format(day)} dense /></div>)}
                {times.map((time) => <div key={time} className="contents">
                  <div className="sticky left-0 z-10 min-h-[62px] border-b border-r border-gray-200 bg-white p-1 text-center text-[10px] font-black text-gray-900">{time}</div>
                  {days.map((day) => {
                    const key = `${dayKey(day)}-${time}`;
                    const cellSlots = slotMap.get(key) ?? [];
                    return <button type="button" key={key} onClick={() => openCell(dayKey(day), time, cellSlots)} className="min-h-[62px] overflow-hidden border-b border-r border-gray-200 bg-white p-0.5 text-left">
                      {cellSlots.map((slot) => {
                        const active = activeReservations(slot);
                        if (active.length === 0) return <div key={slot.id} className="mb-0.5 rounded border border-dashed border-gray-300 bg-gray-50 px-0.5 py-1 text-center text-[9px] font-bold leading-tight text-gray-400">空{slot.booked}/{slot.capacity}</div>;
                        return <div key={slot.id} className="mb-0.5 flex gap-0.5 overflow-hidden">{active.map((row) => <div key={row.id} className={`min-h-[56px] min-w-0 flex-1 rounded px-0.5 py-1 text-[10px] font-black leading-tight ring-1 ${menuColor(slot.menuName)}`} style={{ writingMode: 'vertical-rl' }}>{displayName(row.memberName)}{statusText(row.status)}</div>)}</div>;
                      })}
                    </button>;
                  })}
                </div>)}
              </div>
            </div>
          </section>
        )}

        {modal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-4 shadow-xl">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xl font-black">{modal.dateKey} {modal.time ?? ''}</p><p className="text-sm font-bold text-gray-500">予約確認・代理予約</p></div><button type="button" onClick={() => setModal(null)} className="rounded-full border px-3 py-1 font-black">×</button></div>
              <div className="mt-4 space-y-3">
                {modal.slots.length > 0 ? modal.slots.map((slot) => <div key={slot.id} className="rounded-2xl border p-3"><p className="font-black">{timeKey(slot.startsAt)} {slot.menuName} {slot.booked}/{slot.capacity}名</p><div className="mt-2 grid gap-2">{slot.reservations.filter((r) => r.status !== 'cancelled').map((row) => <div key={row.id} className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 p-2"><span className="text-sm font-black">{row.memberName}<span className="ml-1 text-xs text-gray-500">{row.planName}</span></span><button type="button" disabled={busyId === row.id} onClick={() => void cancelReservation(row, slot)} className="rounded-full border border-red-300 px-3 py-1 text-xs font-black text-red-600">キャンセル</button></div>)}{slot.reservations.filter((r) => r.status !== 'cancelled').length === 0 && <p className="rounded-xl bg-gray-50 p-2 text-sm font-bold text-gray-500">予約者はいません。</p>}</div></div>) : <p className="rounded-2xl bg-gray-50 p-3 text-sm font-bold text-gray-500">この時間にはまだ予約枠がありません。下から枠を作って予約できます。</p>}
                <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-3"><p className="font-black">この時間に代理予約を入れる</p><div className="mt-3 grid gap-2"><select value={reserveMemberId} onChange={(e) => setReserveMemberId(e.target.value)} className="rounded-xl border px-3 py-2 font-bold"><option value="">会員を選択</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email || m.id}</option>)}</select>{modal.slots.length > 0 && <select value={reserveSlotId} onChange={(e) => setReserveSlotId(e.target.value)} className="rounded-xl border px-3 py-2 font-bold"><option value="">新しい枠を作る</option>{modal.slots.map((slot) => <option key={slot.id} value={slot.id}>{timeKey(slot.startsAt)} {slot.menuName} {slot.booked}/{slot.capacity}名</option>)}</select>}{!reserveSlotId && <><select value={reserveMenuId} onChange={(e) => { const menu = menus.find((m) => m.id === e.target.value); setReserveMenuId(e.target.value); setReserveCapacity(menu?.default_capacity ?? 5); }} className="rounded-xl border px-3 py-2 font-bold">{menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><div className="grid grid-cols-2 gap-2"><input type="number" min="5" value={reserveMinutes} onChange={(e) => setReserveMinutes(Number(e.target.value))} className="rounded-xl border px-3 py-2" /><input type="number" min="1" value={reserveCapacity} onChange={(e) => setReserveCapacity(Number(e.target.value))} className="rounded-xl border px-3 py-2" /></div></>}<button type="button" disabled={busyId === 'reserve'} onClick={() => void proxyReserve()} className="rounded-full bg-yellow-400 px-4 py-3 font-black disabled:opacity-50">{busyId === 'reserve' ? '予約中' : '予約を入れる'}</button></div></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminPage>
  );
}
