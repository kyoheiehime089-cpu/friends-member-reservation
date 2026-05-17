"use client";

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';

type Menu = { id: string; name: string; default_capacity: number };
type Slot = { id: string; menu_id: string; starts_at: string; ends_at?: string | null; capacity: number; is_open: boolean };
type Draft = { menuId: string; date: string; time: string; minutes: number; capacity: number; isOpen: boolean };

type Props = {
  slots: Slot[];
  menus: Menu[];
  counts: Record<string, number>;
  onSaved: () => Promise<void> | void;
  onMessage: (message: string) => void;
};

const zone = 'Asia/Tokyo';
const dateFmt = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });
const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });
const labelFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: zone });

function toLocalIso(date: string, time: string) {
  return `${date}T${time}:00+09:00`;
}

function toDraft(slot: Slot): Draft {
  const start = new Date(slot.starts_at);
  const end = slot.ends_at ? new Date(slot.ends_at) : new Date(start.getTime() + 40 * 60000);
  const diff = Math.round((end.getTime() - start.getTime()) / 60000);
  return {
    menuId: slot.menu_id,
    date: dateFmt.format(start),
    time: timeFmt.format(start),
    minutes: Number.isFinite(diff) && diff > 0 ? diff : 40,
    capacity: slot.capacity,
    isOpen: slot.is_open
  };
}

export function AdminScheduleRows({ slots, menus, counts, onSaved, onMessage }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState<Draft>(() => ({ menuId: '', date: dateFmt.format(new Date()), time: '18:30', minutes: 40, capacity: 5, isOpen: true }));
  const menuById = useMemo(() => new Map(menus.map((menu) => [menu.id, menu])), [menus]);

  useEffect(() => {
    setDrafts(Object.fromEntries(slots.map((slot) => [slot.id, toDraft(slot)])));
  }, [slots]);

  useEffect(() => {
    if (!newDraft.menuId && menus[0]) setNewDraft((draft) => ({ ...draft, menuId: menus[0].id, capacity: menus[0].default_capacity }));
  }, [menus, newDraft.menuId]);

  function patch(slotId: string, change: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [slotId]: { ...current[slotId], ...change } }));
  }

  async function saveSlot(slotId: string) {
    const client = getSupabaseClient();
    const draft = drafts[slotId];
    if (!client || !draft) return;
    setSavingId(slotId);
    const startsAt = toLocalIso(draft.date, draft.time);
    const { error } = await client.from('reservation_slots').update({
      menu_id: draft.menuId,
      starts_at: startsAt,
      ends_at: new Date(new Date(startsAt).getTime() + draft.minutes * 60000).toISOString(),
      capacity: draft.capacity,
      is_open: draft.isOpen,
      updated_at: new Date().toISOString()
    }).eq('id', slotId);
    onMessage(error ? `予約枠の保存に失敗しました: ${error.message}` : '予約枠を保存しました。');
    setSavingId(null);
    await onSaved();
  }

  async function createSlot() {
    const client = getSupabaseClient();
    if (!client || !newDraft.menuId) return;
    setSavingId('new');
    const startsAt = toLocalIso(newDraft.date, newDraft.time);
    const { data: stores, error: storeError } = await client.from('stores').select('id').eq('name', 'friends 行徳').limit(1);
    if (storeError || !stores?.[0]) {
      onMessage(`店舗情報の取得に失敗しました: ${storeError?.message ?? 'friends 行徳 が見つかりません'}`);
      setSavingId(null);
      return;
    }
    const { error } = await client.from('reservation_slots').insert({
      store_id: stores[0].id,
      menu_id: newDraft.menuId,
      starts_at: startsAt,
      ends_at: new Date(new Date(startsAt).getTime() + newDraft.minutes * 60000).toISOString(),
      capacity: newDraft.capacity,
      is_open: newDraft.isOpen
    });
    onMessage(error ? `予約枠の作成に失敗しました: ${error.message}` : '予約枠を作成しました。');
    setSavingId(null);
    await onSaved();
  }

  async function removeSlot(slotId: string) {
    const client = getSupabaseClient();
    if (!client) return;
    if (!window.confirm('この予約枠を削除しますか？予約が入っている場合は受付停止にします。')) return;
    setSavingId(slotId);
    const hasBooking = (counts[slotId] ?? 0) > 0;
    const result = hasBooking
      ? await client.from('reservation_slots').update({ is_open: false, updated_at: new Date().toISOString() }).eq('id', slotId)
      : await client.from('reservation_slots').delete().eq('id', slotId);
    onMessage(result.error ? `予約枠の削除に失敗しました: ${result.error.message}` : hasBooking ? '予約があるため受付停止にしました。' : '予約枠を削除しました。');
    setSavingId(null);
    await onSaved();
  }

  function fields(draft: Draft, change: (patch: Partial<Draft>) => void) {
    return <div className="grid gap-2 md:grid-cols-[1.5fr_1.1fr_0.9fr_0.8fr_0.8fr_1fr]">
      <select value={draft.menuId} onChange={(e) => { const menu = menuById.get(e.target.value); change({ menuId: e.target.value, capacity: menu?.default_capacity ?? draft.capacity }); }} className="rounded-xl border px-3 py-2 text-sm font-bold">{menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}</select>
      <input type="date" value={draft.date} onChange={(e) => change({ date: e.target.value })} className="rounded-xl border px-3 py-2 text-sm" />
      <input type="time" value={draft.time} onChange={(e) => change({ time: e.target.value })} className="rounded-xl border px-3 py-2 text-sm" />
      <input type="number" min="5" value={draft.minutes} onChange={(e) => change({ minutes: Number(e.target.value) })} className="rounded-xl border px-3 py-2 text-sm" />
      <input type="number" min="1" value={draft.capacity} onChange={(e) => change({ capacity: Number(e.target.value) })} className="rounded-xl border px-3 py-2 text-sm" />
      <select value={draft.isOpen ? 'open' : 'closed'} onChange={(e) => change({ isOpen: e.target.value === 'open' })} className="rounded-xl border px-3 py-2 text-sm font-bold"><option value="open">受付中</option><option value="closed">受付停止</option></select>
    </div>;
  }

  return <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
    <h2 className="text-lg font-black">予約枠を作成・編集</h2>
    <div className="mt-3 rounded-2xl border border-yellow-200 bg-yellow-50 p-3">
      <p className="mb-2 text-sm font-black">新規作成</p>
      {fields(newDraft, (change) => setNewDraft((draft) => ({ ...draft, ...change })))}
      <button type="button" onClick={() => void createSlot()} disabled={savingId === 'new'} className="mt-2 rounded-full bg-yellow-400 px-5 py-2 text-sm font-black disabled:opacity-50">{savingId === 'new' ? '作成中' : '作成'}</button>
    </div>
    <div className="mt-4 grid gap-3">
      {slots.map((slot) => {
        const draft = drafts[slot.id] ?? toDraft(slot);
        return <div key={slot.id} className="rounded-2xl border border-gray-200 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black">{labelFmt.format(new Date(slot.starts_at))} / {menuById.get(slot.menu_id)?.name ?? '未設定'} / {counts[slot.id] ?? 0}/{slot.capacity}名</p><div className="flex gap-2"><button type="button" onClick={() => void saveSlot(slot.id)} disabled={savingId === slot.id} className="rounded-full bg-yellow-400 px-4 py-2 text-xs font-black disabled:opacity-50">保存</button><button type="button" onClick={() => void removeSlot(slot.id)} disabled={savingId === slot.id} className="rounded-full border border-red-300 px-4 py-2 text-xs font-black text-red-600 disabled:opacity-50">削除</button></div></div>
          {fields(draft, (change) => patch(slot.id, change))}
        </div>;
      })}
      {slots.length === 0 && <div className="rounded-2xl bg-gray-50 p-4 text-center text-sm font-bold text-gray-500">この週の予約枠はありません。</div>}
    </div>
  </section>;
}
