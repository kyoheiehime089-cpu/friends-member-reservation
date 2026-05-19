"use client";

import { useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { adminFetch } from '@/lib/adminClient';

type ViewMode = 'day' | 'week' | 'month';
type Reservation = { id: string; status: string; memberId?: string | null; memberName: string; memberEmail: string; planName: string };
type Slot = { id: string; startsAt: string | null; endsAt: string | null; menuName: string; capacity: number; booked: number; isOpen: boolean; reservations: Reservation[] };
type Member = { id: string; full_name: string | null; email: string | null };
type Menu = { id: string; name: string; default_capacity: number };
type Modal = { dateKey: string; time: string; slots: Slot[] } | null;
type ApiBody = { ok?: boolean; message?: string; slots?: Slot[]; slot?: Slot; members?: Member[]; menus?: Menu[]; reservationId?: string; slotId?: string; memberLabel?: string; reservation?: { reservation_slot_id?: string | null; member_id?: string | null } };

const zone = 'Asia/Tokyo';
const ymdFmt = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });
const mdFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: zone });
const wdFmt = new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: zone });
const ymFmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', timeZone: zone });
const hmFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });

function today() { const date = new Date(); date.setHours(0, 0, 0, 0); return date; }
function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function addMonths(date: Date, months: number) { const next = new Date(date); next.setMonth(next.getMonth() + months); return next; }
function weekStart(date: Date) { const next = new Date(date); next.setDate(next.getDate() - ((next.getDay() + 6) % 7)); next.setHours(0, 0, 0, 0); return next; }
function monthGridStart(date: Date) { return weekStart(new Date(date.getFullYear(), date.getMonth(), 1)); }
function dateKey(value: Date | string | null) { return value ? ymdFmt.format(typeof value === 'string' ? new Date(value) : value) : ''; }
function timeKey(value: string | null) { return value ? hmFmt.format(new Date(value)) : ''; }
function localIso(dateValue: string, timeValue: string) { return `${dateValue}T${timeValue}:00+09:00`; }
function addMinutes(time: string, minutes: number) { const [hour, minute] = time.split(':').map(Number); const date = new Date(2000, 0, 1, hour || 0, (minute || 0) + minutes); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
function baseRows() { const rows: string[] = []; for (let time = '09:00'; time <= '22:30'; time = addMinutes(time, 30)) rows.push(time); return rows; }
function active(slot: Slot) { return slot.reservations.filter((reservation) => reservation.status === 'booked'); }
function shortName(name: string) { return (name || '名前未設定').replace(/\s+/g, '').slice(0, 10); }
function cellColor(menuName: string) { if (menuName.includes('ヨガ')) return 'bg-purple-600 text-white'; if (menuName.includes('イベント') || menuName.includes('セミナー') || menuName.includes('座学')) return 'bg-red-600 text-white'; return 'bg-blue-700 text-white'; }
function errorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }

export function OwnerCalendarConfirmed() {
  const [view, setView] = useState<ViewMode>('week');
  const [baseDate, setBaseDate] = useState<Date>(() => today());
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
    if (view === 'day') return { start: baseDate, end: addDays(baseDate, 1) };
    if (view === 'month') { const start = monthGridStart(baseDate); return { start, end: addDays(start, 42) }; }
    const start = weekStart(baseDate); return { start, end: addDays(start, 7) };
  }, [baseDate, view]);

  const days = useMemo(() => Array.from({ length: view === 'day' ? 1 : view === 'month' ? 42 : 7 }, (_, index) => addDays(range.start, index)), [range.start, view]);

  async function api(path: string, init?: RequestInit) {
    const response = await adminFetch(path, init);
    const body = await response.json().catch(() => ({})) as ApiBody;
    if (!response.ok || !body.ok) throw new Error(body.message || '処理に失敗しました。');
    return body;
  }

  async function loadAll(message?: string) {
    setLoading(true);
    try {
      const cache = Date.now();
      const q = `start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}&_=${cache}`;
      const [calendar, memberBody, menuBody] = await Promise.all([
        api(`/api/admin/calendar?${q}`),
        api(`/api/admin/members?_=${cache}`),
        api(`/api/admin/menus?_=${cache}`)
      ]);
      const nextMembers = memberBody.members || [];
      const nextMenus = menuBody.menus || [];
      setSlots(calendar.slots || []);
      setMembers(nextMembers);
      setMenus(nextMenus);
      setMemberId((current) => current || nextMembers[0]?.id || '');
      setMenuId((current) => current || nextMenus[0]?.id || '');
      setCapacity((current) => current || nextMenus[0]?.default_capacity || 5);
      if (message) setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAll().catch((error) => setNotice(errorMessage(error, '読み込みに失敗しました。'))); }, [range.start.getTime(), range.end.getTime()]);

  const selectedSlot = useMemo(() => modal?.slots.find((slot) => slot.id === slotId) || null, [modal, slotId]);
  const selectedMember = useMemo(() => members.find((member) => member.id === memberId) || null, [members, memberId]);
  const visibleMembers = useMemo(() => {
    const keyword = memberSearch.trim().toLowerCase();
    return (keyword ? members.filter((member) => `${member.full_name || ''} ${member.email || ''}`.toLowerCase().includes(keyword)) : members).slice(0, 80);
  }, [memberSearch, members]);
  const alreadyBooked = Boolean(selectedSlot && selectedMember && active(selectedSlot).some((reservation) => reservation.memberId === selectedMember.id || (!!selectedMember.email && reservation.memberEmail === selectedMember.email)));
  const full = selectedSlot ? active(selectedSlot).length >= selectedSlot.capacity : false;

  const slotMap = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of slots) {
      const key = `${dateKey(slot.startsAt)}-${timeKey(slot.startsAt)}`;
      map.set(key, [...(map.get(key) || []), slot]);
    }
    return map;
  }, [slots]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of slots) {
      const key = dateKey(slot.startsAt);
      map.set(key, [...(map.get(key) || []), slot]);
    }
    return map;
  }, [slots]);

  const timeLabels = useMemo(() => Array.from(new Set([...baseRows(), ...slots.map((slot) => timeKey(slot.startsAt))].filter(Boolean))).sort(), [slots]);

  function openCell(day: Date, time: string, cellSlots: Slot[]) {
    const firstSlot = cellSlots[0] || null;
    const usedMemberIds = new Set(cellSlots.flatMap((slot) => active(slot).map((reservation) => reservation.memberId).filter(Boolean)));
    const menu = firstSlot ? menus.find((item) => item.name === firstSlot.menuName) : menus[0];
    setModal({ dateKey: dateKey(day), time, slots: cellSlots });
    setSlotId(firstSlot?.id || '');
    setMenuId(menu?.id || menus[0]?.id || '');
    setCapacity(menu?.default_capacity || 5);
    setCustomTime(time);
    setMemberId(members.find((member) => !usedMemberIds.has(member.id))?.id || '');
    setMemberSearch('');
    setModalNotice('');
    setNotice('');
  }

  function replaceSlot(slot: Slot) {
    setSlots((current) => {
      const next = current.some((item) => item.id === slot.id) ? current.map((item) => item.id === slot.id ? slot : item) : [...current, slot];
      return next.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
    });
  }

  function upsertReservation(result: ApiBody, body: { memberId: string; slotId?: string; menuId?: string; date?: string; time?: string; minutes?: number; capacity?: number }) {
    if (result.slot) return replaceSlot(result.slot);
    const member = members.find((item) => item.id === body.memberId);
    const menu = menus.find((item) => item.id === body.menuId);
    const realSlotId = result.slotId || body.slotId || selectedSlot?.id || `temp-slot-${Date.now()}`;
    const reservationId = result.reservationId || `temp-reservation-${Date.now()}`;
    const memberName = result.memberLabel || member?.full_name || member?.email || '会員名未設定';
    setSlots((current) => {
      const existingSlot = current.find((slot) => slot.id === realSlotId) || selectedSlot || null;
      const startsAt = existingSlot?.startsAt || localIso(body.date || modal?.dateKey || dateKey(baseDate), body.time || customTime || modal?.time || '09:00');
      const endsAt = existingSlot?.endsAt || new Date(new Date(startsAt).getTime() + Number(body.minutes || 40) * 60_000).toISOString();
      const baseSlot: Slot = existingSlot || {
        id: realSlotId,
        startsAt,
        endsAt,
        menuName: menu?.name || 'メニュー未設定',
        capacity: Number(body.capacity || menu?.default_capacity || 5),
        booked: 0,
        isOpen: true,
        reservations: []
      };
      const reservation: Reservation = { id: reservationId, status: 'booked', memberId: body.memberId, memberName, memberEmail: member?.email || '', planName: 'プラン未設定' };
      const updatedSlot: Slot = { ...baseSlot, id: realSlotId, reservations: [...baseSlot.reservations.filter((row) => row.status === 'booked' && row.memberId !== body.memberId && row.id !== reservationId), reservation] };
      updatedSlot.booked = active(updatedSlot).length;
      const exists = current.some((slot) => slot.id === realSlotId);
      const next = exists ? current.map((slot) => slot.id === realSlotId ? updatedSlot : slot) : [...current, updatedSlot];
      return next.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
    });
  }

  function removeReservation(reservationId: string, slotIdValue?: string | null, memberIdValue?: string | null) {
    const removeFromSlot = (slot: Slot) => {
      const sameSlot = !slotIdValue || slot.id === slotIdValue;
      const reservations = slot.reservations.filter((reservation) => {
        if (reservation.id === reservationId) return false;
        if (sameSlot && memberIdValue && reservation.memberId === memberIdValue) return false;
        return reservation.status === 'booked';
      });
      return { ...slot, reservations, booked: reservations.length };
    };
    setSlots((current) => current.map(removeFromSlot));
    setModal((current) => current ? { ...current, slots: current.slots.map(removeFromSlot) } : current);
  }

  async function book() {
    if (!modal || busy) return;
    if (!memberId) return setModalNotice('予約する会員を選択してください。');
    if (alreadyBooked) return setModalNotice('この会員はすでにこの枠を予約済みです。別の会員を選択してください。');
    if (full) return setModalNotice('この枠は満席です。');
    const body = selectedSlot ? { memberId, slotId: selectedSlot.id } : { memberId, menuId, date: modal.dateKey, time: customTime || modal.time, minutes, capacity };
    setBusy(true);
    setModalNotice('予約を保存しています。');
    try {
      const result = await api('/api/admin/manual-reservation', { method: 'POST', body: JSON.stringify(body) });
      upsertReservation(result, body);
      setModal(null);
      setNotice(`${result.message || '予約を入れました。'} カレンダーに反映しました。`);
    } catch (error) {
      setModalNotice(errorMessage(error, '予約に失敗しました。'));
    } finally {
      setBusy(false);
    }
  }

  async function cancelReservation(reservationId: string, slotIdValue?: string | null, memberIdValue?: string | null) {
    if (busy) return;
    const target = modal?.slots.flatMap((slot) => active(slot)).find((reservation) => reservation.id === reservationId || (memberIdValue && reservation.memberId === memberIdValue));
    if (!window.confirm(`${target?.memberName || 'この会員'}さんの予約を本当にキャンセルしますか？`)) return;
    setBusy(true);
    setModalNotice('キャンセルしています。');
    try {
      const result = await api('/api/admin/reservation-cancel', { method: 'POST', body: JSON.stringify({ reservationId, slotId: slotIdValue, memberId: memberIdValue }) });
      removeReservation(reservationId, result.reservation?.reservation_slot_id || slotIdValue, result.reservation?.member_id || memberIdValue);
      setModal(null);
      setNotice(`${result.message || '予約をキャンセルしました。'} カレンダーに反映しました。`);
    } catch (error) {
      setModalNotice(errorMessage(error, 'キャンセルに失敗しました。'));
    } finally {
      setBusy(false);
    }
  }

  function step(delta: number) {
    if (view === 'day') setBaseDate((date) => addDays(date, delta));
    else if (view === 'month') setBaseDate((date) => addMonths(date, delta));
    else setBaseDate((date) => addDays(date, delta * 7));
  }
  const prev = view === 'day' ? '前日' : view === 'month' ? '前月' : '前週';
  const next = view === 'day' ? '翌日' : view === 'month' ? '次月' : '次週';

  return <AdminPage title="予約カレンダー" description="予約・キャンセル後はページ全体を再読み込みせず、その場で反映します。"><div className="space-y-3"><section className="rounded-3xl border bg-white p-3 shadow-sm"><div className="grid grid-cols-[auto_1fr_auto] items-center gap-2"><button type="button" onClick={() => setBaseDate((date) => addMonths(date, -1))} className="rounded-full border px-3 py-2 text-xs font-black">前月</button><div className="text-center"><p className="text-lg font-black">{ymFmt.format(baseDate)}</p><p className="text-xs font-bold text-gray-500">{mdFmt.format(days[0])}〜{mdFmt.format(days[days.length - 1])}</p></div><button type="button" onClick={() => setBaseDate((date) => addMonths(date, 1))} className="rounded-full border px-3 py-2 text-xs font-black">次月</button></div><div className="mt-3 grid grid-cols-3 gap-2"><button type="button" onClick={() => step(-1)} className="rounded-full border px-2 py-2 text-xs font-black">‹ {prev}</button><button type="button" onClick={() => setBaseDate(today())} className="rounded-full bg-yellow-400 px-2 py-2 text-xs font-black">今日</button><button type="button" onClick={() => step(1)} className="rounded-full border px-2 py-2 text-xs font-black">{next} ›</button></div><div className="mt-3 grid grid-cols-4 gap-2"><button type="button" onClick={() => setView('day')} className={`rounded-full px-2 py-2 text-xs font-black ${view === 'day' ? 'bg-gray-900 text-white' : 'border'}`}>1日</button><button type="button" onClick={() => setView('week')} className={`rounded-full px-2 py-2 text-xs font-black ${view === 'week' ? 'bg-gray-900 text-white' : 'border'}`}>1週間</button><button type="button" onClick={() => setView('month')} className={`rounded-full px-2 py-2 text-xs font-black ${view === 'month' ? 'bg-gray-900 text-white' : 'border'}`}>1ヶ月</button><button type="button" onClick={() => void loadAll('最新状態に更新しました。').catch((error) => setNotice(errorMessage(error, '更新に失敗しました。')))} className="rounded-full border px-2 py-2 text-xs font-black">更新</button></div>{notice && <p className="mt-3 rounded-2xl bg-green-50 p-3 text-sm font-black text-green-800">{notice}</p>}{loading && <p className="mt-2 text-center text-xs font-bold text-gray-400">読み込み中...</p>}</section>{view === 'month' ? <section className="rounded-2xl border bg-white p-1 shadow-sm"><div className="grid grid-cols-7 border-l border-t">{days.map((day) => { const list = slotsByDay.get(dateKey(day)) || []; return <button key={dateKey(day)} type="button" onClick={() => openCell(day, '09:00', list)} className="min-h-[92px] border-b border-r p-1 text-left"><p className="text-xs font-black">{mdFmt.format(day)}</p>{list.slice(0, 4).map((slot) => <div key={slot.id} className="mt-0.5 truncate rounded bg-gray-100 px-1 py-0.5 text-[10px] font-black text-gray-700">{timeKey(slot.startsAt)} {active(slot).map((row) => shortName(row.memberName)).join('、') || `空${active(slot).length}/${slot.capacity}`}</div>)}</button>; })}</div></section> : <section className="rounded-2xl border bg-white p-1 shadow-sm"><div className="w-full overflow-x-hidden"><div className="grid w-full border-l border-t" style={{ gridTemplateColumns: `42px repeat(${days.length}, minmax(0, 1fr))` }}><div className="border-b border-r p-1 text-center text-[10px] font-black">時間</div>{days.map((day) => <div key={dateKey(day)} className="border-b border-r p-1 text-center text-[10px] font-black">{mdFmt.format(day)}<br />{wdFmt.format(day)}</div>)}{timeLabels.map((time) => <div key={time} className="contents"><div className="min-h-[62px] border-b border-r p-1 text-center text-[10px] font-black">{time}</div>{days.map((day) => { const list = slotMap.get(`${dateKey(day)}-${time}`) || []; return <button key={`${dateKey(day)}-${time}`} type="button" onClick={() => openCell(day, time, list)} className="min-h-[62px] overflow-hidden border-b border-r p-0.5 text-left">{list.map((slot) => { const rows = active(slot); if (!rows.length) return <div key={slot.id} className="rounded border border-dashed bg-gray-50 py-1 text-center text-[9px] font-bold text-gray-400">空{active(slot).length}/{slot.capacity}</div>; return <div key={slot.id} className="mb-0.5 flex gap-0.5">{rows.map((row) => <div key={row.id} className={`min-h-[56px] flex-1 rounded px-0.5 py-1 text-[10px] font-black ${cellColor(slot.menuName)}`} style={{ writingMode: 'vertical-rl' }}>{shortName(row.memberName)}</div>)}</div>; })}</button>; })}</div>)}</div></div></section>}{modal && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-4 shadow-xl"><div className="flex items-center justify-between"><p className="text-xl font-black">{modal.dateKey} {slotId ? modal.time : customTime}</p><button type="button" onClick={() => setModal(null)} className="rounded-full border px-3 py-1 font-black">×</button></div><div className="mt-4 space-y-3">{modal.slots.map((slot) => <div key={slot.id} className="rounded-2xl border p-3"><p className="font-black">{timeKey(slot.startsAt)} {slot.menuName} {active(slot).length}/{slot.capacity}名</p>{active(slot).length === 0 && <p className="mt-2 rounded-xl bg-gray-50 p-2 text-sm font-bold text-gray-500">予約者はいません。</p>}{active(slot).map((row) => <div key={row.id} className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-gray-50 p-2"><span className="text-sm font-black">{row.memberName}</span><button type="button" disabled={busy} onClick={() => void cancelReservation(row.id, slot.id, row.memberId)} className="rounded-full border border-red-300 px-3 py-1 text-xs font-black text-red-600">キャンセル</button></div>)}</div>)}<div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-3"><p className="font-black">代理予約</p>{modalNotice && <p className="mt-2 rounded-xl bg-white p-2 text-sm font-black text-yellow-900">{modalNotice}</p>}<div className="mt-3 grid gap-2"><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} className="rounded-xl border px-3 py-2 font-bold" placeholder="会員名・メールで検索" /><select value={memberId} onChange={(event) => { setMemberId(event.target.value); setModalNotice(''); }} className="rounded-xl border px-3 py-2 font-bold" size={Math.min(Math.max(visibleMembers.length + 1, 3), 6)}><option value="">会員を選択</option>{visibleMembers.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email || member.id}</option>)}</select>{modal.slots.length > 0 && <select value={slotId} onChange={(event) => { setSlotId(event.target.value); setModalNotice(''); }} className="rounded-xl border px-3 py-2 font-bold"><option value="">新規枠を作る</option>{modal.slots.map((slot) => <option key={slot.id} value={slot.id}>{timeKey(slot.startsAt)} {slot.menuName} {active(slot).length}/{slot.capacity}</option>)}</select>}{!slotId && <><label className="grid gap-1 text-sm font-black text-gray-700">開始時間を微調整<input type="time" step="300" value={customTime} onChange={(event) => setCustomTime(event.target.value)} className="rounded-xl border px-3 py-2 text-lg font-black" /></label><div className="grid grid-cols-3 gap-2"><button type="button" onClick={() => setCustomTime((value) => addMinutes(value, -5))} className="rounded-full border px-3 py-2 text-xs font-black">-5分</button><button type="button" onClick={() => setCustomTime(modal.time)} className="rounded-full border px-3 py-2 text-xs font-black">元に戻す</button><button type="button" onClick={() => setCustomTime((value) => addMinutes(value, 5))} className="rounded-full border px-3 py-2 text-xs font-black">+5分</button></div><select value={menuId} onChange={(event) => setMenuId(event.target.value)} className="rounded-xl border px-3 py-2 font-bold">{menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}</select><div className="grid grid-cols-2 gap-2"><input type="number" min="5" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className="rounded-xl border px-3 py-2" /><input type="number" min="1" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} className="rounded-xl border px-3 py-2" /></div></>}<button type="button" disabled={busy || !memberId || alreadyBooked || full} onClick={() => void book()} className="rounded-full bg-yellow-400 px-4 py-3 font-black disabled:opacity-50">{busy ? '保存中' : alreadyBooked ? 'この会員は予約済み' : full ? '満席' : '予約を入れる'}</button></div></div></div></div></div>}</div></AdminPage>;
}
