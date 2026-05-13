"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ReservationGrid, type ReservationGridDate, type ReservationGridSlot } from '@/components/ReservationGrid';
import { SupabaseNotice } from '@/components/SupabaseNotice';
import { initialMenus, sampleSlots } from '@/lib/initialData';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';

type MenuOption = {
  id: string;
  name: string;
  description?: string | null;
  capacity: number;
};

type ReservationSlotRow = {
  id: string;
  menu_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  is_open: boolean;
};

type ReservationCountRow = {
  reservation_slot_id: string;
  booked_count: number;
};

type ReservationRow = {
  reservation_slot_id: string;
  member_id: string | null;
  status: string | null;
};

type LoadResult = {
  menus: MenuOption[];
  slots: ReservationGridSlot[];
  isDemo: boolean;
};

type DisplayMode = 'threeDays' | 'week';

const gridTimeZone = 'Asia/Tokyo';
const standardTimeLabels = ['10:00', '10:50', '11:40', '12:30', '18:30', '19:20', '20:10', '21:00'];
const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
  timeZone: gridTimeZone
});
const weekdayFormatter = new Intl.DateTimeFormat('ja-JP', {
  weekday: 'short',
  timeZone: gridTimeZone
});
const dateKeyFormatter = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: gridTimeZone
});
const timeFormatter = new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: gridTimeZone
});

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function toGridDate(date: Date): ReservationGridDate {
  return {
    dateKey: dateKeyFormatter.format(date),
    dateLabel: dateFormatter.format(date),
    weekdayLabel: weekdayFormatter.format(date)
  };
}

function buildDateRange(rangeStartOffset: number, displayMode: DisplayMode) {
  const length = displayMode === 'threeDays' ? 3 : 7;
  const start = addDays(startOfToday(), rangeStartOffset);
  return Array.from({ length }, (_, index) => toGridDate(addDays(start, index)));
}

function toGridSlot(params: {
  id: string;
  startsAt: string;
  capacity: number;
  bookedCount: number;
  isOpen: boolean;
  isBookedByCurrentUser: boolean;
  now: Date;
}): ReservationGridSlot {
  const startsAt = new Date(params.startsAt);
  const bookedCount = params.bookedCount;
  const remainingSeats = params.capacity - bookedCount;

  return {
    id: params.id,
    dateKey: dateKeyFormatter.format(startsAt),
    dateLabel: dateFormatter.format(startsAt),
    weekdayLabel: weekdayFormatter.format(startsAt),
    timeLabel: timeFormatter.format(startsAt),
    capacity: params.capacity,
    bookedCount,
    remainingSeats,
    isOpen: params.isOpen,
    isPast: startsAt <= params.now,
    isBookedByCurrentUser: params.isBookedByCurrentUser
  };
}

function buildDemoData(selectedMenuId: string, visibleDates: ReservationGridDate[]): LoadResult {
  const visibleDateKeys = new Set(visibleDates.map((date) => date.dateKey));
  const menus = initialMenus.map((menu) => ({
    id: menu.id,
    name: menu.name,
    description: menu.description,
    capacity: menu.capacity
  }));
  const now = new Date();
  const slots = sampleSlots
    .filter((slot) => slot.menuId === selectedMenuId && visibleDateKeys.has(slot.date))
    .map((slot) => {
      const menu = menus.find((item) => item.id === slot.menuId) ?? menus[0];
      return toGridSlot({
        id: slot.id,
        startsAt: `${slot.date}T${slot.time}:00+09:00`,
        capacity: menu.capacity,
        bookedCount: slot.reserved,
        isOpen: slot.isOpen ?? true,
        isBookedByCurrentUser: Boolean(slot.bookedByCurrentUser),
        now
      });
    });

  return { menus, slots, isDemo: true };
}

function getFriendlyErrorMessage(errorMessage: string) {
  if (errorMessage.includes('duplicate key') || errorMessage.includes('reservations_reservation_slot_id_member_id_key')) {
    return 'この枠はすでに予約済みです。画面を更新して最新の状態を確認してください。';
  }

  if (errorMessage.includes('定員')) {
    return 'この枠は満席になりました。別の枠をお選びください。';
  }

  if (errorMessage.includes('row-level security')) {
    return '予約できませんでした。会員情報またはログイン状態を確認してください。';
  }

  return `予約処理でエラーが発生しました: ${errorMessage}`;
}

export default function ReservePage() {
  const [selectedMenuId, setSelectedMenuId] = useState(initialMenus[0].id);
  const [menus, setMenus] = useState<MenuOption[]>(initialMenus.map((menu) => ({ ...menu })));
  const [slots, setSlots] = useState<ReservationGridSlot[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingSlotId, setSubmittingSlotId] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(!isSupabaseConfigured);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('threeDays');
  const [rangeStartOffset, setRangeStartOffset] = useState(0);

  const visibleDates = useMemo(() => buildDateRange(rangeStartOffset, displayMode), [rangeStartOffset, displayMode]);
  const selectedMenu = useMemo(() => menus.find((menu) => menu.id === selectedMenuId) ?? menus[0], [menus, selectedMenuId]);
  const visibleRangeLabel = useMemo(() => {
    const firstDate = visibleDates[0];
    const lastDate = visibleDates[visibleDates.length - 1];
    if (!firstDate || !lastDate) {
      return '';
    }
    return `${firstDate.dateLabel}（${firstDate.weekdayLabel}）〜${lastDate.dateLabel}（${lastDate.weekdayLabel}）`;
  }, [visibleDates]);

  const loadReservationGrid = useCallback(async (options?: { preserveMessage?: boolean }) => {
    const client = getSupabaseClient();

    if (!client) {
      const demoData = buildDemoData(selectedMenuId, visibleDates);
      setMenus(demoData.menus);
      setSlots(demoData.slots);
      setIsDemoMode(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setIsDemoMode(false);
    if (!options?.preserveMessage) {
      setMessage(null);
    }

    const { data: userData } = await client.auth.getUser();
    const currentUserId = userData.user?.id ?? null;
    const rangeStart = addDays(startOfToday(), rangeStartOffset);
    const rangeEnd = addDays(rangeStart, displayMode === 'threeDays' ? 3 : 7);

    const { data: menuRows, error: menuError } = await client
      .from('menus')
      .select('id,name,description,default_capacity')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (menuError) {
      setMessage(`メニューの読み込みに失敗しました: ${menuError.message}`);
      setLoading(false);
      return;
    }

    const nextMenus = (menuRows ?? []).map((menu) => ({
      id: menu.id,
      name: menu.name,
      description: menu.description,
      capacity: menu.default_capacity
    }));

    const activeMenuId = nextMenus.some((menu) => menu.id === selectedMenuId) ? selectedMenuId : nextMenus[0]?.id;
    setMenus(nextMenus);
    if (activeMenuId && activeMenuId !== selectedMenuId) {
      setSelectedMenuId(activeMenuId);
    }

    if (!activeMenuId) {
      setSlots([]);
      setLoading(false);
      return;
    }

    const { data: slotRows, error: slotError } = await client
      .from('reservation_slots')
      .select('id,menu_id,starts_at,ends_at,capacity,is_open')
      .eq('menu_id', activeMenuId)
      .gte('starts_at', rangeStart.toISOString())
      .lt('starts_at', rangeEnd.toISOString())
      .order('starts_at', { ascending: true });

    if (slotError) {
      setMessage(`予約枠の読み込みに失敗しました: ${slotError.message}`);
      setLoading(false);
      return;
    }

    const typedSlotRows = (slotRows ?? []) as ReservationSlotRow[];
    const slotIds = typedSlotRows.map((slot) => slot.id);
    const countBySlotId = new Map<string, number>();
    const bookedByCurrentUser = new Set<string>();

    if (slotIds.length > 0) {
      const { data: countRows, error: countError } = await client.rpc('get_slot_booking_counts', { slot_ids: slotIds });

      if (countError) {
        setMessage('予約数集計のSupabase設定が未適用です。管理者にお問い合わせください。');
        setSlots([]);
        setLoading(false);
        return;
      }

      ((countRows ?? []) as ReservationCountRow[]).forEach((row) => {
        countBySlotId.set(row.reservation_slot_id, Number(row.booked_count));
      });

      if (currentUserId) {
        const { data: ownReservationRows } = await client
          .from('reservations')
          .select('reservation_slot_id,member_id,status')
          .eq('member_id', currentUserId)
          .in('reservation_slot_id', slotIds)
          .eq('status', 'booked');

        ((ownReservationRows ?? []) as ReservationRow[]).forEach((reservation) => {
          bookedByCurrentUser.add(reservation.reservation_slot_id);
        });
      }
    }

    const now = new Date();
    setSlots(typedSlotRows.map((slot) => toGridSlot({
      id: slot.id,
      startsAt: slot.starts_at,
      capacity: slot.capacity,
      bookedCount: countBySlotId.get(slot.id) ?? 0,
      isOpen: slot.is_open,
      isBookedByCurrentUser: bookedByCurrentUser.has(slot.id),
      now
    })));
    setLoading(false);
  }, [displayMode, rangeStartOffset, selectedMenuId, visibleDates]);

  useEffect(() => {
    void loadReservationGrid();
  }, [loadReservationGrid]);

  const handleReserve = async (slotId: string) => {
    if (submittingSlotId) {
      return;
    }

    const targetSlot = slots.find((slot) => slot.id === slotId);
    if (!targetSlot || targetSlot.isPast || !targetSlot.isOpen || targetSlot.remainingSeats <= 0 || targetSlot.isBookedByCurrentUser) {
      setMessage('この枠は現在予約できません。画面を更新して最新の状態を確認してください。');
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setMessage('現在はデモ・セットアップモードです。Supabase環境変数を設定すると実際に予約できます。');
      return;
    }

    setSubmittingSlotId(slotId);
    setMessage(null);

    const { data: userData } = await client.auth.getUser();
    if (!userData.user) {
      setMessage('ログイン後に予約できます。ログインページからメールアドレスでログインしてください。');
      setSubmittingSlotId(null);
      return;
    }

    const { data: createdReservation, error } = await client
      .from('reservations')
      .insert({
        reservation_slot_id: slotId,
        member_id: userData.user.id,
        status: 'booked',
        created_by: userData.user.id
      })
      .select('id')
      .single();

    if (error) {
      setMessage(getFriendlyErrorMessage(error.message));
      setSubmittingSlotId(null);
      void loadReservationGrid();
      return;
    }

    const { data: sessionData } = await client.auth.getSession();
    if (createdReservation?.id && sessionData.session?.access_token) {
      void fetch('/api/reservations/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`
        },
        body: JSON.stringify({ reservationId: createdReservation.id })
      });
    }

    await loadReservationGrid({ preserveMessage: true });
    setMessage('予約が完了しました。予約一覧から内容を確認できます。');
    setSubmittingSlotId(null);
  };

  const handleDisplayModeChange = (nextDisplayMode: DisplayMode) => {
    setDisplayMode(nextDisplayMode);
    setRangeStartOffset(0);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <SupabaseNotice />
        <div>
          <h1 className="text-3xl font-black">予約する</h1>
          <p className="mt-2 text-gray-600">日付と時間が交差する枠を選んで予約してください。</p>
        </div>
        {isDemoMode && (
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm font-bold text-yellow-900">
            デモ・セットアップモードで表示しています。Supabase環境変数を設定すると実際の予約枠を読み込みます。
          </div>
        )}
        {message && <div className="rounded-2xl bg-yellow-100 p-4 font-bold text-yellow-900">{message}</div>}
        <section className="grid gap-3 md:grid-cols-3">
          {menus.map((menu) => (
            <button
              key={menu.id}
              type="button"
              onClick={() => setSelectedMenuId(menu.id)}
              className={`rounded-2xl border p-5 text-left shadow-sm ${selectedMenuId === menu.id ? 'border-yellow-400 bg-yellow-100' : 'border-gray-200 bg-white'}`}
            >
              <p className="text-lg font-black">{menu.name}</p>
              <p className="mt-1 text-sm text-gray-600">定員目安 {menu.capacity}名</p>
              {menu.description && <p className="mt-2 text-xs font-semibold text-gray-500">{menu.description}</p>}
            </button>
          ))}
        </section>
        <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-black">{selectedMenu?.name ?? '予約枠'} の空き枠</h2>
              <p className="mt-1 text-sm text-gray-600">表示期間: {visibleRangeLabel}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRangeStartOffset((current) => Math.max(0, current - (displayMode === 'threeDays' ? 3 : 7)))}
                disabled={rangeStartOffset === 0}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
              >
                前へ
              </button>
              <button
                type="button"
                onClick={() => setRangeStartOffset((current) => current + (displayMode === 'threeDays' ? 3 : 7))}
                className="rounded-full border border-gray-900 px-4 py-2 text-sm font-bold"
              >
                次の{displayMode === 'threeDays' ? '3日' : '1週間'}
              </button>
              <button
                type="button"
                onClick={() => handleDisplayModeChange('threeDays')}
                className={`rounded-full px-4 py-2 text-sm font-bold ${displayMode === 'threeDays' ? 'bg-yellow-400 text-gray-950' : 'border border-gray-300'}`}
              >
                3日表示
              </button>
              <button
                type="button"
                onClick={() => handleDisplayModeChange('week')}
                className={`rounded-full px-4 py-2 text-sm font-bold ${displayMode === 'week' ? 'bg-yellow-400 text-gray-950' : 'border border-gray-300'}`}
              >
                1週間表示
              </button>
            </div>
            {loading && <p className="text-sm font-bold text-gray-500">読み込み中です...</p>}
          </div>
          {!loading && (
            <ReservationGrid
              dates={visibleDates}
              slots={slots}
              submittingSlotId={submittingSlotId}
              timeLabels={standardTimeLabels}
              onReserve={handleReserve}
            />
          )}
          {loading && <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6 font-bold text-gray-600">予約枠を読み込んでいます。</div>}
        </section>
        <section className="rounded-3xl border border-yellow-200 bg-yellow-50 p-5">
          <h2 className="font-black">表示について</h2>
          <p className="mt-2 text-sm text-gray-700">「予約する」は受付中、「予約済み」はご自身の予約、「満席」は残席なし、「受付終了」は開始済みの枠、「休み」はその時間の予約枠が未作成の状態です。木曜日や休業日でも、管理者が枠を作成すると予約可能として表示されます。</p>
        </section>
      </div>
    </AppShell>
  );
}
