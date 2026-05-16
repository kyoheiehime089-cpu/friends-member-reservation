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

type ReservationSlotRow = {
  id: string;
  menu_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

type MenuRow = {
  id: string;
  name: string;
};

type DisplayReservation = {
  id: string;
  date: string;
  weekday: string;
  startTime: string;
  endTime: string;
  menu: string;
  status: string;
  createdAt: string;
  cancelable: boolean;
};

const gridTimeZone = 'Asia/Tokyo';
const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: gridTimeZone
});
const weekdayFormatter = new Intl.DateTimeFormat('ja-JP', {
  weekday: 'short',
  timeZone: gridTimeZone
});
const timeFormatter = new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: gridTimeZone
});
const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: gridTimeZone
});

function formatDate(value?: string | null) {
  if (!value) return '日時未設定';
  return dateFormatter.format(new Date(value));
}

function formatWeekday(value?: string | null) {
  if (!value) return '';
  return weekdayFormatter.format(new Date(value));
}

function formatTime(value?: string | null) {
  if (!value) return '';
  return timeFormatter.format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return '記録なし';
  return dateTimeFormatter.format(new Date(value));
}

function getStatusLabel(status?: string | null) {
  switch (status) {
    case 'attended':
      return '来店済み';
    case 'no_show':
      return '無断キャンセル';
    case 'booked':
    default:
      return '予約中';
  }
}

export default function MyReservationsPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [slotsById, setSlotsById] = useState<Map<string, ReservationSlotRow>>(new Map());
  const [menusById, setMenusById] = useState<Map<string, MenuRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadReservations = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      setMessage('Supabase環境変数を設定してください。');
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data: userData } = await client.auth.getUser();
    if (!userData.user) {
      setMessage('ログイン後に予約一覧を確認できます。');
      setReservations([]);
      setLoading(false);
      return;
    }

    const { data, error } = await client
      .from('reservations')
      .select('id,reservation_slot_id,status,created_at')
      .eq('member_id', userData.user.id)
      .eq('status', 'booked')
      .order('created_at', { ascending: false });

    if (error) {
      setMessage(`予約一覧の読み込みに失敗しました: ${error.message}`);
      setLoading(false);
      return;
    }

    const nextReservations = (data ?? []) as ReservationRow[];
    setReservations(nextReservations);

    const slotIds = Array.from(new Set(nextReservations.map((reservation) => reservation.reservation_slot_id).filter(Boolean))) as string[];
    if (slotIds.length === 0) {
      setSlotsById(new Map());
      setMenusById(new Map());
      setLoading(false);
      return;
    }

    const { data: slotRows, error: slotError } = await client
      .from('reservation_slots')
      .select('id,menu_id,starts_at,ends_at')
      .in('id', slotIds);

    if (slotError) {
      setMessage(`予約枠情報の読み込みに失敗しました: ${slotError.message}`);
      setLoading(false);
      return;
    }

    const typedSlotRows = (slotRows ?? []) as ReservationSlotRow[];
    const nextSlotsById = new Map(typedSlotRows.map((slot) => [slot.id, slot]));
    setSlotsById(nextSlotsById);

    const menuIds = Array.from(new Set(typedSlotRows.map((slot) => slot.menu_id).filter(Boolean))) as string[];
    if (menuIds.length > 0) {
      const { data: menuRows, error: menuError } = await client
        .from('menus')
        .select('id,name')
        .in('id', menuIds);

      if (menuError) {
        setMessage(`メニュー情報の読み込みに失敗しました: ${menuError.message}`);
        setLoading(false);
        return;
      }

      setMenusById(new Map(((menuRows ?? []) as MenuRow[]).map((menu) => [menu.id, menu])));
    } else {
      setMenusById(new Map());
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  const displayReservations = useMemo<DisplayReservation[]>(() => {
    return reservations.map((reservation) => {
      const slot = reservation.reservation_slot_id ? slotsById.get(reservation.reservation_slot_id) : null;
      const menu = slot?.menu_id ? menusById.get(slot.menu_id) : null;
      return {
        id: reservation.id,
        date: formatDate(slot?.starts_at),
        weekday: formatWeekday(slot?.starts_at),
        startTime: formatTime(slot?.starts_at),
        endTime: formatTime(slot?.ends_at),
        menu: menu?.name ?? '予約枠',
        status: getStatusLabel(reservation.status),
        createdAt: formatDateTime(reservation.created_at),
        cancelable: reservation.status === 'booked'
      };
    });
  }, [menusById, reservations, slotsById]);

  const handleCancel = async (reservationId: string, cancelable: boolean) => {
    if (!cancelable) {
      setMessage('変更できない予約です。');
      return;
    }

    const confirmed = window.confirm('この予約をキャンセルしますか？');
    if (!confirmed) return;

    const client = getSupabaseClient();
    if (!client) {
      setMessage('Supabase環境変数を設定してください。');
      return;
    }

    setCancellingId(reservationId);
    const { data: userData } = await client.auth.getUser();
    if (!userData.user) {
      setMessage('ログイン後にキャンセルできます。');
      setCancellingId(null);
      return;
    }

    const { error } = await client
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservationId)
      .eq('member_id', userData.user.id);

    if (error) {
      setMessage(`キャンセル処理に失敗しました: ${error.message}`);
      setCancellingId(null);
      return;
    }

    setReservations((current) => current.filter((reservation) => reservation.id !== reservationId));
    setMessage('キャンセルしました。予約一覧から削除しました。');
    setCancellingId(null);
    await loadReservations();
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <SupabaseNotice />
        <div>
          <h1 className="text-3xl font-black">自分の予約一覧</h1>
          <p className="mt-2 text-gray-600">予約中の内容確認とキャンセルができます。</p>
        </div>
        {message && <div className="rounded-2xl bg-yellow-100 p-4 font-bold text-yellow-900">{message}</div>}
        {loading && <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">読み込み中です。</div>}
        {!loading && displayReservations.length === 0 && <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">予約中の予約はありません。</div>}
        <div className="grid gap-3">
          {displayReservations.map((reservation) => (
            <div key={reservation.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xl font-black">{reservation.date}（{reservation.weekday}） {reservation.startTime}〜{reservation.endTime}</p>
                  <p className="font-semibold text-gray-600">{reservation.menu} / {reservation.status}</p>
                  <p className="mt-1 text-xs font-bold text-gray-400">予約作成: {reservation.createdAt}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCancel(reservation.id, reservation.cancelable)}
                  className="rounded-full border border-gray-900 px-5 py-2 font-bold disabled:opacity-40"
                  disabled={!reservation.cancelable || cancellingId === reservation.id}
                >
                  {cancellingId === reservation.id ? '処理中...' : 'キャンセル'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
