"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SupabaseNotice } from '@/components/SupabaseNotice';
import { getSupabaseClient } from '@/lib/supabaseClient';

type ReservationRow = {
  id: string;
  reservation_slot_id: string | null;
  status: string | null;
  created_at: string | null;
};

type SlotRow = {
  id: string;
  menu_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

type MenuRow = {
  id: string;
  name: string;
};

type HistoryItem = {
  id: string;
  date: string;
  weekday: string;
  time: string;
  menu: string;
  startsAt: Date;
};

const zone = 'Asia/Tokyo';
const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: zone
});
const weekdayFormatter = new Intl.DateTimeFormat('ja-JP', {
  weekday: 'short',
  timeZone: zone
});
const timeFormatter = new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: zone
});
const monthKeyFormatter = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  timeZone: zone
});

function formatDate(value: Date) {
  return dateFormatter.format(value);
}

function formatWeekday(value: Date) {
  return weekdayFormatter.format(value);
}

function formatTime(start?: string | null, end?: string | null) {
  if (!start) return '時間未設定';
  const startLabel = timeFormatter.format(new Date(start));
  const endLabel = end ? timeFormatter.format(new Date(end)) : '';
  return endLabel ? `${startLabel}〜${endLabel}` : startLabel;
}

function isPastSlot(slot?: SlotRow | null) {
  if (!slot?.starts_at) return false;
  const endOrStart = slot.ends_at || slot.starts_at;
  return new Date(endOrStart) < new Date();
}

function isCountableStatus(status?: string | null) {
  return status === 'booked' || status === 'attended';
}

export default function HistoryPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);

  const loadHistory = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      setMessage('Supabase環境変数を設定してください。');
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);

    const { data: userData } = await client.auth.getUser();
    if (!userData.user) {
      setMessage('ログイン後に利用履歴を確認できます。');
      setItems([]);
      setLoading(false);
      return;
    }

    const { data: reservations, error: reservationError } = await client
      .from('reservations')
      .select('id,reservation_slot_id,status,created_at')
      .eq('member_id', userData.user.id)
      .in('status', ['booked', 'attended'])
      .order('created_at', { ascending: false })
      .limit(300);

    if (reservationError) {
      setMessage(`利用履歴の読み込みに失敗しました: ${reservationError.message}`);
      setLoading(false);
      return;
    }

    const reservationRows = (reservations ?? []) as ReservationRow[];
    const slotIds = Array.from(new Set(reservationRows.map((reservation) => reservation.reservation_slot_id).filter(Boolean))) as string[];
    if (slotIds.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data: slots, error: slotError } = await client
      .from('reservation_slots')
      .select('id,menu_id,starts_at,ends_at')
      .in('id', slotIds);

    if (slotError) {
      setMessage(`予約枠情報の読み込みに失敗しました: ${slotError.message}`);
      setLoading(false);
      return;
    }

    const slotRows = (slots ?? []) as SlotRow[];
    const slotsById = new Map(slotRows.map((slot) => [slot.id, slot]));
    const menuIds = Array.from(new Set(slotRows.map((slot) => slot.menu_id).filter(Boolean))) as string[];
    const menusById = new Map<string, MenuRow>();

    if (menuIds.length > 0) {
      const { data: menus, error: menuError } = await client
        .from('menus')
        .select('id,name')
        .in('id', menuIds);

      if (menuError) {
        setMessage(`メニュー情報の読み込みに失敗しました: ${menuError.message}`);
        setLoading(false);
        return;
      }
      ((menus ?? []) as MenuRow[]).forEach((menu) => menusById.set(menu.id, menu));
    }

    const nextItems = reservationRows
      .filter((reservation) => isCountableStatus(reservation.status))
      .map((reservation) => {
        const slot = reservation.reservation_slot_id ? slotsById.get(reservation.reservation_slot_id) : null;
        if (!slot || !isPastSlot(slot) || !slot.starts_at) return null;
        const startsAt = new Date(slot.starts_at);
        const menuName = slot.menu_id ? menusById.get(slot.menu_id)?.name : null;
        return {
          id: reservation.id,
          date: formatDate(startsAt),
          weekday: formatWeekday(startsAt),
          time: formatTime(slot.starts_at, slot.ends_at),
          menu: menuName ?? '予約枠',
          startsAt
        } satisfies HistoryItem;
      })
      .filter((item): item is HistoryItem => Boolean(item))
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

    setItems(nextItems);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = monthKeyFormatter.format(now);
    const byMenu = new Map<string, number>();
    items.forEach((item) => byMenu.set(item.menu, (byMenu.get(item.menu) ?? 0) + 1));
    return {
      total: items.length,
      thisMonth: items.filter((item) => monthKeyFormatter.format(item.startsAt) === thisMonth).length,
      byMenu: Array.from(byMenu.entries()).sort((a, b) => b[1] - a[1])
    };
  }, [items]);

  return (
    <AppShell>
      <div className="space-y-5">
        <SupabaseNotice />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black">利用履歴</h1>
            <p className="mt-2 text-sm font-semibold text-gray-600">過去に利用した回数と履歴を確認できます。</p>
          </div>
          <button type="button" onClick={() => void loadHistory()} className="rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-black text-gray-700 shadow-sm">
            更新
          </button>
        </div>

        {message && <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm font-bold text-yellow-900">{message}</div>}

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black text-gray-500">総利用回数</p>
            <p className="mt-2 text-4xl font-black text-gray-950">{stats.total}<span className="ml-1 text-base">回</span></p>
          </div>
          <div className="rounded-3xl border border-yellow-200 bg-yellow-50 p-5 shadow-sm">
            <p className="text-xs font-black text-yellow-800">今月の利用</p>
            <p className="mt-2 text-4xl font-black text-gray-950">{stats.thisMonth}<span className="ml-1 text-base">回</span></p>
          </div>
        </section>

        {stats.byMenu.length > 0 && (
          <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="font-black">メニュー別</h2>
            <div className="mt-3 grid gap-2">
              {stats.byMenu.map(([menu, count]) => (
                <div key={menu} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                  <span className="font-bold text-gray-700">{menu}</span>
                  <span className="font-black text-gray-950">{count}回</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="font-black">過去の履歴</h2>
          {loading && <div className="mt-3 rounded-2xl bg-gray-50 p-5 text-center text-sm font-bold text-gray-600">読み込み中です。</div>}
          {!loading && items.length === 0 && <div className="mt-3 rounded-2xl bg-gray-50 p-5 text-center text-sm font-bold text-gray-600">過去の利用履歴はまだありません。</div>}
          <div className="mt-3 grid gap-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                <p className="text-lg font-black text-gray-950">{item.date}（{item.weekday}） {item.time}</p>
                <p className="mt-1 text-sm font-bold text-gray-600">{item.menu}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
