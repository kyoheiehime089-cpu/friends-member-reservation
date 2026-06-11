"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ReservationGrid, type ReservationGridDate, type ReservationGridSlot } from '@/components/ReservationGrid';
import { SupabaseNotice } from '@/components/SupabaseNotice';
import { UnavailableBlocksSummary } from '@/components/UnavailableBlocksSummary';
import { getSupabaseClient } from '@/lib/supabaseClient';

type MenuOption = { id: string; name: string; description?: string | null; capacity: number };
type SlotRow = { id: string; starts_at: string; ends_at: string; capacity: number; is_open: boolean };
type CountRow = { reservation_slot_id: string; booked_count: number };
type OwnRow = { reservation_slot_id: string };
type OwnBookedWithSlotRow = { reservation_slot_id: string | null };
type FeedbackKind = 'success' | 'error' | 'info';
type DisplayMode = 'threeDays' | 'week';
type CreateResponse = { ok?: boolean; message?: string; detail?: string };

const zone = 'Asia/Tokyo';
const standardTimes = ['10:00', '10:50', '11:40', '12:30', '18:30', '19:20', '20:10', '21:00'];
const dateFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: zone });
const weekFmt = new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: zone });
const keyFmt = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });
const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });

function startOfToday() { const date = new Date(); date.setHours(0, 0, 0, 0); return date; }
function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function toDate(date: Date): ReservationGridDate { return { dateKey: keyFmt.format(date), dateLabel: dateFmt.format(date), weekdayLabel: weekFmt.format(date) }; }
function buildDates(offset: number, mode: DisplayMode) { const start = addDays(startOfToday(), offset); return Array.from({ length: mode === 'threeDays' ? 3 : 7 }, (_, index) => toDate(addDays(start, index))); }
function className(kind: FeedbackKind) { if (kind === 'success') return 'border-green-200 bg-green-50 text-green-900'; if (kind === 'error') return 'border-red-200 bg-red-50 text-red-900'; return 'border-yellow-200 bg-yellow-50 text-yellow-900'; }
function friendly(message: string) { if (message.includes('duplicate') || message.includes('unique')) return 'この枠はすでに予約済みです。予約一覧をご確認ください。'; if (message.includes('満席') || message.includes('定員')) return 'この枠は満席になりました。別の枠をお選びください。'; if (message.includes('row-level security')) return '予約できませんでした。ログイン状態、または会員情報の設定を確認してください。'; return message || '予約処理でエラーが発生しました。'; }
function toGridSlot(slot: SlotRow, bookedCount: number, bookedByCurrentUser: boolean, sameDayBookedDates: Set<string>): ReservationGridSlot { const starts = new Date(slot.starts_at); const dateKey = keyFmt.format(starts); return { id: slot.id, dateKey, dateLabel: dateFmt.format(starts), weekdayLabel: weekFmt.format(starts), timeLabel: timeFmt.format(starts), capacity: slot.capacity, bookedCount, remainingSeats: slot.capacity - bookedCount, isOpen: slot.is_open, isPast: starts <= new Date(), isBookedByCurrentUser: bookedByCurrentUser, isBlockedBySameDayBooking: !bookedByCurrentUser && sameDayBookedDates.has(dateKey) }; }

export default function ReserveNewPage() {
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

  const show = useCallback((kind: FeedbackKind, text: string) => { setFeedback({ kind, text }); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);

  const load = useCallback(async (preserveFeedback = false) => {
    const client = getSupabaseClient();
    if (!client) { show('error', 'Supabase環境変数を設定してください。'); setLoading(false); return; }
    setLoading(true);
    if (!preserveFeedback) setFeedback(null);
    const { data: userData } = await client.auth.getUser();
    const currentUserId = userData.user?.id ?? null;
    const start = addDays(startOfToday(), offset);
    const end = addDays(start, mode === 'threeDays' ? 3 : 7);

    const { data: menuRows, error: menuError } = await client.from('menus').select('id,name,description,default_capacity').eq('is_active', true).order('name', { ascending: true });
    if (menuError) { show('error', `メニューの読み込みに失敗しました: ${menuError.message}`); setLoading(false); return; }
    const nextMenus = (menuRows ?? []).map((menu) => ({ id: menu.id, name: menu.name, description: menu.description, capacity: menu.default_capacity }));
    const activeMenuId = nextMenus.some((menu) => menu.id === selectedMenuId) ? selectedMenuId : nextMenus[0]?.id ?? '';
    setMenus(nextMenus);
    if (activeMenuId !== selectedMenuId) setSelectedMenuId(activeMenuId);
    if (!activeMenuId) { setSlots([]); setLoading(false); return; }

    const { data: slotRows, error: slotError } = await client.from('reservation_slots').select('id,starts_at,ends_at,capacity,is_open').eq('menu_id', activeMenuId).gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at', { ascending: true });
    if (slotError) { show('error', `予約枠の読み込みに失敗しました: ${slotError.message}`); setLoading(false); return; }
    const typedSlots = (slotRows ?? []) as SlotRow[];
    const slotIds = typedSlots.map((slot) => slot.id);
    const countById = new Map<string, number>();
    const ownBooked = new Set<string>();
    const sameDayBookedDates = new Set<string>();
    if (slotIds.length > 0) {
      const { data: countRows, error: countError } = await client.rpc('get_slot_booking_counts', { slot_ids: slotIds });
      if (countError) { show('error', `予約数集計のSupabase設定が未適用です: ${countError.message}`); setSlots([]); setLoading(false); return; }
      ((countRows ?? []) as CountRow[]).forEach((row) => countById.set(row.reservation_slot_id, Number(row.booked_count)));
      if (currentUserId) {
        const { data: ownRows } = await client.from('reservations').select('reservation_slot_id').eq('member_id', currentUserId).in('reservation_slot_id', slotIds).eq('status', 'booked');
        ((ownRows ?? []) as OwnRow[]).forEach((row) => ownBooked.add(row.reservation_slot_id));

        typedSlots.forEach((slot) => {
          if (ownBooked.has(slot.id)) {
            sameDayBookedDates.add(keyFmt.format(new Date(slot.starts_at)));
          }
        });

        const { data: allOwnRows } = await client.from('reservations').select('reservation_slot_id').eq('member_id', currentUserId).eq('status', 'booked');
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

  useEffect(() => { void load(); }, [load]);

  const reserve = async (slotId: string) => {
    if (submittingSlotId) return;
    const target = slots.find((slot) => slot.id === slotId);
    if (!target || target.isPast || !target.isOpen || target.remainingSeats <= 0 || target.isBookedByCurrentUser || target.isBlockedBySameDayBooking) { show('error', target?.isBlockedBySameDayBooking ? '同じ日に予約できるのは1枠までです。予約一覧をご確認ください。' : 'この枠は現在予約できません。画面を更新して最新の状態を確認してください。'); return; }
    const client = getSupabaseClient();
    if (!client) { show('error', 'Supabase環境変数を設定してください。'); return; }
    setSubmittingSlotId(slotId);
    setFeedback({ kind: 'info', text: '予約を保存しています。画面を閉じずにお待ちください。' });
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setSubmittingSlotId(null); show('error', 'ログイン後に予約できます。ログインページへ移動します。'); window.location.href = '/login'; return; }
    try {
      const response = await fetch('/api/reservations/create', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ slotId }) });
      const result = await response.json().catch(() => ({})) as CreateResponse;
      if (!response.ok || !result.ok) { show('error', friendly(result.message ?? result.detail ?? '予約保存に失敗しました。')); setSubmittingSlotId(null); void load(true); return; }
      show('success', '予約が完了しました。予約一覧に移動して内容を確認します。');
      setSubmittingSlotId(null);
      window.setTimeout(() => { window.location.href = '/my-reservations'; }, 700);
    } catch (error) {
      show('error', friendly(error instanceof Error ? error.message : '通信エラーが発生しました。'));
      setSubmittingSlotId(null);
      void load(true);
    }
  };

  const setDisplayMode = (nextMode: DisplayMode) => { setMode(nextMode); setOffset(0); };

  return (
    <AppShell>
      <div className="space-y-6">
        <SupabaseNotice />
        <div><h1 className="text-3xl font-black">予約する</h1><p className="mt-2 text-gray-600">日付と時間が交差する枠を選んで予約してください。</p></div>
        {feedback && <div className={`rounded-2xl border p-4 font-bold ${className(feedback.kind)}`}>{feedback.text}</div>}
        <section className="grid gap-3 md:grid-cols-3">{menus.map((menu) => <button key={menu.id} type="button" onClick={() => setSelectedMenuId(menu.id)} className={`rounded-2xl border p-5 text-left shadow-sm ${selectedMenuId === menu.id ? 'border-yellow-400 bg-yellow-100' : 'border-gray-200 bg-white'}`}><p className="text-lg font-black">{menu.name}</p><p className="mt-1 text-sm text-gray-600">定員目安 {menu.capacity}名</p>{menu.description && <p className="mt-2 text-xs font-semibold text-gray-500">{menu.description}</p>}</button>)}</section>
        <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-2xl font-black">{selectedMenu?.name ?? '予約枠'} の空き枠</h2><p className="mt-1 text-sm text-gray-600">表示期間: {rangeLabel}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setOffset((current) => Math.max(0, current - (mode === 'threeDays' ? 3 : 7)))} disabled={offset === 0} className="rounded-full border border-gray-300 px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40">前へ</button><button type="button" onClick={() => setOffset((current) => current + (mode === 'threeDays' ? 3 : 7))} className="rounded-full border border-gray-900 px-4 py-2 text-sm font-bold">次の{mode === 'threeDays' ? '3日' : '1週間'}</button><button type="button" onClick={() => setDisplayMode('threeDays')} className={`rounded-full px-4 py-2 text-sm font-bold ${mode === 'threeDays' ? 'bg-yellow-400 text-gray-950' : 'border border-gray-300'}`}>3日表示</button><button type="button" onClick={() => setDisplayMode('week')} className={`rounded-full px-4 py-2 text-sm font-bold ${mode === 'week' ? 'bg-yellow-400 text-gray-950' : 'border border-gray-300'}`}>1週間表示</button></div>{loading && <p className="text-sm font-bold text-gray-500">読み込み中です...</p>}</div>{feedback && <div className={`mb-4 rounded-2xl border p-4 font-bold ${className(feedback.kind)}`}>{feedback.text}</div>}{!loading && <ReservationGrid dates={dates} slots={slots} submittingSlotId={submittingSlotId} timeLabels={standardTimes} onReserve={reserve} />}{loading && <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6 font-bold text-gray-600">予約枠を読み込んでいます。</div>}</section>
        <UnavailableBlocksSummary dates={dates} />
        <section className="rounded-3xl border border-yellow-200 bg-yellow-50 p-5"><h2 className="font-black">表示について</h2><p className="mt-2 text-sm text-gray-700">「予約する」は受付中、「予約済み」はご自身の予約、「同日予約済み」は同じ日に別の予約があるため予約できない枠、「満席」は残席なし、「受付終了」は開始済みの枠です。予約枠が未作成の時間は空欄です。</p></section>
      </div>
    </AppShell>
  );
}
