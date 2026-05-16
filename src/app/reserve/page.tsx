"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ReservationGrid, type ReservationGridDate, type ReservationGridSlot } from '@/components/ReservationGrid';
import { SupabaseNotice } from '@/components/SupabaseNotice';
import { getSupabaseClient } from '@/lib/supabaseClient';

type MenuOption = { id: string; name: string; description?: string | null; capacity: number };
type SlotRow = { id: string; starts_at: string; ends_at: string; capacity: number; is_open: boolean };
type CountRow = { reservation_slot_id: string; booked_count: number };
type OwnRow = { reservation_slot_id: string };
type OwnBookedWithSlotRow = { reservation_slot_id: string | null };
type FeedbackKind = 'success' | 'error' | 'info';
type DisplayMode = 'threeDays' | 'week';
type CreateResponse = {
  ok?: boolean;
  message?: string;
  detail?: string;
  memberMail?: string;
  memberMailError?: string | null;
  adminMail?: string;
  adminMailError?: string | null;
  mailLogs?: string;
  mailLogError?: string | null;
};

const zone = 'Asia/Tokyo';
const standardTimes = ['10:00', '10:50', '11:40', '12:30', '18:30', '19:20', '20:10', '21:00'];
const dateFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: zone });
const weekFmt = new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: zone });
const keyFmt = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });
const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDate(date: Date): ReservationGridDate {
  return { dateKey: keyFmt.format(date), dateLabel: dateFmt.format(date), weekdayLabel: weekFmt.format(date) };
}

function buildDates(offset: number, mode: DisplayMode) {
  const start = addDays(startOfToday(), offset);
  return Array.from({ length: mode === 'threeDays' ? 3 : 7 }, (_, index) => toDate(addDays(start, index)));
}

function className(kind: FeedbackKind) {
  if (kind === 'success') return 'border-green-200 bg-green-50 text-green-900';
  if (kind === 'error') return 'border-red-200 bg-red-50 text-red-900';
  return 'border-yellow-200 bg-yellow-50 text-yellow-900';
}

function friendly(message: string) {
  if (message.includes('duplicate') || message.includes('unique')) return 'この枠はすでに予約済みです。予約一覧をご確認ください。';
  if (message.includes('満席') || message.includes('定員')) return 'この枠は満席になりました。別の枠をお選びください。';
  if (message.includes('row-level security')) return '予約できませんでした。ログイン状態、または会員情報の設定を確認してください。';
  return message || '予約処理でエラーが発生しました。';
}

function bookingSuccessMessage(result: CreateResponse) {
  if (result.memberMail === 'sent') return '予約が完了しました。予約完了メールも送信しました。';
  if (result.memberMail === 'failed') {
    const detail = result.memberMailError ? `\n\n原因: ${result.memberMailError}` : '';
    return `予約は完了しましたが、予約完了メールの送信に失敗しました。Resendまたは送信元メール設定を確認してください。${detail}`;
  }
  if (result.memberMail === 'skipped') {
    const detail = result.memberMailError ? `\n\n原因: ${result.memberMailError}` : '';
    return `予約は完了しましたが、メール設定不足のため予約完了メールはスキップされました。${detail}`;
  }
  return '予約が完了しました。予約一覧に移動して内容を確認します。';
}

function toGridSlot(slot: SlotRow, bookedCount: number, bookedByCurrentUser: boolean, sameDayBookedDates: Set<string>): ReservationGridSlot {
  const starts = new Date(slot.starts_at);
  const dateKey = keyFmt.format(starts);
  return {
    id: slot.id,
    dateKey,
    dateLabel: dateFmt.format(starts),
    weekdayLabel: weekFmt.format(starts),
    timeLabel: timeFmt.format(starts),
    capacity: slot.capacity,
    bookedCount,
    remainingSeats: slot.capacity - bookedCount,
    isOpen: slot.is_open,
    isPast: starts <= new Date(),
    isBookedByCurrentUser: bookedByCurrentUser,
    isBlockedBySameDayBooking: !bookedByCurrentUser && sameDayBookedDates.has(dateKey)
  };
}

function menuOrder(name: string) {
  if (name.includes('イベント')) return 0;
  if (name.includes('セミ')) return 1;
  if (name.includes('ヨガ')) return 2;
  return 9;
}

export default function ReservePage() {
  const [menus, setMenus] = useState<MenuOption[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [slots, setSlots] = useState<ReservationGridSlot[]>([]);
  const [feedback, setFeedback] = useState<{ kind: FeedbackKind; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingSlotId, setSubmittingSlotId] = useState<string | null>(null);
  const [mode, setMode] = useState<DisplayMode>('threeDays');
  const [offset, setOffset] = useState(0);

  const dates = useMemo(() => buildDates(offset, mode), [offset, mode]);
  const selectedMenu = useMemo(() => menus.find((menu) => menu.id === selectedMenuId), [menus, selectedMenuId]);
  const rangeLabel = useMemo(() => dates.length ? `${dates[0].dateLabel}（${dates[0].weekdayLabel}）〜${dates[dates.length - 1].dateLabel}（${dates[dates.length - 1].weekdayLabel}）` : '', [dates]);

  const show = useCallback((kind: FeedbackKind, text: string) => {
    setFeedback({ kind, text });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const load = useCallback(async (preserveFeedback = false) => {
    const client = getSupabaseClient();
    if (!client) {
      show('error', 'Supabase環境変数を設定してください。');
      setLoading(false);
      return;
    }
    setLoading(true);
    if (!preserveFeedback) setFeedback(null);
    const { data: userData } = await client.auth.getUser();
    const currentUserId = userData.user?.id ?? null;
    const start = addDays(startOfToday(), offset);
    const end = addDays(start, mode === 'threeDays' ? 3 : 7);

    const { data: menuRows, error: menuError } = await client
      .from('menus')
      .select('id,name,description,default_capacity')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (menuError) {
      show('error', `メニューの読み込みに失敗しました: ${menuError.message}`);
      setLoading(false);
      return;
    }

    const nextMenus = (menuRows ?? [])
      .map((menu) => ({ id: menu.id, name: menu.name, description: menu.description, capacity: menu.default_capacity }))
      .sort((a, b) => menuOrder(a.name) - menuOrder(b.name));
    const activeMenuId = nextMenus.some((menu) => menu.id === selectedMenuId) ? selectedMenuId : nextMenus[0]?.id ?? '';
    setMenus(nextMenus);
    if (activeMenuId !== selectedMenuId) setSelectedMenuId(activeMenuId);
    if (!activeMenuId) {
      setSlots([]);
      setLoading(false);
      return;
    }

    const { data: slotRows, error: slotError } = await client
      .from('reservation_slots')
      .select('id,starts_at,ends_at,capacity,is_open')
      .eq('menu_id', activeMenuId)
      .gte('starts_at', start.toISOString())
      .lt('starts_at', end.toISOString())
      .order('starts_at', { ascending: true });
    if (slotError) {
      show('error', `予約枠の読み込みに失敗しました: ${slotError.message}`);
      setLoading(false);
      return;
    }

    const typedSlots = (slotRows ?? []) as SlotRow[];
    const slotIds = typedSlots.map((slot) => slot.id);
    const countById = new Map<string, number>();
    const ownBooked = new Set<string>();
    const sameDayBookedDates = new Set<string>();

    if (slotIds.length > 0) {
      const { data: countRows, error: countError } = await client.rpc('get_slot_booking_counts', { slot_ids: slotIds });
      if (countError) {
        show('error', `予約数集計のSupabase設定が未適用です: ${countError.message}`);
        setSlots([]);
        setLoading(false);
        return;
      }
      ((countRows ?? []) as CountRow[]).forEach((row) => countById.set(row.reservation_slot_id, Number(row.booked_count)));
      if (currentUserId) {
        const { data: ownRows } = await client
          .from('reservations')
          .select('reservation_slot_id')
          .eq('member_id', currentUserId)
          .in('reservation_slot_id', slotIds)
          .eq('status', 'booked');
        ((ownRows ?? []) as OwnRow[]).forEach((row) => ownBooked.add(row.reservation_slot_id));

        typedSlots.forEach((slot) => {
          if (ownBooked.has(slot.id)) sameDayBookedDates.add(keyFmt.format(new Date(slot.starts_at)));
        });

        const { data: allOwnRows } = await client
          .from('reservations')
          .select('reservation_slot_id')
          .eq('member_id', currentUserId)
          .eq('status', 'booked');
        const allOwnSlotIds = Array.from(new Set(((allOwnRows ?? []) as OwnBookedWithSlotRow[]).map((row) => row.reservation_slot_id).filter(Boolean))) as string[];
        if (allOwnSlotIds.length > 0) {
          const { data: ownSlotRows } = await client.from('reservation_slots').select('id,starts_at').in('id', allOwnSlotIds);
          ((ownSlotRows ?? []) as Pick<SlotRow, 'id' | 'starts_at'>[]).forEach((ownSlot) => sameDayBookedDates.add(keyFmt.format(new Date(ownSlot.starts_at))));
        }
      }
    }

    setSlots(typedSlots.map((slot) => toGridSlot(slot, countById.get(slot.id) ?? 0, ownBooked.has(slot.id), sameDayBookedDates)));
    setLoading(false);
  }, [mode, offset, selectedMenuId, show]);

  useEffect(() => {
    void load();
  }, [load]);

  const reserve = async (slotId: string) => {
    if (submittingSlotId) return;
    const target = slots.find((slot) => slot.id === slotId);
    if (!target || target.isPast || !target.isOpen || target.remainingSeats <= 0 || target.isBookedByCurrentUser || target.isBlockedBySameDayBooking) {
      show('error', target?.isBlockedBySameDayBooking ? '同じ日に予約できるのは1枠までです。予約一覧をご確認ください。' : 'この枠は現在予約できません。画面を更新して最新の状態を確認してください。');
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      show('error', 'Supabase環境変数を設定してください。');
      return;
    }
    setSubmittingSlotId(slotId);
    setFeedback({ kind: 'info', text: '予約を保存しています。画面を閉じずにお待ちください。' });
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setSubmittingSlotId(null);
      show('error', 'ログイン後に予約できます。ログインページへ移動します。');
      window.location.href = '/login';
      return;
    }
    try {
      const response = await fetch('/api/reservations/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slotId })
      });
      const result = await response.json().catch(() => ({})) as CreateResponse;
      if (!response.ok || !result.ok) {
        show('error', friendly(result.message ?? result.detail ?? '予約保存に失敗しました。'));
        setSubmittingSlotId(null);
        void load(true);
        return;
      }
      show('success', bookingSuccessMessage(result));
      setSubmittingSlotId(null);
      window.setTimeout(() => { window.location.href = '/my-reservations'; }, 2200);
    } catch (error) {
      show('error', friendly(error instanceof Error ? error.message : '通信エラーが発生しました。'));
      setSubmittingSlotId(null);
      void load(true);
    }
  };

  const setDisplayMode = (nextMode: DisplayMode) => {
    setMode(nextMode);
    setOffset(0);
  };

  const selectMenu = (menuId: string) => {
    setSelectedMenuId(menuId);
    setOffset(0);
    setFeedback(null);
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <SupabaseNotice />

        <div className="space-y-1">
          <h1 className="text-3xl font-black">予約する</h1>
          <p className="text-sm font-semibold text-gray-600">メニューを選んで、空いている枠をタップしてください。</p>
        </div>

        {feedback && <div className={`whitespace-pre-line rounded-2xl border p-4 text-sm font-bold ${className(feedback.kind)}`}>{feedback.text}</div>}

        <section className="rounded-3xl border border-gray-200 bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-black text-gray-500">メニューを選択</p>
          <div className="grid grid-cols-3 gap-2">
            {menus.map((menu) => (
              <button
                key={menu.id}
                type="button"
                onClick={() => selectMenu(menu.id)}
                className={`rounded-2xl border px-2 py-3 text-center shadow-sm transition ${selectedMenuId === menu.id ? 'border-yellow-400 bg-yellow-100 text-gray-950' : 'border-gray-200 bg-white text-gray-600'}`}
              >
                <p className="text-sm font-black leading-tight">{menu.name}</p>
                <p className="mt-1 text-[10px] font-bold text-gray-500">定員{menu.capacity}名</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-black">{selectedMenu?.name ?? '予約枠'} の空き枠</h2>
                <p className="text-xs font-bold text-gray-500">{rangeLabel}</p>
              </div>
              {loading && <p className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">読込中</p>}
            </div>

            <div className="grid grid-cols-4 gap-2">
              <button type="button" onClick={() => setOffset((current) => Math.max(0, current - (mode === 'threeDays' ? 3 : 7)))} disabled={offset === 0} className="rounded-full border border-gray-300 px-2 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40">前</button>
              <button type="button" onClick={() => setDisplayMode('threeDays')} className={`rounded-full px-2 py-2 text-xs font-black ${mode === 'threeDays' ? 'bg-yellow-400 text-gray-950' : 'border border-gray-300 text-gray-700'}`}>3日</button>
              <button type="button" onClick={() => setDisplayMode('week')} className={`rounded-full px-2 py-2 text-xs font-black ${mode === 'week' ? 'bg-yellow-400 text-gray-950' : 'border border-gray-300 text-gray-700'}`}>1週間</button>
              <button type="button" onClick={() => setOffset((current) => current + (mode === 'threeDays' ? 3 : 7))} className="rounded-full border border-gray-900 px-2 py-2 text-xs font-black">次</button>
            </div>
          </div>

          {feedback && <div className={`whitespace-pre-line mb-3 rounded-2xl border p-3 text-sm font-bold ${className(feedback.kind)}`}>{feedback.text}</div>}
          {!loading && <ReservationGrid dense dates={dates} slots={slots} submittingSlotId={submittingSlotId} timeLabels={standardTimes} onReserve={reserve} />}
          {loading && <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 text-center text-sm font-bold text-gray-600">予約枠を読み込んでいます。</div>}
        </section>

        <section className="rounded-2xl border border-yellow-200 bg-yellow-50 p-3 text-xs font-bold text-gray-700">
          <p>表示: 予約=予約可 / 済=予約済み / 同日=同日予約済み / 終=受付終了 / 空欄=枠なし</p>
        </section>
      </div>
    </AppShell>
  );
}
