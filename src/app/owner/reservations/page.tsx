"use client";

import { useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type Row = {
  id: string;
  slotId: string | null;
  status: string;
  createdAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  capacity: number | null;
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

type ReservationBody = { ok?: boolean; message?: string; reservations?: Row[] };
type SlotBody = { ok?: boolean; message?: string; slots?: SlotOption[] };

const fullDateFmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' });
const shortDateFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' });
const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo' });

function tokyoDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function ymd(value?: string | null) {
  const date = tokyoDate(value);
  if (!date) return '日時未設定';
  const y = date.toLocaleString('en-CA', { year: 'numeric', timeZone: 'Asia/Tokyo' });
  const m = date.toLocaleString('en-CA', { month: '2-digit', timeZone: 'Asia/Tokyo' });
  const d = date.toLocaleString('en-CA', { day: '2-digit', timeZone: 'Asia/Tokyo' });
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekStart(date: Date) {
  const base = new Date(date);
  base.setHours(0, 0, 0, 0);
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(base, diff);
}

function labelDate(value?: string | null) {
  const date = tokyoDate(value);
  return date ? fullDateFmt.format(date) : '日時未設定';
}

function labelShortDate(date: Date) {
  return shortDateFmt.format(date);
}

function labelTime(start?: string | null, end?: string | null) {
  const s = tokyoDate(start);
  const e = tokyoDate(end);
  if (!s) return '時間未設定';
  return e ? `${timeFmt.format(s)}〜${timeFmt.format(e)}` : timeFmt.format(s);
}

function statusLabel(status: string) {
  if (status === 'cancelled') return 'キャンセル済み';
  if (status === 'attended') return '来店済み';
  if (status === 'no_show') return '無断キャンセル';
  return '予約中';
}

function statusClass(status: string) {
  if (status === 'cancelled') return 'bg-gray-100 text-gray-500';
  if (status === 'booked') return 'bg-green-50 text-green-800';
  return 'bg-yellow-50 text-yellow-800';
}

function slotOptionLabel(slot: SlotOption) {
  return `${labelDate(slot.startsAt)} ${labelTime(slot.startsAt, slot.endsAt)} / ${slot.menuName} / 残${slot.remaining}`;
}

export default function OwnerReservationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [message, setMessage] = useState('予約一覧を読み込んでいます。');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [moveDrafts, setMoveDrafts] = useState<Record<string, string>>({});

  async function token() {
    const client = getSupabaseClient();
    if (!client) return '';
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? '';
  }

  async function adminFetch(path: string, init?: RequestInit) {
    const accessToken = await token();
    if (!accessToken) throw new Error('管理者としてサインインしてください。');
    return fetch(path, { ...init, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, cache: 'no-store' });
  }

  async function load() {
    try {
      setMessage('予約一覧を読み込んでいます。');
      const [reservationResponse, slotResponse] = await Promise.all([
        adminFetch('/api/admin/reservation-list'),
        adminFetch('/api/admin/slot-options')
      ]);
      const reservationBody = await reservationResponse.json().catch(() => ({})) as ReservationBody;
      const slotBody = await slotResponse.json().catch(() => ({})) as SlotBody;
      if (!reservationResponse.ok || !reservationBody.ok) throw new Error(reservationBody.message ?? '予約一覧の取得に失敗しました。');
      if (!slotResponse.ok || !slotBody.ok) throw new Error(slotBody.message ?? '変更先予約枠の取得に失敗しました。');
      const list = (reservationBody.reservations ?? []).sort((a, b) => String(a.startsAt ?? '').localeCompare(String(b.startsAt ?? '')));
      setRows(list);
      setSlots((slotBody.slots ?? []).filter((slot) => slot.isOpen && slot.remaining > 0));
      setMoveDrafts(Object.fromEntries(list.map((row) => [row.id, row.slotId ?? ''])));
      setMessage('週間カレンダーで予約を確認できます。日程変更もここから行えます。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '予約一覧の取得に失敗しました。');
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return rows;
    return rows.filter((row) => `${row.memberName} ${row.memberEmail} ${row.menuName} ${row.planName} ${statusLabel(row.status)} ${labelDate(row.startsAt)} ${labelTime(row.startsAt, row.endsAt)}`.toLowerCase().includes(key));
  }, [rows, search]);

  const weekGroups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of filtered) {
      const date = tokyoDate(row.startsAt) ?? new Date();
      const start = weekStart(date);
      const key = ymd(start.toISOString());
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  async function cancel(row: Row) {
    if (row.status === 'cancelled') return;
    if (!window.confirm(`${row.memberName}さんの ${labelDate(row.startsAt)} ${labelTime(row.startsAt, row.endsAt)} の予約をキャンセルしますか？`)) return;
    setBusyId(row.id);
    try {
      const response = await adminFetch('/api/admin/reservation-cancel', { method: 'POST', body: JSON.stringify({ reservationId: row.id }) });
      const body = await response.json().catch(() => ({})) as ReservationBody;
      if (!response.ok || !body.ok) throw new Error(body.message ?? 'キャンセルに失敗しました。');
      setMessage('予約をキャンセルしました。');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'キャンセルに失敗しました。');
    } finally {
      setBusyId('');
    }
  }

  async function move(row: Row) {
    const slotId = moveDrafts[row.id];
    if (!slotId || slotId === row.slotId) return setMessage('変更先の予約枠を選択してください。');
    const target = slots.find((slot) => slot.id === slotId);
    if (!window.confirm(`${row.memberName}さんの予約を ${target ? slotOptionLabel(target) : '選択した枠'} に変更しますか？`)) return;
    setBusyId(row.id);
    try {
      const response = await adminFetch('/api/admin/reservation-move', { method: 'POST', body: JSON.stringify({ reservationId: row.id, slotId }) });
      const body = await response.json().catch(() => ({})) as ReservationBody;
      if (!response.ok || !body.ok) throw new Error(body.message ?? '日程変更に失敗しました。');
      setMessage('予約日程を変更しました。');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '日程変更に失敗しました。');
    } finally {
      setBusyId('');
    }
  }

  return (
    <AdminPage title="予約一覧" description="週間カレンダーで予約状況を確認し、管理者側から日程変更・キャンセルができます。">
      <div className="space-y-5">
        <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input className="rounded-xl border px-3 py-3 font-bold" placeholder="会員名・メール・メニューで検索" value={search} onChange={(event) => setSearch(event.target.value)} />
            <button type="button" onClick={() => void load()} className="rounded-full bg-yellow-400 px-5 py-3 font-black text-gray-950">再読み込み</button>
          </div>
          <p className={`mt-3 rounded-2xl px-4 py-3 text-sm font-bold ${message.includes('失敗') || message.includes('サインイン') ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-900'}`}>{message}</p>
        </div>

        <section className="grid gap-5">
          {weekGroups.map(([weekKey, items]) => {
            const start = new Date(`${weekKey}T00:00:00+09:00`);
            const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
            return (
              <div key={weekKey} className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between border-b pb-3">
                  <h2 className="text-xl font-black text-gray-950">{labelShortDate(days[0])}〜{labelShortDate(days[6])}</h2>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-black text-gray-700">{items.length}件</span>
                </div>
                <div className="overflow-x-auto">
                  <div className="grid min-w-[980px] grid-cols-7 gap-2">
                    {days.map((day) => {
                      const key = ymd(day.toISOString());
                      const dayRows = items.filter((row) => ymd(row.startsAt) === key);
                      return (
                        <div key={key} className="min-h-40 rounded-2xl border border-gray-200 bg-gray-50 p-2">
                          <p className="mb-2 rounded-xl bg-yellow-50 px-2 py-2 text-center text-sm font-black text-gray-900">{labelShortDate(day)}</p>
                          <div className="grid gap-2">
                            {dayRows.map((row) => (
                              <div key={row.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                                <p className="text-lg font-black text-gray-950">{labelTime(row.startsAt, row.endsAt)}</p>
                                <p className="text-xs font-black text-gray-600">{row.menuName}</p>
                                <p className="mt-1 text-sm font-black text-gray-950">{row.memberName}</p>
                                <p className="text-[11px] font-bold text-gray-500">{row.planName}</p>
                                <span className={`mt-2 inline-block rounded-full px-2 py-1 text-[11px] font-black ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
                                {row.status !== 'cancelled' && (
                                  <div className="mt-3 grid gap-2">
                                    <select className="w-full rounded-lg border px-2 py-2 text-xs font-bold" value={moveDrafts[row.id] ?? row.slotId ?? ''} onChange={(event) => setMoveDrafts((current) => ({ ...current, [row.id]: event.target.value }))}>
                                      <option value={row.slotId ?? ''}>変更先を選択</option>
                                      {slots.map((slot) => <option key={slot.id} value={slot.id}>{slotOptionLabel(slot)}</option>)}
                                    </select>
                                    <button type="button" disabled={busyId === row.id} onClick={() => void move(row)} className="rounded-full bg-gray-900 px-3 py-2 text-xs font-black text-white disabled:opacity-50">日程変更</button>
                                    <button type="button" disabled={busyId === row.id} onClick={() => void cancel(row)} className="rounded-full border border-red-300 px-3 py-2 text-xs font-black text-red-600 disabled:opacity-50">キャンセル</button>
                                  </div>
                                )}
                              </div>
                            ))}
                            {dayRows.length === 0 && <p className="rounded-xl border border-dashed border-gray-200 p-3 text-center text-xs font-bold text-gray-400">予約なし</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
          {weekGroups.length === 0 && <p className="rounded-3xl bg-white p-8 text-center font-bold text-gray-500 shadow-sm">予約はありません。</p>}
        </section>
      </div>
    </AdminPage>
  );
}
