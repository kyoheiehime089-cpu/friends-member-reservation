"use client";

import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SupabaseNotice } from '@/components/SupabaseNotice';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { sampleReservations } from '@/lib/initialData';

export default function MyReservationsPage() {
  const [message, setMessage] = useState<string | null>(null);

  const handleCancel = async (reservationId: string, cancelable: boolean) => {
    if (!cancelable) {
      setMessage('キャンセル期限を過ぎています。管理者へご連絡ください。');
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setMessage('Supabase環境変数を設定してください。現在はデモ表示のためキャンセルは保存されません。');
      return;
    }

    const { error } = await client.from('reservations').update({ status: 'cancelled' }).eq('id', reservationId);
    setMessage(error ? error.message : 'キャンセルしました。');
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
        <div className="grid gap-3">
          {sampleReservations.map((reservation) => (
            <div key={reservation.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xl font-black">{reservation.date} {reservation.time}</p>
                  <p className="font-semibold text-gray-600">{reservation.menu} / {reservation.status}</p>
                  {!reservation.cancelable && <p className="mt-2 text-sm font-bold text-red-600">キャンセル期限後です。管理者へご連絡ください。</p>}
                </div>
                <button onClick={() => handleCancel(reservation.id, reservation.cancelable)} className="rounded-full border border-gray-900 px-5 py-2 font-bold">キャンセル</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
