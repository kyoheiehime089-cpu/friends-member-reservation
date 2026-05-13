"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type ReservationRow = {
  id: string;
  reservation_slot_id: string | null;
  member_id: string | null;
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

type MemberRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

const gridTimeZone = 'Asia/Tokyo';
const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: gridTimeZone
});

function formatDateTime(value?: string | null) {
  if (!value) {
    return '日時未設定';
  }
  return dateTimeFormatter.format(new Date(value));
}

function getStatusLabel(status?: string | null) {
  switch (status) {
    case 'cancelled':
      return 'キャンセル済み';
    case 'attended':
      return '来店済み';
    case 'no_show':
      return '無断キャンセル';
    case 'booked':
    default:
      return '予約中';
  }
}

export default function AdminReservationsPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [slotsById, setSlotsById] = useState<Map<string, SlotRow>>(new Map());
  const [menusById, setMenusById] = useState<Map<string, MenuRow>>(new Map());
  const [membersById, setMembersById] = useState<Map<string, MemberRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadReservations = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      setMessage('Supabase環境変数を設定してください。');
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await client
      .from('reservations')
      .select('id,reservation_slot_id,member_id,status,created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      setMessage(`予約一覧の読み込みに失敗しました: ${error.message}`);
      setLoading(false);
      return;
    }

    const nextReservations = (data ?? []) as ReservationRow[];
    setReservations(nextReservations);

    const slotIds = Array.from(new Set(nextReservations.map((item) => item.reservation_slot_id).filter(Boolean))) as string[];
    const memberIds = Array.from(new Set(nextReservations.map((item) => item.member_id).filter(Boolean))) as string[];

    if (slotIds.length > 0) {
      const { data: slotRows } = await client.from('reservation_slots').select('id,menu_id,starts_at,ends_at').in('id', slotIds);
      const typedSlots = (slotRows ?? []) as SlotRow[];
      setSlotsById(new Map(typedSlots.map((slot) => [slot.id, slot])));

      const menuIds = Array.from(new Set(typedSlots.map((slot) => slot.menu_id).filter(Boolean))) as string[];
      if (menuIds.length > 0) {
        const { data: menuRows } = await client.from('menus').select('id,name').in('id', menuIds);
        setMenusById(new Map(((menuRows ?? []) as MenuRow[]).map((menu) => [menu.id, menu])));
      }
    } else {
      setSlotsById(new Map());
      setMenusById(new Map());
    }

    if (memberIds.length > 0) {
      const { data: memberRows } = await client.from('members').select('id,full_name,email').in('id', memberIds);
      setMembersById(new Map(((memberRows ?? []) as MemberRow[]).map((member) => [member.id, member])));
    } else {
      setMembersById(new Map());
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  const rows = useMemo(() => reservations.map((reservation) => {
    const slot = reservation.reservation_slot_id ? slotsById.get(reservation.reservation_slot_id) : null;
    const menu = slot?.menu_id ? menusById.get(slot.menu_id) : null;
    const member = reservation.member_id ? membersById.get(reservation.member_id) : null;
    return {
      id: reservation.id,
      dateTime: formatDateTime(slot?.starts_at),
      memberName: member?.full_name ?? '会員名未設定',
      memberEmail: member?.email ?? 'メール未設定',
      menuName: menu?.name ?? '予約枠',
      status: getStatusLabel(reservation.status),
      rawStatus: reservation.status ?? 'booked'
    };
  }).filter((row) => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) {
      return true;
    }
    return `${row.dateTime} ${row.memberName} ${row.memberEmail} ${row.menuName} ${row.status}`.toLowerCase().includes(keyword);
  }), [membersById, menusById, reservations, searchText, slotsById]);

  const handleAdminCancel = async (reservationId: string, rawStatus: string) => {
    if (rawStatus === 'cancelled') {
      setMessage('すでにキャンセル済みです。');
      return;
    }

    const confirmed = window.confirm('管理者としてこの予約をキャンセルしますか？');
    if (!confirmed) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setMessage('Supabase環境変数を設定してください。');
      return;
    }

    setCancellingId(reservationId);
    const { data: userData } = await client.auth.getUser();
    const { error } = await client
      .from('reservations')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: userData.user?.id ?? null
      })
      .eq('id', reservationId);

    if (error) {
      setMessage(`キャンセル処理に失敗しました: ${error.message}`);
      setCancellingId(null);
      return;
    }

    setMessage('管理者としてキャンセルしました。');
    setCancellingId(null);
    await loadReservations();
  };

  return (
    <AdminPage title="予約一覧" description="実予約データの検索、確認、キャンセル処理を行います。">
      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            className="rounded-xl border px-3 py-2"
            placeholder="会員名・メール・メニューで検索"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <button type="button" onClick={() => void loadReservations()} className="rounded-full bg-yellow-400 px-5 py-2 font-black">再読み込み</button>
        </div>
        {message && <div className="mb-4 rounded-2xl bg-yellow-100 p-3 text-sm font-bold text-yellow-900">{message}</div>}
        {loading && <div className="rounded-2xl bg-gray-50 p-4 font-bold text-gray-600">読み込み中です。</div>}
        {!loading && rows.length === 0 && <div className="rounded-2xl bg-gray-50 p-4 font-bold text-gray-600">予約はありません。</div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">日時</th>
                <th>会員</th>
                <th>メール</th>
                <th>メニュー</th>
                <th>状態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((reservation) => (
                <tr key={reservation.id} className="border-b">
                  <td className="py-3 font-bold">{reservation.dateTime}</td>
                  <td>{reservation.memberName}</td>
                  <td>{reservation.memberEmail}</td>
                  <td>{reservation.menuName}</td>
                  <td>{reservation.status}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleAdminCancel(reservation.id, reservation.rawStatus)}
                      disabled={reservation.rawStatus === 'cancelled' || cancellingId === reservation.id}
                      className="font-bold text-red-600 disabled:text-gray-400"
                    >
                      {cancellingId === reservation.id ? '処理中...' : 'キャンセル処理'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPage>
  );
}
