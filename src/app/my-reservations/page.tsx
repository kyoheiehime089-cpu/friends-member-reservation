"use client";

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SupabaseNotice } from '@/components/SupabaseNotice';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { initialMenus, sampleSlots } from '@/lib/initialData';

type ReservationRow = {
  id: string;
  reservation_slot_id: string | null;
  status: string | null;
  created_at: string | null;
};

export default function MyReservationsPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReservations = async () => {
      const client = getSupabaseClient();
      if (!client) {
        setMessage('Supabase環境変数を設定してください。');
        setLoading(false);
        return;
      }

      const { data: userData } = await client.auth.getUser();
      if (!userData.user) {
        setMessage('ログイン後に予約一覧を確認できます。');
        setLoading(false);
        return;
      }

      const { data, error } = await client
        .from('reservations')
        .select('id,reservation_slot_id,status,created_at')
        .eq('member_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        setMessage(error.message);
      } else {
        setReservations(data ?? []);
      }
      setLoading(false);
    };

    loadReservations();
  }, []);

  const displayReservations = useMemo(() => {
    return reservations.map((reservation) => {
      const slot = sampleSlots.find((item) => item.id === reservation.reservation_slot_id);
      const menu = slot ? initialMenus.find((item) => item.id === slot.menuId) : null;
      return {
        id: reservation.id,
        date: slot?.date ?? '日時未設定',
        time: slot?.time ?? '',
        menu: menu?.name ?? '予約枠',
        status: reservation.status === 'cancelled' ? 'キャンセル済み' : '予約中',
        cancelable: reservation.status !== 'cancelled'
      };
    });
  }, [reservations]);

  const handleCancel = async (reservationId: string, cancelable: boolean) => {
    if (!cancelable) {
      setMessage('すでにキャンセル済みです。');
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setMessage('Supabase環境変数を設定してください。現在はデモ表示のためキャンセルは保存されません。');
      return;
    }

    const { error } = await client.from('reservations').update({ status: 'cancelled' }).eq('id', reservationId);
    if (error) {
      setMessage(error.message);
      return;
    }

    setReservations((current) => current.map((reservation) => reservation.id === reservationId ? { ...reservation, status: 'cancelled' } : reservation));
    setMessage('キャンセルしました。');
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <SupabaseNotice />
        <div>
          <h1 className="text-3xl font-black">自分の予約一覧</h1>
          <p className="mt-2 text-gray-600">予約内容の確認とキャンセルができます。</p>
        </div>
        {message && <div className="rounded-2xl bg-yellow-100 p-4 font-bold text-yellow-900">{message}</div>}
        {loading && <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">読み込み中です。</div>}
        {!loading && displayReservations.length === 0 && <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">予約はまだありません。</div>}
        <div className="grid gap-3">
          {displayReservations.map((reservation) => (
            <div key={reservation.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xl font-black">{reservation.date} {reservation.time}</p>
                  <p className="font-semibold text-gray-600">{reservation.menu} / {reservation.status}</p>
                  {!reservation.cancelable && <p className="mt-2 text-sm font-bold text-red-600">キャンセル済みです。</p>}
                </div>
                <button onClick={() => handleCancel(reservation.id, reservation.cancelable)} className="rounded-full border border-gray-900 px-5 py-2 font-bold disabled:opacity-40" disabled={!reservation.cancelable}>キャンセル</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
