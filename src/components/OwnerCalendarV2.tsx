"use client";

import { useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { CalendarDayHeader } from '@/components/CalendarDayHeader';
import { getSupabaseClient } from '@/lib/supabaseClient';

type ViewMode = 'day' | 'week' | 'month';
type Reservation = { id: string; status: string; memberName: string; memberEmail: string; planName: string };
type Slot = { id: string; startsAt: string | null; endsAt: string | null; menuName: string; capacity: number; booked: number; isOpen: boolean; reservations: Reservation[] };
type Member = { id: string; full_name: string | null; email: string | null };
type Menu = { id: string; name: string; default_capacity: number };
type Modal = { dateKey: string; time: string; slots: Slot[] } | null;

const zone = 'Asia/Tokyo';
const keyFmt = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });
const dateFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: zone });
const weekFmt = new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: zone });
const monthFmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', timeZone: zone });
const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });

function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function weekStart(d: Date) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; }
function monthGridStart(d: Date) { return weekStart(new Date(d.getFullYear(), d.getMonth(), 1)); }
function keyOf(v: Date | string | null) { return v ? keyFmt.format(typeof v === 'string' ? new Date(v) : v) : ''; }
function timeOf(v: string | null) { return v ? timeFmt.format(new Date(v)) : ''; }
function inputDate(d: Date) { return keyFmt.format(d); }
function addMinutes(t: string, m: number) { const [h, min] = t.split(':').map(Number); const d = new Date(2000, 0, 1, h, min + m); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function timeRows() { const a: string[] = []; for (let t = '09:00'; t <= '22:30'; t = addMinutes(t, 30)) a.push(t); return a; }
function shortName(v: string) { return (v || '名前未設定').replace(/\s+/g, '').slice(0, 12); }
function active(slot: Slot) { return slot.reservations.filter((r) => r.status !== 'cancelled'); }
function color(menu: string) { if (menu.includes('ヨガ')) return 'bg-purple-600 text-white'; if (menu.includes('イベント') || menu.includes('セミナー') || menu.includes('座学')) return 'bg-red-600 text-white'; return 'bg-blue-700 text-white'; }

export function OwnerCalendarV2() {
  const [view, setView] = useState<ViewMode>('week');
  const [base, setBase] = useState<Date>(() => today());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [memberId, setMemberId] = useState('');
  const [menuId, setMenuId] = useState('');
  const [slotId, setSlotId] = useState('');
  const [minutes, setMinutes] = useState(40);
  const [capacity, setCapacity] = useState(5);
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});

  const range = useMemo(() => {
    if (view === 'day') { const s = new Date(base); s.setHours(0, 0, 0, 0); return { start: s, end: addDays(s, 1) }; }
    if (view === 'month') { const s = monthGridStart(base); return { start: s, end: addDays(s, 42) }; }
    const s = weekStart(base); return { start: s, end: addDays(s, 7) };
  }, [base, view]);
  const days = useMemo(() => Array.from({ length: view === 'day' ? 1 : view === 'month' ? 42 : 7 }, (_, i) => addDays(range.start, i)), [range.start, view]);

  async function token() { const c = getSupabaseClient(); if (!c) return ''; const { data } = await c.auth.getSession(); return data.session?.access_token ?? ''; }
  async function adminFetch(path: string, init?: RequestInit) {
    const t = await token();
    if (!t) throw new Error('管理者としてログインしてください。');
    return fetch(path, { ...init, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, cache: 'no-store' });
  }

  async function load() {
    try {
      const [calRes, memRes, menuRes] = await Promise.all([
        adminFetch(`/api/admin/calendar?start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}`),
        adminFetch('/api/admin/members'),
        adminFetch('/api/admin/menus')
      ]);
      const cal = await calRes.json().catch(() => ({})) as { ok?: boolean; message?: string; slots?: Slot[] };
      const mem = await memRes.json().catch(() => ({})) as { ok?: boolean; message?: string; members?: Member[] };
      const menu = await menuRes.json().catch(() => ({})) as { ok?: boolean; message?: string; menus?: Menu[] };
      if (!calRes.ok || !cal.ok) throw new Error(cal.message ?? 'カレンダー取得に失敗しました。');
      if (!memRes.ok || !mem.ok) throw new Error(mem.message ?? '会員取得に失敗しました。');
      if (!menuRes.ok || !menu.ok) throw new Error(menu.message ?? 'メニュー取得に失敗しました。');
      setSlots(cal.slots ?? []);
      setMembers(mem.members ?? []);
      setMenus(menu.menus ?? []);
      setMemberId((v) => v || mem.members?.[0]?.id || '');
      setMenuId((v) => v || menu.menus?.[0]?.id || '');
      setCapacity((v) => v || menu.menus?.[0]?.default_capacity || 5);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '読み込みに失敗しました。');
    }
  }
  useEffect(() => { void load(); }, [range.start, range.end]);

  const keyword = search.trim().toLowerCase();
  const suggestions = useMemo(() => showSuggestions ? members.filter((m) => !keyword || `${m.full_name ?? ''} ${m.email ?? ''}`.toLowerCase().includes(keyword)).slice(0, 8) : [], [members, keyword, showSuggestions]);
  const visibleSlots = useMemo(() => {
    if (!keyword) return slots;
    return slots.map((s) => ({ ...s, reservations: s.reservations.filter((r) => `${r.memberName} ${r.memberEmail} ${s.menuName}`.toLowerCase().includes(keyword)) })).filter((s) => s.reservations.length || s.menuName.toLowerCase().includes(keyword));
  }, [slots, keyword]);
  const slotsByCell = useMemo(() => {
    const map = new Map<string, Slot[]>();
    visibleSlots.forEach((s) => { const k = `${keyOf(s.startsAt)}-${timeOf(s.startsAt)}`; map.set(k, [...(map.get(k) ?? []), s]); });
    return map;
  }, [visibleSlots]);
  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    visibleSlots.forEach((s) => { const k = keyOf(s.startsAt); map.set(k, [...(map.get(k) ?? []), s]); });
    return map;
  }, [visibleSlots]);
  const times = useMemo(() => Array.from(new Set([...timeRows(), ...visibleSlots.map((s) => timeOf(s.startsAt))].filter(Boolean))).sort(), [visibleSlots]);
  const moveOptions = useMemo(() => slots.filter((s) => s.isOpen && s.startsAt && new Date(s.startsAt).getTime() > Date.now()).sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))), [slots]);

  function openCell(dateKey: string, time: string, cellSlots: Slot[]) {
    setModal({ dateKey, time, slots: cellSlots });
    setSlotId(cellSlots[0]?.id ?? '');
    const menu = cellSlots[0] ? menus.find((m) => m.name === cellSlots[0].menuName) : menus[0];
    setMenuId(menu?.id ?? menus[0]?.id ?? '');
    setCapacity(menu?.default_capacity ?? 5);
  }
  function step(n: number) { if (view === 'day') setBase((d) => addDays(d, n)); else if (view === 'month') setBase((d) => addMonths(d, n)); else setBase((d) => addDays(d, n * 7)); }

  async function doCancel(reservationId: string) {
    setBusy(reservationId);
    try {
      const res = await adminFetch('/api/admin/reservation-cancel', { method: 'POST', body: JSON.stringify({ reservationId }) });
      const body = await res.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (!res.ok || !body.ok) throw new Error(body.message ?? 'キャンセルに失敗しました。');
      setNotice('予約をキャンセルしました。'); setModal(null); await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : 'キャンセルに失敗しました。'); } finally { setBusy(''); }
  }
  async function doReserve() {
    if (!modal || !memberId) return setNotice('会員を選択してください。');
    const selectedSlot = modal.slots.find((s) => s.id === slotId);
    const body = selectedSlot ? { memberId, slotId: selectedSlot.id } : { memberId, menuId, date: modal.dateKey, time: modal.time, minutes, capacity };
    setBusy('reserve');
    try {
      const res = await adminFetch('/api/admin/manual-reservation', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.message ?? '予約に失敗しました。');
      setNotice(data.message ?? '予約を入れました。'); setModal(null); await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : '予約に失敗しました。'); } finally { setBusy(''); }
  }
  async function doMove(reservationId: string) {
    const targetSlotId = moveTo[reservationId];
    if (!targetSlotId) return setNotice('移動先を選択してください。');
    setBusy(`move-${reservationId}`);
    try {
      const res = await adminFetch('/api/admin/reservation-move', { method: 'POST', body: JSON.stringify({ reservationId, targetSlotId }) });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.message ?? '移動に失敗しました。');
      setNotice('予約を移動しました。'); setModal(null); await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : '移動に失敗しました。'); } finally { setBusy(''); }
  }

  const rangeLabel = view === 'day' ? `${dateFmt.format(days[0])}（${weekFmt.format(days[0])}）` : view === 'month' ? monthFmt.format(base) : `${dateFmt.format(days[0])}〜${dateFmt.format(days[6])}`;
  const prev = view === 'day' ? '前日' : view === 'month' ? '前月' : '前週';
  const next = view === 'day' ? '翌日' : view === 'month' ? '次月' : '次週';

  return <AdminPage title="予約カレンダー" description=""><div className="space-y-3"><div className="rounded-3xl border bg-white p-3 shadow-sm"><div className="grid grid-cols-[auto_1fr_auto] items-center gap-2"><button onClick={() => setBase((d) => addMonths(d, -1))} className="rounded-full border px-3 py-2 text-xs font-black">前月</button><div className="text-center"><p className="text-lg font-black">{monthFmt.format(base)}</p><p className="text-xs font-bold text-gray-500">{rangeLabel}</p></div><button onClick={() => setBase((d) => addMonths(d, 1))} className="rounded-full border px-3 py-2 text-xs font-black">次月</button></div><div className="mt-3 grid grid-cols-3 gap-2"><button onClick={() => step(-1)} className="rounded-full border px-2 py-2 text-xs font-black">‹ {prev}</button><button onClick={() => setBase(today())} className="rounded-full bg-yellow-400 px-2 py-2 text-xs font-black">今日</button><button onClick={() => step(1)} className="rounded-full border px-2 py-2 text-xs font-black">{next} ›</button></div><div className="mt-3 grid grid-cols-4 gap-2">{(['day','week','month'] as const).map((m) => <button key={m} onClick={() => setView(m)} className={`rounded-full px-2 py-2 text-xs font-black ${view === m ? 'bg-gray-900 text-white' : 'border'}`}>{m === 'day' ? '1日' : m === 'week' ? '1週間' : '1ヶ月'}</button>)}<button onClick={() => setBase(today())} className="rounded-full border px-2 py-2 text-xs font-black">現在日</button></div><details className="mt-2 rounded-2xl border bg-gray-50 p-2 text-xs font-bold"><summary>日付指定</summary><input type="date" value={inputDate(base)} onChange={(e) => setBase(new Date(`${e.target.value}T00:00:00+09:00`))} className="mt-2 w-full rounded-xl border px-3 py-2" /></details><div className="relative mt-3"><input className="w-full rounded-xl border px-3 py-3 text-sm font-bold" placeholder="会員名・メール・メニューで検索" value={search} onFocus={() => setShowSuggestions(true)} onChange={(e) => setSearch(e.target.value)} />{suggestions.length > 0 && <div className="absolute left-0 right-0 z-30 mt-1 rounded-2xl border bg-white p-2 shadow-lg">{suggestions.map((m) => <button key={m.id} onMouseDown={() => { setSearch(m.full_name || m.email || ''); setShowSuggestions(false); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-yellow-50">{m.full_name || '名前未設定'}<span className="ml-2 text-xs text-gray-500">{m.email}</span></button>)}</div>}</div>{notice && <p className="mt-3 rounded-2xl bg-yellow-50 p-3 text-sm font-bold text-yellow-900">{notice}</p>}</div>{view === 'month' ? <section className="rounded-2xl border bg-white p-1 shadow-sm"><div className="grid grid-cols-7 border-l border-t">{days.map((d) => { const k = keyOf(d); const list = slotsByDay.get(k) ?? []; return <button key={k} onClick={() => openCell(k, '09:00', list)} className="min-h-[92px] border-b border-r p-1 text-left"><p className="text-xs font-black">{dateFmt.format(d)}</p>{list.slice(0, 4).map((s) => <div key={s.id} className={`mt-0.5 truncate rounded px-1 py-0.5 text-[10px] font-black ${active(s).length ? color(s.menuName) : 'bg-gray-100 text-gray-500'}`}>{timeOf(s.startsAt)} {active(s).map((r) => shortName(r.memberName)).join('、') || `空${s.booked}/${s.capacity}`}</div>)}</button>; })}</div></section> : <section className="rounded-2xl border bg-white p-1 shadow-sm"><div className="w-full overflow-x-hidden"><div className="grid w-full border-l border-t" style={{ gridTemplateColumns: `42px repeat(${days.length}, minmax(0,1fr))` }}><div className="border-b border-r p-1 text-center text-[10px] font-black">時間</div>{days.map((d) => <div key={keyOf(d)} className="border-b border-r"><CalendarDayHeader dateKey={keyOf(d)} dateLabel={dateFmt.format(d)} weekdayLabel={weekFmt.format(d)} dense /></div>)}{times.map((t) => <div key={t} className="contents"><div className="min-h-[62px] border-b border-r p-1 text-center text-[10px] font-black">{t}</div>{days.map((d) => { const k = `${keyOf(d)}-${t}`; const list = slotsByCell.get(k) ?? []; return <button key={k} onClick={() => openCell(keyOf(d), t, list)} className="min-h-[62px] overflow-hidden border-b border-r p-0.5 text-left">{list.map((s) => { const a = active(s); return a.length ? <div key={s.id} className="mb-0.5 flex gap-0.5">{a.map((r) => <div key={r.id} className={`min-h-[56px] flex-1 rounded px-0.5 py-1 text-[10px] font-black ${color(s.menuName)}`} style={{ writingMode: 'vertical-rl' }}>{shortName(r.memberName)}</div>)}</div> : <div key={s.id} className="mb-0.5 rounded border border-dashed bg-gray-50 py-1 text-center text-[9px] font-bold text-gray-400">空{s.booked}/{s.capacity}</div>; })}</button>; })}</div>)}</div></div></section>}{modal && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-4 shadow-xl"><div className="flex justify-between"><p className="text-xl font-black">{modal.dateKey} {modal.time}</p><button onClick={() => setModal(null)} className="rounded-full border px-3 py-1 font-black">×</button></div><div className="mt-4 space-y-3">{modal.slots.map((s) => <div key={s.id} className="rounded-2xl border p-3"><p className="font-black">{timeOf(s.startsAt)} {s.menuName} {s.booked}/{s.capacity}名</p>{active(s).map((r) => <div key={r.id} className="mt-2 rounded-xl bg-gray-50 p-2"><div className="flex justify-between gap-2"><span className="text-sm font-black">{r.memberName}<span className="ml-1 text-xs text-gray-500">{r.planName}</span></span><button disabled={busy === r.id} onClick={() => void doCancel(r.id)} className="rounded-full border border-red-300 px-3 py-1 text-xs font-black text-red-600">キャンセル</button></div><div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><select value={moveTo[r.id] ?? ''} onChange={(e) => setMoveTo((v) => ({ ...v, [r.id]: e.target.value }))} className="rounded-xl border px-2 py-2 text-xs font-bold"><option value="">移動先</option>{moveOptions.filter((o) => o.id !== s.id).map((o) => <option key={o.id} value={o.id}>{dateFmt.format(new Date(o.startsAt || ''))} {timeOf(o.startsAt)} {o.menuName}</option>)}</select><button onClick={() => void doMove(r.id)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white">移動</button></div></div>))}</div>)}<div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-3"><p className="font-black">代理予約</p><div className="mt-3 grid gap-2"><select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="rounded-xl border px-3 py-2 font-bold"><option value="">会員を選択</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}</select>{modal.slots.length > 0 && <select value={slotId} onChange={(e) => setSlotId(e.target.value)} className="rounded-xl border px-3 py-2 font-bold"><option value="">新規枠を作る</option>{modal.slots.map((s) => <option key={s.id} value={s.id}>{timeOf(s.startsAt)} {s.menuName}</option>)}</select>}{!slotId && <><select value={menuId} onChange={(e) => { setMenuId(e.target.value); setCapacity(menus.find((m) => m.id === e.target.value)?.default_capacity ?? 5); }} className="rounded-xl border px-3 py-2 font-bold">{menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><div className="grid grid-cols-2 gap-2"><input type="number" min="5" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="rounded-xl border px-3 py-2" /><input type="number" min="1" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="rounded-xl border px-3 py-2" /></div></>}<button disabled={busy === 'reserve'} onClick={() => void doReserve()} className="rounded-full bg-yellow-400 px-4 py-3 font-black">予約を入れる</button></div></div></div></div></div>}</div></AdminPage>;
}
