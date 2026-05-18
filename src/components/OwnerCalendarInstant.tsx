"use client";

import { useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { adminFetch } from '@/lib/adminClient';

type View = 'day' | 'week' | 'month';
type Reservation = { id: string; status: string; memberId?: string | null; memberName: string; memberEmail: string; planName: string };
type Slot = { id: string; startsAt: string | null; endsAt: string | null; menuName: string; capacity: number; booked: number; isOpen: boolean; reservations: Reservation[] };
type Member = { id: string; full_name: string | null; email: string | null };
type Menu = { id: string; name: string; default_capacity: number };
type Modal = { dateKey: string; time: string; slots: Slot[] } | null;
type Body = { ok?: boolean; message?: string; slots?: Slot[]; members?: Member[]; menus?: Menu[]; reservationId?: string; slotId?: string; reservation?: { reservation_slot_id?: string | null; member_id?: string | null } };

const zone = 'Asia/Tokyo';
const ymd = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });
const md = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: zone });
const wd = new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: zone });
const ym = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', timeZone: zone });
const hm = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });

function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function weekStart(d: Date) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; }
function monthGridStart(d: Date) { return weekStart(new Date(d.getFullYear(), d.getMonth(), 1)); }
function dateKey(v: Date | string | null) { return v ? ymd.format(typeof v === 'string' ? new Date(v) : v) : ''; }
function timeKey(v: string | null) { return v ? hm.format(new Date(v)) : ''; }
function addMinutes(t: string, m: number) { const [h, min] = t.split(':').map(Number); const d = new Date(2000, 0, 1, h, min + m); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function rows() { const out: string[] = []; for (let t = '09:00'; t <= '22:30'; t = addMinutes(t, 30)) out.push(t); return out; }
function active(slot: Slot) { return slot.reservations.filter((r) => r.status === 'booked'); }
function short(name: string) { return (name || '名前未設定').replace(/\s+/g, '').slice(0, 10); }
function color(menu: string) { if (menu.includes('ヨガ')) return 'bg-purple-600 text-white'; if (menu.includes('イベント') || menu.includes('セミナー') || menu.includes('座学')) return 'bg-red-600 text-white'; return 'bg-blue-700 text-white'; }
function errorText(e: unknown, fallback: string) { return e instanceof Error ? e.message : fallback; }

export function OwnerCalendarInstant() {
  const [view, setView] = useState<View>('week');
  const [base, setBase] = useState(today());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [memberId, setMemberId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [slotId, setSlotId] = useState('');
  const [menuId, setMenuId] = useState('');
  const [customTime, setCustomTime] = useState('09:00');
  const [minutes, setMinutes] = useState(40);
  const [capacity, setCapacity] = useState(5);
  const [notice, setNotice] = useState('');
  const [modalNotice, setModalNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => {
    if (view === 'day') return { start: base, end: addDays(base, 1) };
    if (view === 'month') { const s = monthGridStart(base); return { start: s, end: addDays(s, 42) }; }
    const s = weekStart(base); return { start: s, end: addDays(s, 7) };
  }, [base, view]);
  const days = useMemo(() => Array.from({ length: view === 'day' ? 1 : view === 'month' ? 42 : 7 }, (_, i) => addDays(range.start, i)), [range.start, view]);

  async function api(path: string, init?: RequestInit) {
    const res = await adminFetch(path, init);
    const body = await res.json().catch(() => ({})) as Body;
    if (!res.ok || !body.ok) throw new Error(body.message || '処理に失敗しました。');
    return body;
  }

  async function refreshCalendar(message?: string) {
    const q = `start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}&_=${Date.now()}`;
    const body = await api(`/api/admin/calendar?${q}`);
    setSlots(body.slots || []);
    if (message) setNotice(message);
    return body.slots || [];
  }

  async function loadAll() {
    setLoading(true);
    try {
      const q = `start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}&_=${Date.now()}`;
      const [cal, mem, menu] = await Promise.all([api(`/api/admin/calendar?${q}`), api(`/api/admin/members?_=${Date.now()}`), api(`/api/admin/menus?_=${Date.now()}`)]);
      setSlots(cal.slots || []);
      const nextMembers = mem.members || [];
      const nextMenus = menu.menus || [];
      setMembers(nextMembers);
      setMenus(nextMenus);
      setMemberId((v) => v || nextMembers[0]?.id || '');
      setMenuId((v) => v || nextMenus[0]?.id || '');
      setCapacity((v) => v || nextMenus[0]?.default_capacity || 5);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAll().catch((e) => setNotice(errorText(e, '読み込みに失敗しました。'))); }, [range.start.getTime(), range.end.getTime()]);

  const slotMap = useMemo(() => { const map = new Map<string, Slot[]>(); for (const s of slots) { const k = `${dateKey(s.startsAt)}-${timeKey(s.startsAt)}`; map.set(k, [...(map.get(k) || []), s]); } return map; }, [slots]);
  const slotsByDay = useMemo(() => { const map = new Map<string, Slot[]>(); for (const s of slots) { const k = dateKey(s.startsAt); map.set(k, [...(map.get(k) || []), s]); } return map; }, [slots]);
  const timeLabels = useMemo(() => Array.from(new Set([...rows(), ...slots.map((s) => timeKey(s.startsAt))].filter(Boolean))).sort(), [slots]);
  const selectedSlot = modal?.slots.find((s) => s.id === slotId) || null;
  const selectedMember = members.find((m) => m.id === memberId) || null;
  const visibleMembers = useMemo(() => { const q = memberSearch.trim().toLowerCase(); return (q ? members.filter((m) => `${m.full_name || ''} ${m.email || ''}`.toLowerCase().includes(q)) : members).slice(0, 80); }, [memberSearch, members]);
  const already = Boolean(selectedSlot && selectedMember && active(selectedSlot).some((r) => r.memberId === selectedMember.id || (!!selectedMember.email && r.memberEmail === selectedMember.email)));
  const full = selectedSlot ? active(selectedSlot).length >= selectedSlot.capacity : false;

  function openCell(day: Date, time: string, list: Slot[]) {
    const first = list[0] || null;
    const used = new Set(list.flatMap((s) => active(s).map((r) => r.memberId).filter(Boolean)));
    const firstAvailable = members.find((m) => !used.has(m.id));
    const menu = first ? menus.find((m) => m.name === first.menuName) : menus[0];
    setModal({ dateKey: dateKey(day), time, slots: list });
    setSlotId(first?.id || '');
    setMenuId(menu?.id || menus[0]?.id || '');
    setCapacity(menu?.default_capacity || 5);
    setCustomTime(time);
    setMemberId(firstAvailable?.id || '');
    setMemberSearch('');
    setModalNotice('');
    setNotice('');
  }

  async function book() {
    if (!modal || busy) return;
    if (!memberId) return setModalNotice('予約する会員を選択してください。');
    if (already) return setModalNotice('この会員はすでにこの枠を予約済みです。');
    if (full) return setModalNotice('この枠は満席です。');
    const body = selectedSlot ? { memberId, slotId: selectedSlot.id } : { memberId, menuId, date: modal.dateKey, time: customTime || modal.time, minutes, capacity };
    setBusy(true);
    setModalNotice('予約を保存しています。');
    try {
      const result = await api('/api/admin/manual-reservation', { method: 'POST', body: JSON.stringify(body) });
      setModal(null);
      setNotice('予約保存完了。カレンダーへ反映しています。');
      await refreshCalendar(`${result.message || '予約を入れました。'} カレンダーに反映しました。`);
    } catch (e) {
      setModalNotice(errorText(e, '予約に失敗しました。'));
    } finally {
      setBusy(false);
    }
  }

  async function cancelReservation(reservationId: string, cancelSlotId?: string | null, cancelMemberId?: string | null) {
    if (busy) return;
    const target = modal?.slots.flatMap((s) => active(s)).find((r) => r.id === reservationId || (cancelMemberId && r.memberId === cancelMemberId));
    if (!window.confirm(`${target?.memberName || 'この会員'}さんの予約を本当にキャンセルしますか？`)) return;
    setBusy(true);
    setModalNotice('キャンセルしています。');
    try {
      const result = await api('/api/admin/reservation-cancel', { method: 'POST', body: JSON.stringify({ reservationId, slotId: cancelSlotId, memberId: cancelMemberId }) });
      setModal(null);
      setNotice('キャンセル完了。カレンダーへ反映しています。');
      await refreshCalendar(`${result.message || '予約をキャンセルしました。'} カレンダーに反映しました。`);
    } catch (e) {
      setModalNotice(errorText(e, 'キャンセルに失敗しました。'));
    } finally {
      setBusy(false);
    }
  }

  function step(n: number) { if (view === 'day') setBase((d) => addDays(d, n)); else if (view === 'month') setBase((d) => addMonths(d, n)); else setBase((d) => addDays(d, n * 7)); }
  const prev = view === 'day' ? '前日' : view === 'month' ? '前月' : '前週';
  const next = view === 'day' ? '翌日' : view === 'month' ? '次月' : '次週';

  return <AdminPage title="予約カレンダー" description="予約・キャンセル後はページ全体を再読み込みせず、カレンダーだけ更新します。"><div className="space-y-3"><section className="rounded-3xl border bg-white p-3 shadow-sm"><div className="grid grid-cols-[auto_1fr_auto] items-center gap-2"><button type="button" onClick={() => setBase((d) => addMonths(d, -1))} className="rounded-full border px-3 py-2 text-xs font-black">前月</button><div className="text-center"><p className="text-lg font-black">{ym.format(base)}</p><p className="text-xs font-bold text-gray-500">{md.format(days[0])}〜{md.format(days[days.length - 1])}</p></div><button type="button" onClick={() => setBase((d) => addMonths(d, 1))} className="rounded-full border px-3 py-2 text-xs font-black">次月</button></div><div className="mt-3 grid grid-cols-3 gap-2"><button type="button" onClick={() => step(-1)} className="rounded-full border px-2 py-2 text-xs font-black">‹ {prev}</button><button type="button" onClick={() => setBase(today())} className="rounded-full bg-yellow-400 px-2 py-2 text-xs font-black">今日</button><button type="button" onClick={() => step(1)} className="rounded-full border px-2 py-2 text-xs font-black">{next} ›</button></div><div className="mt-3 grid grid-cols-4 gap-2"><button type="button" onClick={() => setView('day')} className={`rounded-full px-2 py-2 text-xs font-black ${view === 'day' ? 'bg-gray-900 text-white' : 'border'}`}>1日</button><button type="button" onClick={() => setView('week')} className={`rounded-full px-2 py-2 text-xs font-black ${view === 'week' ? 'bg-gray-900 text-white' : 'border'}`}>1週間</button><button type="button" onClick={() => setView('month')} className={`rounded-full px-2 py-2 text-xs font-black ${view === 'month' ? 'bg-gray-900 text-white' : 'border'}`}>1ヶ月</button><button type="button" onClick={() => void refreshCalendar('最新状態に更新しました。').catch((e) => setNotice(errorText(e, '更新に失敗しました。')))} className="rounded-full border px-2 py-2 text-xs font-black">更新</button></div>{notice && <p className="mt-3 rounded-2xl bg-green-50 p-3 text-sm font-black text-green-800">{notice}</p>}{loading && <p className="mt-2 text-center text-xs font-bold text-gray-400">読み込み中...</p>}</section>{view === 'month' ? <section className="rounded-2xl border bg-white p-1 shadow-sm"><div className="grid grid-cols-7 border-l border-t">{days.map((day) => { const list = slotsByDay.get(dateKey(day)) || []; return <button key={dateKey(day)} type="button" onClick={() => openCell(day, '09:00', list)} className="min-h-[92px] border-b border-r p-1 text-left"><p className="text-xs font-black">{md.format(day)}</p>{list.slice(0, 4).map((slot) => <div key={slot.id} className="mt-0.5 truncate rounded bg-gray-100 px-1 py-0.5 text-[10px] font-black text-gray-700">{timeKey(slot.startsAt)} {active(slot).map((row) => short(row.memberName)).join('、') || `空${slot.booked}/${slot.capacity}`}</div>)}</button>; })}</div></section> : <section className="rounded-2xl border bg-white p-1 shadow-sm"><div className="w-full overflow-x-hidden"><div className="grid w-full border-l border-t" style={{ gridTemplateColumns: `42px repeat(${days.length}, minmax(0, 1fr))` }}><div className="border-b border-r p-1 text-center text-[10px] font-black">時間</div>{days.map((day) => <div key={dateKey(day)} className="border-b border-r p-1 text-center text-[10px] font-black">{md.format(day)}<br />{wd.format(day)}</div>)}{timeLabels.map((time) => <div key={time} className="contents"><div className="min-h-[62px] border-b border-r p-1 text-center text-[10px] font-black">{time}</div>{days.map((day) => { const list = slotMap.get(`${dateKey(day)}-${time}`) || []; return <button key={`${dateKey(day)}-${time}`} type="button" onClick={() => openCell(day, time, list)} className="min-h-[62px] overflow-hidden border-b border-r p-0.5 text-left">{list.map((slot) => { const rows = active(slot); if (!rows.length) return <div key={slot.id} className="rounded border border-dashed bg-gray-50 py-1 text-center text-[9px] font-bold text-gray-400">空{slot.booked}/{slot.capacity}</div>; return <div key={slot.id} className="mb-0.5 flex gap-0.5">{rows.map((row) => <div key={row.id} className={`min-h-[56px] flex-1 rounded px-0.5 py-1 text-[10px] font-black ${color(slot.menuName)}`} style={{ writingMode: 'vertical-rl' }}>{short(row.memberName)}</div>)}</div>; })}</button>; })}</div>)}</div></div></section>}{modal && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-4 shadow-xl"><div className="flex items-center justify-between"><p className="text-xl font-black">{modal.dateKey} {slotId ? modal.time : customTime}</p><button type="button" onClick={() => setModal(null)} className="rounded-full border px-3 py-1 font-black">×</button></div><div className="mt-4 space-y-3">{modal.slots.map((slot) => <div key={slot.id} className="rounded-2xl border p-3"><p className="font-black">{timeKey(slot.startsAt)} {slot.menuName} {active(slot).length}/{slot.capacity}名</p>{active(slot).length === 0 && <p className="mt-2 rounded-xl bg-gray-50 p-2 text-sm font-bold text-gray-500">予約者はいません。</p>}{active(slot).map((row) => <div key={row.id} className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-gray-50 p-2"><span className="text-sm font-black">{row.memberName}</span><button type="button" disabled={busy} onClick={() => void cancelReservation(row.id, slot.id, row.memberId)} className="rounded-full border border-red-300 px-3 py-1 text-xs font-black text-red-600">キャンセル</button></div>)}</div>)}<div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-3"><p className="font-black">代理予約</p>{modalNotice && <p className="mt-2 rounded-xl bg-white p-2 text-sm font-black text-yellow-900">{modalNotice}</p>}<div className="mt-3 grid gap-2"><input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} className="rounded-xl border px-3 py-2 font-bold" placeholder="会員名・メールで検索" /><select value={memberId} onChange={(e) => { setMemberId(e.target.value); setModalNotice(''); }} className="rounded-xl border px-3 py-2 font-bold" size={Math.min(Math.max(visibleMembers.length + 1, 3), 6)}><option value="">会員を選択</option>{visibleMembers.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email || member.id}</option>)}</select>{modal.slots.length > 0 && <select value={slotId} onChange={(e) => { setSlotId(e.target.value); setModalNotice(''); }} className="rounded-xl border px-3 py-2 font-bold"><option value="">新規枠を作る</option>{modal.slots.map((slot) => <option key={slot.id} value={slot.id}>{timeKey(slot.startsAt)} {slot.menuName} {active(slot).length}/{slot.capacity}</option>)}</select>}{!slotId && <><label className="grid gap-1 text-sm font-black text-gray-700">開始時間を微調整<input type="time" step="300" value={customTime} onChange={(e) => setCustomTime(e.target.value)} className="rounded-xl border px-3 py-2 text-lg font-black" /></label><div className="grid grid-cols-3 gap-2"><button type="button" onClick={() => setCustomTime((value) => addMinutes(value, -5))} className="rounded-full border px-3 py-2 text-xs font-black">-5分</button><button type="button" onClick={() => setCustomTime(modal.time)} className="rounded-full border px-3 py-2 text-xs font-black">元に戻す</button><button type="button" onClick={() => setCustomTime((value) => addMinutes(value, 5))} className="rounded-full border px-3 py-2 text-xs font-black">+5分</button></div><select value={menuId} onChange={(e) => setMenuId(e.target.value)} className="rounded-xl border px-3 py-2 font-bold">{menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}</select><div className="grid grid-cols-2 gap-2"><input type="number" min="5" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="rounded-xl border px-3 py-2" /><input type="number" min="1" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="rounded-xl border px-3 py-2" /></div></>}<button type="button" disabled={busy || !memberId || already || full} onClick={() => void book()} className="rounded-full bg-yellow-400 px-4 py-3 font-black disabled:opacity-50">{busy ? '保存中' : already ? 'この会員は予約済み' : full ? '満席' : '予約を入れる'}</button></div></div></div></div></div>}</div></AdminPage>;
}
