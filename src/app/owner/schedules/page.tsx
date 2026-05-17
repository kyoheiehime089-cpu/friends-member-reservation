"use client";

import { useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type Menu = { id: string; name: string; default_capacity: number };
type Slot = { id: string; menu_id: string; starts_at: string; ends_at: string; capacity: number; is_open: boolean };

type Draft = { menuId: string; date: string; time: string; minutes: number; capacity: number; isOpen: boolean };

const fmtDate = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo' });
const fmtTime = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo' });
const fmtLabel = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo' });

function iso(date: string, time: string) {
  return `${date}T${time}:00+09:00`;
}

function minutes(slot: Slot) {
  const start = new Date(slot.starts_at).getTime();
  const end = new Date(slot.ends_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 40;
  return Math.round((end - start) / 60000);
}

function draftFrom(slot: Slot): Draft {
  return {
    menuId: slot.menu_id,
    date: fmtDate.format(new Date(slot.starts_at)),
    time: fmtTime.format(new Date(slot.starts_at)),
    minutes: minutes(slot),
    capacity: slot.capacity,
    isOpen: slot.is_open
  };
}

export default function OwnerSchedulesPage() {
  const [message, setMessage] = useState('予約枠を読み込んでいます。');
  const [menus, setMenus] = useState<Menu[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState('');
  const [newDraft, setNewDraft] = useState<Draft>({ menuId: '', date: new Date().toISOString().slice(0, 10), time: '18:30', minutes: 40, capacity: 5, isOpen: true });

  const menuName = useMemo(() => new Map(menus.map((m) => [m.id, m.name])), [menus]);

  async function load() {
    const client = getSupabaseClient();
    if (!client) return setMessage('Supabase環境変数を設定してください。');
    setMessage('予約枠を読み込んでいます。');

    const { data: menuRows, error: menuError } = await client.from('menus').select('id,name,default_capacity').eq('is_active', true).order('name', { ascending: true });
    if (menuError) return setMessage(`メニューの読み込みに失敗しました: ${menuError.message}`);
    const nextMenus = (menuRows ?? []) as Menu[];
    setMenus(nextMenus);
    if (!newDraft.menuId && nextMenus[0]) setNewDraft((d) => ({ ...d, menuId: nextMenus[0].id, capacity: nextMenus[0].default_capacity }));

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 60);
    const { data: slotRows, error: slotError } = await client.from('reservation_slots').select('id,menu_id,starts_at,ends_at,capacity,is_open').gte('starts_at', start.toISOString()).lte('starts_at', end.toISOString()).order('starts_at', { ascending: true }).limit(500);
    if (slotError) return setMessage(`予約枠の読み込みに失敗しました: ${slotError.message}`);
    const nextSlots = (slotRows ?? []) as Slot[];
    setSlots(nextSlots);
    setDrafts(Object.fromEntries(nextSlots.map((s) => [s.id, draftFrom(s)])));
    setMessage('予約枠の追加・編集・受付停止ができます。');
  }

  useEffect(() => { void load(); }, []);

  function changeDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  async function createSlot() {
    const client = getSupabaseClient();
    if (!client) return setMessage('Supabase環境変数を設定してください。');
    if (!newDraft.menuId) return setMessage('先にメニューを作成してください。');
    setSaving('new');
    const startsAt = iso(newDraft.date, newDraft.time);
    const endsAt = new Date(new Date(startsAt).getTime() + newDraft.minutes * 60000).toISOString();
    const { data: storeRows, error: storeError } = await client.from('stores').select('id').limit(1);
    if (storeError || !storeRows?.[0]) {
      setSaving('');
      return setMessage(`店舗情報の取得に失敗しました: ${storeError?.message ?? '店舗がありません'}`);
    }
    const { error } = await client.from('reservation_slots').insert({ store_id: storeRows[0].id, menu_id: newDraft.menuId, starts_at: startsAt, ends_at: endsAt, capacity: newDraft.capacity, is_open: newDraft.isOpen });
    setSaving('');
    if (error) return setMessage(`予約枠の作成に失敗しました: ${error.message}`);
    setMessage('予約枠を作成しました。');
    await load();
  }

  async function saveSlot(slot: Slot) {
    const client = getSupabaseClient();
    const draft = drafts[slot.id];
    if (!client || !draft) return;
    setSaving(slot.id);
    const startsAt = iso(draft.date, draft.time);
    const endsAt = new Date(new Date(startsAt).getTime() + draft.minutes * 60000).toISOString();
    const { error } = await client.from('reservation_slots').update({ menu_id: draft.menuId, starts_at: startsAt, ends_at: endsAt, capacity: draft.capacity, is_open: draft.isOpen }).eq('id', slot.id);
    setSaving('');
    if (error) return setMessage(`予約枠の保存に失敗しました: ${error.message}`);
    setMessage('予約枠を保存しました。');
    await load();
  }

  async function closeSlot(slot: Slot) {
    const client = getSupabaseClient();
    if (!client) return;
    setSaving(slot.id);
    const { error } = await client.from('reservation_slots').update({ is_open: false }).eq('id', slot.id);
    setSaving('');
    if (error) return setMessage(`受付停止に失敗しました: ${error.message}`);
    setMessage('受付停止にしました。');
    await load();
  }

  return (
    <AdminPage title="予約枠管理" description="単発枠の追加、時間変更、定員変更、受付停止を管理します。">
      <div className="space-y-5">
        <p className="rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-900">{message}</p>
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">単発の予約枠を追加</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-6">
            <select className="rounded-xl border px-3 py-3 font-bold" value={newDraft.menuId} onChange={(e) => setNewDraft((d) => ({ ...d, menuId: e.target.value, capacity: menus.find((m) => m.id === e.target.value)?.default_capacity ?? d.capacity }))}>{menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <input className="rounded-xl border px-3 py-3" type="date" value={newDraft.date} onChange={(e) => setNewDraft((d) => ({ ...d, date: e.target.value }))} />
            <input className="rounded-xl border px-3 py-3" type="time" value={newDraft.time} onChange={(e) => setNewDraft((d) => ({ ...d, time: e.target.value }))} />
            <input className="rounded-xl border px-3 py-3" type="number" min="5" value={newDraft.minutes} onChange={(e) => setNewDraft((d) => ({ ...d, minutes: Number(e.target.value) }))} />
            <input className="rounded-xl border px-3 py-3" type="number" min="1" value={newDraft.capacity} onChange={(e) => setNewDraft((d) => ({ ...d, capacity: Number(e.target.value) }))} />
            <button type="button" disabled={saving === 'new'} onClick={() => void createSlot()} className="rounded-full bg-yellow-400 px-5 py-3 font-black text-gray-950 disabled:opacity-50">追加</button>
          </div>
        </section>
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">予約枠一覧</h2><button type="button" onClick={() => void load()} className="rounded-full border px-4 py-2 text-sm font-bold">再読み込み</button></div>
          <div className="grid gap-3">
            {slots.map((slot) => {
              const d = drafts[slot.id] ?? draftFrom(slot);
              return <div key={slot.id} className="rounded-2xl border border-gray-200 p-4">
                <p className="font-black">{fmtLabel.format(new Date(slot.starts_at))}</p>
                <p className="mb-3 text-sm font-bold text-gray-500">{menuName.get(slot.menu_id) ?? 'メニュー未設定'} / 定員 {slot.capacity}名 / {slot.is_open ? '受付中' : '受付停止'}</p>
                <div className="grid gap-3 md:grid-cols-6">
                  <select className="rounded-xl border px-3 py-3 font-bold" value={d.menuId} onChange={(e) => changeDraft(slot.id, { menuId: e.target.value })}>{menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                  <input className="rounded-xl border px-3 py-3" type="date" value={d.date} onChange={(e) => changeDraft(slot.id, { date: e.target.value })} />
                  <input className="rounded-xl border px-3 py-3" type="time" value={d.time} onChange={(e) => changeDraft(slot.id, { time: e.target.value })} />
                  <input className="rounded-xl border px-3 py-3" type="number" min="5" value={d.minutes} onChange={(e) => changeDraft(slot.id, { minutes: Number(e.target.value) })} />
                  <input className="rounded-xl border px-3 py-3" type="number" min="1" value={d.capacity} onChange={(e) => changeDraft(slot.id, { capacity: Number(e.target.value) })} />
                  <select className="rounded-xl border px-3 py-3 font-bold" value={d.isOpen ? 'open' : 'closed'} onChange={(e) => changeDraft(slot.id, { isOpen: e.target.value === 'open' })}><option value="open">受付中</option><option value="closed">受付停止</option></select>
                </div>
                <div className="mt-3 flex gap-2"><button type="button" disabled={saving === slot.id} onClick={() => void saveSlot(slot)} className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-black text-gray-950 disabled:opacity-50">保存</button><button type="button" disabled={saving === slot.id} onClick={() => void closeSlot(slot)} className="rounded-full border border-gray-900 px-4 py-2 text-sm font-bold">受付停止</button></div>
              </div>;
            })}
            {slots.length === 0 && <p className="rounded-2xl bg-gray-50 p-5 text-center font-bold text-gray-500">予約枠はまだありません。</p>}
          </div>
        </section>
      </div>
    </AdminPage>
  );
}
