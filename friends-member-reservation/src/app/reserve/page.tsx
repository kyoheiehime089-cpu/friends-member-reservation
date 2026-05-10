"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

interface Menu {
  id: string;
  name: string;
  description?: string;
}

interface Schedule {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  menu_id: string;
  menu: Menu;
  reservations_count: number;
}

export default function ReservePage() {
  const router = useRouter();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      // Ensure user is logged in
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      // Fetch menus
      const { data: menusData } = await supabase
        .from('menus')
        .select('id,name,description')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      setMenus(menusData || []);
      // Fetch upcoming schedules for the next 14 days
      const today = new Date();
      const dateFrom = today.toISOString().split('T')[0];
      const dateTo = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const { data: schedulesData } = await supabase
        .rpc('get_upcoming_schedules', { from_date: dateFrom, to_date: dateTo });
      setSchedules(schedulesData || []);
      setLoading(false);
    };
    fetchData();
  }, [router]);

  const handleReserve = async (schedule: Schedule) => {
    setBooking(true);
    setMessage(null);
    // Create reservation
    const { error } = await supabase.from('reservations').insert({
      schedule_id: schedule.id,
      profile_id: (await supabase.auth.getUser()).data?.user?.id
    });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage('予約が完了しました');
      // refresh schedules
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === schedule.id
            ? { ...s, reservations_count: s.reservations_count + 1 }
            : s
        )
      );
    }
    setBooking(false);
  };

  if (loading) {
    return <p className="p-4">読み込み中…</p>;
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">予約する</h1>
      {message && <div className="mb-4 text-center text-green-600">{message}</div>}
      {!selectedMenu ? (
        <div>
          <p className="mb-2">メニューを選択してください</p>
          <ul className="space-y-2">
            {menus.map((menu) => (
              <li key={menu.id}>
                <button
                  onClick={() => setSelectedMenu(menu)}
                  className="w-full bg-white border rounded p-3 text-left hover:bg-gray-50"
                >
                  <h2 className="font-semibold">{menu.name}</h2>
                  {menu.description && (
                    <p className="text-sm text-gray-600">{menu.description}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div>
          <button onClick={() => setSelectedMenu(null)} className="text-blue-600 mb-2">
            ← メニュー一覧に戻る
          </button>
          <h2 className="text-xl font-semibold mb-2">{selectedMenu.name} の空き枠</h2>
          <ul className="space-y-2">
            {schedules
              .filter((s) => s.menu_id === selectedMenu.id)
              .map((schedule) => {
                const spotsLeft = schedule.capacity - schedule.reservations_count;
                return (
                  <li key={schedule.id}>
                    <div className="flex items-center justify-between bg-white border rounded p-3">
                      <div>
                        <p>
                          {schedule.date} {schedule.start_time} - {schedule.end_time}
                        </p>
                        <p className="text-sm text-gray-600">
                          残席: {spotsLeft > 0 ? spotsLeft : '満席'}
                        </p>
                      </div>
                      <button
                        disabled={spotsLeft <= 0 || booking}
                        onClick={() => handleReserve(schedule)}
                        className="bg-primary text-white px-3 py-1 rounded disabled:opacity-50"
                      >
                        予約する
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
          {schedules.filter((s) => s.menu_id === selectedMenu.id).length === 0 && (
            <p className="text-gray-600">現在予約可能な枠はありません</p>
          )}
        </div>
      )}
    </div>
  );
}