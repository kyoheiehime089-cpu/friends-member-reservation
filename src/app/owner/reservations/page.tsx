"use client";

import { useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type Row = {
  id: string;
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

type ApiBody = { ok?: boolean; message?: string; reservations?: Row[] };

const dateFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' });
const fullDateFmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' });
const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo' });

function dateKey(value?: string | null) {
  if (!value) return '日時未設定';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日時未設定';
  const y = date.toLocaleString('en-CA', { year: 'numeric', timeZone: 'Asia/Tokyo' });
  const m = date.toLocaleString('en-CA', { month: '2-digit', timeZone: 'Asia/Tokyo' });
  const d = date.toLocaleString('en-CA', { day: '2-digit', timeZone: 'Asia/Tokyo' });
  return `${y}-${m}-${d}`;
}

function dateLabel(value?: string | null) {
  if (!value) return '日時未設定';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日時未設定';
  return fullDateFmt.format(date);
}

function shortDateLabel(value?: string | null) {
  if (!value) return '未設定';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未設定';
  return dateFmt.format(date);
}

function timeLabel(start?: string | null, end?: string | null) {
  if (!start) return '時間未設定';
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  if (Number.isNaN(s.getTime())) return '時間未設定';
  if (!e || Number.isNaN(e.getTime())) return timeFmt.format(s);
  return `${timeFmt.format(s)}〜${timeFmt.format(e)}`;
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

export default function OwnerReservationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState('予約一覧を読み込んでいます。');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');

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
      const response = await adminFetch('/api/admin/reservation-list');
      const body = await response.json().catch(() => ({})) as ApiBody;
      if (!response.ok || !body.ok) throw new Error(body.message ?? '予約一覧の取得に失敗しました。');
      const list = (body.reservations ?? []).sort((a, b) => String(a.startsAt ?? '').localeCompare(String(b.startsAt ?? '')));
      setRows(list);
      setMessage('予約一覧を日付別に確認できます。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '予約一覧の取得に失敗しました。');
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return rows;
    return rows.filter((row) => `${row.memberName} ${row.memberEmail} ${row.menuName} ${row.planName} ${statusLabel(row.status)} ${dateLabel(row.startsAt)} ${timeLabel(row.startsAt, row.endsAt)}`.toLowerCase().includes(key));
  }, [rows, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of filtered) {
      const key = dateKey(row.startsAt);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  async function cancel(row: Row) {
    if (row.status === 'cancelled') return;
    if (!window.confirm(`${row.memberName}さんの ${shortDateLabel(row.startsAt)} ${timeLabel(row.startsAt, row.endsAt)} の予約をキャンセルしますか？`)) return;
    setBusyId(row.id);
    try {
      const response = await adminFetch('/api/admin/reservation-cancel', { method: 'POST', body: JSON.stringify({ reservationId: row.id }) });
      const body = await response.json().catch(() => ({})) as ApiBody;
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
    <AdminPage title="予約一覧" description="日付別に予約状況を確認できます。会員名・メニュー・メールで検索できます。">
      <div className="space-y-5">
        <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input className="rounded-xl border px-3 py-3 font-bold" placeholder="会員名・メール・メニューで検索" value={search} onChange={(event) => setSearch(event.target.value)} />
            <button type="button" onClick={() => void load()} className="rounded-full bg-yellow-400 px-5 py-3 font-black text-gray-950">再読み込み</button>
          </div>
          <p className={`mt-3 rounded-2xl px-4 py-3 text-sm font-bold ${message.includes('失敗') || message.includes('サインイン') ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-900'}`}>{message}</p>
        </div>

        <section className="grid gap-4">
          {grouped.map(([key, items]) => (
            <div key={key} className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3 border-b pb-3">
                <h2 className="text-xl font-black text-gray-950">{dateLabel(items[0]?.startsAt)}</h2>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-black text-gray-700">{items.length}件</span>
              </div>
              <div className="grid gap-3">
                {items.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-2xl font-black text-gray-950">{timeLabel(row.startsAt, row.endsAt)}</p>
                        <p className="mt-1 text-sm font-black text-gray-700">{row.menuName} / {row.planName}</p>
                        <p className="mt-2 text-lg font-black text-gray-950">{row.memberName}</p>
                        <p className="text-sm font-bold text-gray-500">{row.memberEmail}</p>
                      </div>
                      <div className="flex flex-col gap-2 sm:items-end">
                        <span className={`rounded-full px-3 py-1 text-sm font-black ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
                        {row.capacity !== null && <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-bold text-gray-500">定員 {row.capacity}名</span>}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={row.status === 'cancelled' || busyId === row.id} onClick={() => void cancel(row)} className="rounded-full border border-red-300 px-4 py-2 text-sm font-black text-red-600 disabled:text-gray-400 disabled:border-gray-200">{busyId === row.id ? '処理中' : 'キャンセル'}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {grouped.length === 0 && <p className="rounded-3xl bg-white p-8 text-center font-bold text-gray-500 shadow-sm">予約はありません。</p>}
        </section>
      </div>
    </AdminPage>
  );
}
