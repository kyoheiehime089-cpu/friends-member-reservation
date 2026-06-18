"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ReservationGrid, type ReservationGridDate, type ReservationGridSlot } from '@/components/ReservationGrid';
import { SupabaseNotice } from '@/components/SupabaseNotice';
import { UnavailableBlocksSummary } from '@/components/UnavailableBlocksSummary';
import { getSupabaseClient } from '@/lib/supabaseClient';

type Menu = { id: string; name: string; description?: string | null; capacity: number };
type Mode = 'threeDays' | 'week';
type Msg = { kind: 'success' | 'error' | 'info'; text: string };

const zone = 'Asia/Tokyo';
const baseTimes = ['09:00', '10:00', '10:50', '11:40', '12:00', '12:30', '17:20', '18:30', '19:20', '20:10', '21:00'];
const dateFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: zone });
const weekFmt = new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: zone });
const keyFmt = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });
const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });

function day0() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function plus(d: Date, days: number) { const n = new Date(d); n.setDate(n.getDate() + days); return n; }
function makeDates(offset: number, mode: Mode): ReservationGridDate[] {
  const start = plus(day0(), offset);
  return Array.from({ length: mode === 'week' ? 7 : 3 }, (_, i) => {
    const d = plus(start, i);
    return { dateKey: keyFmt.format(d), dateLabel: dateFmt.format(d), weekdayLabel: weekFmt.format(d) };
  });
}
function msgClass(kind: Msg['kind']) { return kind === 'success' ? 'border-green-200 bg-green-50 text-green-900' : kind === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-yellow-200 bg-yellow-50 text-yellow-900'; }
function menuOrder(name: string) { if (name.includes('セミ')) return 0; if (name.includes('ヨガ')) return 1; if (name.includes('イベント')) return 2; return 9; }
function toSafeMessage(text: string) { if (text.includes('満席') || text.includes('定員')) return 'この枠は満席です。'; if (text.includes('unique') || text.includes('duplicate')) return 'この枠はすでに予約済みです。'; return text || '予約処理でエラーが発生しました。'; }
function isStressResetMenu(menu?: Menu | null) { return Boolean(menu?.name && (menu.name.includes('ストレス') || menu.name.includes('リセット'))); }

export function ReserveClient() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [menuId, setMenuId] = useState('');
  const [slots, setSlots] = useState<ReservationGridSlot[]>([]);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('threeDays');
  const [offset, setOffset] = useState(0);

  const dates = useMemo(() => makeDates(offset, mode), [offset, mode]);
  const selectedMenu = useMemo(() => menus.find((m) => m.id === menuId), [menus, menuId]);
  const showBlockPuzzleLink = isStressResetMenu(selectedMenu);
  const times = useMemo(() => Array.from(new Set([...baseTimes, ...slots.map((s) => s.timeLabel)])).sort((a, b) => a.localeCompare(b)), [slots]);

  const show = useCallback((kind: Msg['kind'], text: string) => {
    setMsg({ kind, text });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const load = useCallback(async (keepMessage = false) => {
    const client = getSupabaseClient();
    if (!client) { show('error', 'Supabase環境変数を設定してください。'); setLoading(false); return; }
    setLoading(true);
    if (!keepMessage) setMsg(null);

    const { data: menuRows, error: menuError } = await client.from('menus').select('id,name,description,default_capacity').eq('is_active', true).order('name');
    if (menuError) { show('error', `メニューの読み込みに失敗しました: ${menuError.message}`); setLoading(false); return; }
    const nextMenus = (menuRows ?? []).map((m) => ({ id: m.id, name: m.name, description: m.description, capacity: m.default_capacity })).sort((a, b) => menuOrder(a.name) - menuOrder(b.name));
    setMenus(nextMenus);
    const activeMenuId = nextMenus.some((m) => m.id === menuId) ? menuId : '';
    if (menuId && !activeMenuId) setMenuId('');
    if (!activeMenuId) { setSlots([]); setLoading(false); return; }

    const start = plus(day0(), offset);
    const end = plus(start, mode === 'week' ? 7 : 3);
    const { data: rows, error: slotError } = await client.from('reservation_slots').select('id,starts_at,ends_at,capacity,is_open').eq('menu_id', activeMenuId).gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at');
    if (slotError) { show('error', `予約枠の読み込みに失敗しました: ${slotError.message}`); setLoading(false); return; }

    const slotRows = rows ?? [];
    const slotIds = slotRows.map((s) => s.id);
    const countById = new Map<string, number>();
    const own = new Set<string>();
    const sameDay = new Set<string>();
    const { data: userData } = await client.auth.getUser();
    const uid = userData.user?.id ?? null;

    if (slotIds.length > 0) {
      const { data: counts } = await client.rpc('get_slot_booking_counts', { slot_ids: slotIds });
      ((counts ?? []) as { reservation_slot_id: string; booked_count: number }[]).forEach((r) => countById.set(r.reservation_slot_id, Number(r.booked_count)));
      if (uid) {
        const { data: mine } = await client.from('reservations').select('reservation_slot_id').eq('member_id', uid).in('reservation_slot_id', slotIds).eq('status', 'booked');
        ((mine ?? []) as { reservation_slot_id: string }[]).forEach((r) => own.add(r.reservation_slot_id));
        slotRows.forEach((slot) => { if (own.has(slot.id)) sameDay.add(keyFmt.format(new Date(slot.starts_at))); });
      }
    }

    setSlots(slotRows.map((slot) => {
      const d = new Date(slot.starts_at);
      const key = keyFmt.format(d);
      const booked = countById.get(slot.id) ?? 0;
      return { id: slot.id, dateKey: key, dateLabel: dateFmt.format(d), weekdayLabel: weekFmt.format(d), timeLabel: timeFmt.format(d), capacity: slot.capacity, bookedCount: booked, remainingSeats: slot.capacity - booked, isOpen: slot.is_open, isPast: d <= new Date(), isBookedByCurrentUser: own.has(slot.id), isBlockedBySameDayBooking: !own.has(slot.id) && sameDay.has(key) };
    }));
    setLoading(false);
  }, [menuId, mode, offset, show]);

  useEffect(() => { void load(); }, [load]);

  async function reserve(slotId: string) {
    if (savingId) return;
    const target = slots.find((s) => s.id === slotId);
    if (!target || target.isPast || !target.isOpen || target.remainingSeats <= 0 || target.isBookedByCurrentUser || target.isBlockedBySameDayBooking) { show('error', 'この枠は現在予約できません。'); return; }
    const client = getSupabaseClient();
    if (!client) { show('error', 'Supabase環境変数を設定してください。'); return; }
    setSavingId(slotId);
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setSavingId(null); window.location.href = '/login'; return; }
    const response = await fetch('/api/reservations/create', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ slotId }) });
    const result = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
    setSavingId(null);
    if (!response.ok || !result.ok) { show('error', toSafeMessage(result.message ?? '予約保存に失敗しました。')); void load(true); return; }
    show('success', '予約が完了しました。');
    void load(true);
  }

  async function cancelBooked(slotId: string) {
    const target = slots.find((s) => s.id === slotId);
    if (!target?.isBookedByCurrentUser) return;
    if (!window.confirm(`${target.dateLabel} ${target.timeLabel} の予約をキャンセルしますか？`)) return;
    const client = getSupabaseClient();
    if (!client) { show('error', 'Supabase環境変数を設定してください。'); return; }
    setSavingId(slotId);
    const { data: userData } = await client.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) { setSavingId(null); window.location.href = '/login'; return; }
    const { data: reservation, error: findError } = await client.from('reservations').select('id').eq('member_id', userId).eq('reservation_slot_id', slotId).eq('status', 'booked').maybeSingle();
    if (findError || !reservation) {
      setSavingId(null);
      show('error', findError?.message ?? 'キャンセルできる予約が見つかりません。');
      return;
    }
    const { error } = await client.from('reservations').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: userId }).eq('id', reservation.id);
    setSavingId(null);
    if (error) { show('error', `キャンセルに失敗しました: ${error.message}`); return; }
    show('success', '予約をキャンセルしました。');
    void load(true);
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <SupabaseNotice />
        {!menuId ? (
          <>
            <div><h1 className="text-3xl font-black">予約する</h1><p className="text-sm font-semibold text-gray-600">予約したいメニューを選んでください。</p></div>
            {msg && <div className={`whitespace-pre-line rounded-2xl border p-4 text-sm font-bold ${msgClass(msg.kind)}`}>{msg.text}</div>}
            <section className="space-y-3 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
              {loading && <p className="font-bold text-gray-500">読み込み中です。</p>}
              {!loading && menus.map((menu) => <button key={menu.id} type="button" onClick={() => { setMenuId(menu.id); setOffset(0); }} className="flex w-full items-center justify-between gap-4 rounded-3xl border border-gray-200 p-5 text-left shadow-sm hover:bg-yellow-50"><span><span className="block text-2xl font-black">{menu.name}</span><span className="text-sm font-bold text-gray-500">定員目安 {menu.capacity}名</span></span><span className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-black">選択</span></button>)}
            </section>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3"><div><h1 className="text-2xl font-black">{selectedMenu?.name} の予約</h1><p className="text-xs font-bold text-gray-500">{dates[0]?.dateLabel}〜{dates[dates.length - 1]?.dateLabel}</p></div><button type="button" onClick={() => { setMenuId(''); setSlots([]); }} className="rounded-full border bg-white px-4 py-2 text-xs font-black">メニュー変更</button></div>
            {msg && <div className={`whitespace-pre-line rounded-2xl border p-4 text-sm font-bold ${msgClass(msg.kind)}`}>{msg.text}</div>}
            <section className="rounded-3xl border border-gray-200 bg-white p-3 shadow-sm"><div className="mb-3 grid grid-cols-4 gap-2"><button type="button" onClick={() => setOffset((v) => Math.max(0, v - (mode === 'week' ? 7 : 3)))} disabled={offset === 0} className="rounded-full border px-2 py-2 text-xs font-black disabled:opacity-40">前</button><button type="button" onClick={() => { setMode('threeDays'); setOffset(0); }} className={`rounded-full px-2 py-2 text-xs font-black ${mode === 'threeDays' ? 'bg-yellow-400' : 'border'}`}>3日</button><button type="button" onClick={() => { setMode('week'); setOffset(0); }} className={`rounded-full px-2 py-2 text-xs font-black ${mode === 'week' ? 'bg-yellow-400' : 'border'}`}>1週間</button><button type="button" onClick={() => setOffset((v) => v + (mode === 'week' ? 7 : 3))} className="rounded-full border border-gray-900 px-2 py-2 text-xs font-black">次</button></div>{loading ? <div className="rounded-2xl bg-gray-50 p-5 text-center text-sm font-bold text-gray-600">予約枠を読み込んでいます。</div> : <ReservationGrid dense dates={dates} slots={slots} submittingSlotId={savingId} timeLabels={times} onReserve={reserve} onCancel={cancelBooked} />}</section>
            <UnavailableBlocksSummary dense dates={dates} />
            {showBlockPuzzleLink && (
              <section className="rounded-3xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm" aria-label="ストレスリセット">
                <p className="text-sm font-bold text-yellow-900">ストレスリセット</p>
                <p className="mt-1 text-sm font-semibold text-gray-700">予約確認のあとに、既存のブロックパズルで気分転換できます。</p>
                <Link href="/block-puzzle" className="mt-4 block w-full rounded-full bg-gray-950 px-6 py-4 text-center text-base font-black text-white shadow-sm active:scale-95 sm:inline-block sm:w-auto">
                  ブロックパズルを開始
                </Link>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
