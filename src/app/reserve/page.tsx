"use client";

import { useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SupabaseNotice } from '@/components/SupabaseNotice';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { initialMenus, sampleSlots } from '@/lib/initialData';

export default function ReservePage() {
  const [selectedMenuId, setSelectedMenuId] = useState(initialMenus[0].id);
  const [message, setMessage] = useState<string | null>(null);
  const selectedMenu = initialMenus.find((menu) => menu.id === selectedMenuId) ?? initialMenus[0];
  const visibleSlots = useMemo(() => sampleSlots.filter((slot) => slot.menuId === selectedMenuId), [selectedMenuId]);

  const handleReserve = async (slotId: string) => {
    const client = getSupabaseClient();
    if (!client) {
      setMessage('Supabase環境変数を設定してください。現在はデモ表示のため予約は保存されません。');
      return;
    }

    const { data: userData } = await client.auth.getUser();
    if (!userData.user) {
      setMessage('ログイン後に予約できます。');
      return;
    }

    const { error } = await client.from('reservations').insert({ reservation_slot_id: slotId, member_id: userData.user.id, status: 'booked' });
    setMessage(error ? error.message : '予約が完了しました。');
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <SupabaseNotice />
        <div>
          <h1 className="text-3xl font-black">予約する</h1>
          <p className="mt-2 text-gray-600">メニューを選択し、空き枠から予約してください。</p>
        </div>
        {message && <div className="rounded-2xl bg-yellow-100 p-4 font-bold text-yellow-900">{message}</div>}
        <section className="grid gap-3 md:grid-cols-3">
          {initialMenus.map((menu) => (
            <button key={menu.id} onClick={() => setSelectedMenuId(menu.id)} className={`rounded-2xl border p-5 text-left shadow-sm ${selectedMenuId === menu.id ? 'border-yellow-400 bg-yellow-100' : 'border-gray-200 bg-white'}`}>
              <p className="text-lg font-black">{menu.name}</p>
              <p className="mt-1 text-sm text-gray-600">定員 {menu.capacity}名</p>
            </button>
          ))}
        </section>
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black">{selectedMenu.name} の空き枠</h2>
          <div className="mt-4 grid gap-3">
            {visibleSlots.map((slot) => {
              const remaining = selectedMenu.capacity - slot.reserved;
              return (
                <div key={slot.id} className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-black">{slot.date} {slot.time}</p>
                    <p className="text-sm font-semibold text-gray-600">残席 {Math.max(remaining, 0)} / {selectedMenu.capacity}</p>
                    {remaining <= 0 && <p className="text-sm font-bold text-red-600">満席です</p>}
                  </div>
                  <button disabled={remaining <= 0} onClick={() => handleReserve(slot.id)} className="rounded-full bg-gray-950 px-5 py-2 font-bold text-white disabled:opacity-40">予約する</button>
                </div>
              );
            })}
          </div>
        </section>
        <section className="rounded-3xl border border-yellow-200 bg-yellow-50 p-5">
          <h2 className="font-black">予約完了表示</h2>
          <p className="mt-2 text-sm text-gray-700">予約が保存されると「予約が完了しました」と表示し、メール通知ログへ登録する設計です。</p>
        </section>
      </div>
    </AppShell>
  );
}
