"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type MenuRow = {
  id: string;
  name: string;
  default_capacity: number;
};

type SlotRow = {
  id: string;
  menu_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  is_open: boolean;
};

type SlotDraft = {
  menuId: string;
  date: string;
  time: string;
  durationMinutes: number;
  capacity: number;
  isOpen: boolean;
};

const gridTimeZone = 'Asia/Tokyo';
const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
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

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function formatTime(value: string) {
  return timeFormatter.format(new Date(value));
}

function toLocalDateTimeIso(date: string, time: string) {
  return `${date}T${time}:00+09:00`;
}

function getDurationMinutes(slot: SlotRow) {
  const start = new Date(slot.starts_at).getTime();
  const end = new Date(slot.ends_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 40;
  return Math.round((end - start) / 60000);
}

function toDraft(slot: SlotRow): SlotDraft {
  return {
    menuId: slot.menu_id,
    date: dateKeyFormatter.format(new Date(slot.starts_at)),
    time: formatTime(slot.starts_at),
    durationMinutes: getDurationMinutes(slot),
    capacity: slot.capacity,
    isOpen: slot.is_open
  };
}

export default function AdminSchedulesPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, SlotDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('18:30');
  const [durationMinutes, setDurationMinutes] = useState(40);
  const [capacity, setCapacity] = useState(5);
  const [isOpen, setIsOpen] = useState(true);

  const selectedMenu = useMemo(() => menus.find((menu) => menu.id === selectedMenuId), [menus, selectedMenuId]);
  const menuNameById = useMemo(() => new Map(menus.map((menu) => [menu.id, menu.name])), [menus]);

  const loadData = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      setMessage('Supabase環境変数を設定してください。');
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data: menuRows, error: menuError } = await client
      .from('menus')
      .select('id,name,default_capacity')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (menuError) {
      setMessage(`メニューの読み込みに失敗しました: ${menuError.message}`);
      setLoading(false);
      return;
    }

    const nextMenus = (menuRows ?? []) as MenuRow[];
    setMenus(nextMenus);
    if (!selectedMenuId && nextMenus[0]) {
      setSelectedMenuId(nextMenus[0].id);
      setCapacity(nextMenus[0].default_capacity);
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 60);

    const { data: slotRows, error: slotError } = await client
      .from('reservation_slots')
      .select('id,menu_id,starts_at,ends_at,capacity,is_open')
      .gte('starts_at', start.toISOString())
      .lte('starts_at', end.toISOString())
      .order('starts_at', { ascending: true })
      .limit(500);

    if (slotError) {
      setMessage(`予約枠の読み込みに失敗しました: ${slotError.message}`);
      setLoading(false);
      return;
    }

    const nextSlots = (slotRows ?? []) as SlotRow[];
    setSlots(nextSlots);
    setDrafts(Object.fromEntries(nextSlots.map((slot) => [slot.id, toDraft(slot)])));
    setLoading(false);
  }, [selectedMenuId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleMenuChange = (menuId: string) => {
    setSelectedMenuId(menuId);
    const menu = menus.find((item) => item.id === menuId);
    if (menu) setCapacity(menu.default_capacity);
  };

  function updateDraft(slotId: string, patch: Partial<SlotDraft>) {
    setDrafts((current) => ({ ...current, [slotId]: { ...current[slotId], ...patch } }));
  }

  const handleCreateSlot = async () => {
    const client = getSupabaseClient();
    if (!client) {
      setMessage('Supabase環境変数を設定してください。');
      return;
    }

    if (!selectedMenu) {
      setMessage('メニューを選択してください。');
      return;
    }

    setSavingId('new');
    const startsAt = toLocalDateTimeIso(date, time);
    const endsAt = new Date(new Date(startsAt).getTime() + durationMinutes * 60 * 1000).toISOString();

    const { data: storeRows, error: storeError } = await client.from('stores').select('id').eq('name', 'friends 行徳').limit(1);
    if (storeError || !storeRows?.[0]) {
      setMessage(`店舗情報の取得に失敗しました: ${storeError?.message ?? 'friends 行徳 が見つかりません'}`);
      setSavingId(null);
      return;
    }

    const { error } = await client.from('reservation_slots').insert({
      store_id: storeRows[0].id,
      menu_id: selectedMenu.id,
      starts_at: startsAt,
      ends_at: endsAt,
      capacity,
      is_open: isOpen
    });

    if (error) {
      setMessage(`予約枠の作成に失敗しました: ${error.message}`);
      setSavingId(null);
      return;
    }

    setMessage('予約枠を作成しました。');
    setSavingId(null);
    await loadData();
  };

  const handleSaveSlot = async (slot: SlotRow) => {
    const client = getSupabaseClient();
    const draft = drafts[slot.id];
    if (!client || !draft) return;

    setSavingId(slot.id);
    const startsAt = toLocalDateTimeIso(draft.date, draft.time);
    const endsAt = new Date(new Date(startsAt).getTime() + draft.durationMinutes * 60 * 1000).toISOString();

    const { error } = await client
      .from('reservation_slots')
      .update({
        menu_id: draft.menuId,
        starts_at: startsAt,
        ends_at: endsAt,
        capacity: draft.capacity,
        is_open: draft.isOpen,
        updated_at: new Date().toISOString()
      })
      .eq('id', slot.id);

    if (error) {
      setMessage(`予約枠の保存に失敗しました: ${error.message}`);
      setSavingId(null);
      return;
    }

    setMessage('予約枠を保存しました。');
    setSavingId(null);
    await loadData();
  };

  const handleToggleOpen = async (slot: SlotRow) => {
    const client = getSupabaseClient();
    if (!client) {
      setMessage('Supabase環境変数を設定してください。');
      return;
    }

    setSavingId(slot.id);
    const { error } = await client
      .from('reservation_slots')
      .update({ is_open: !slot.is_open, updated_at: new Date().toISOString() })
      .eq('id', slot.id);

    if (error) {
      setMessage(`受付状態の変更に失敗しました: ${error.message}`);
      setSavingId(null);
      return;
    }

    setMessage(!slot.is_open ? '受付中に変更しました。' : '受付停止に変更しました。');
    setSavingId(null);
    await loadData();
  };

  const handleDeleteSlot = async (slot: SlotRow) => {
    const client = getSupabaseClient();
    if (!client) {
      setMessage('Supabase環境変数を設定してください。');
      return;
    }

    const confirmed = window.confirm('この予約枠を削除しますか？ 予約が入っている場合は削除せず受付停止にします。');
    if (!confirmed) return;

    setSavingId(slot.id);
    const { data: reservations, error: readError } = await client
      .from('reservations')
      .select('id')
      .eq('reservation_slot_id', slot.id)
      .limit(1);

    if (readError) {
      setMessage(`予約確認に失敗しました: ${readError.message}`);
      setSavingId(null);
      return;
    }

    if ((reservations ?? []).length > 0) {
      const { error } = await client
        .from('reservation_slots')
        .update({ is_open: false, updated_at: new Date().toISOString() })
        .eq('id', slot.id);
      if (error) setMessage(`予約枠の停止に失敗しました: ${error.message}`);
      else setMessage('予約があるため削除せず受付停止にしました。');
      setSavingId(null);
      await loadData();
      return;
    }

    const { error } = await client.from('reservation_slots').delete().eq('id', slot.id);
    if (error) setMessage(`予約枠の削除に失敗しました: ${error.message}`);
    else setMessage('予約枠を削除しました。');
    setSavingId(null);
    await loadData();
  };

  return (
    <AdminPage title="予約枠管理" description="予約枠の作成、時間変更、定員変更、受付停止、削除を管理します。">
      <div className="space-y-5">
        {message && <div className="rounded-2xl bg-yellow-100 p-4 text-sm font-bold text-yellow-900">{message}</div>}
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">予約枠を作成</h2>
          <p className="mt-2 text-sm text-gray-600">木曜日や休業日でも、ここで枠を作ると会員予約画面に表示できます。</p>
          <div className="mt-4 grid gap-3 md:grid-cols-6">
            <label className="grid gap-1 text-sm font-bold">メニュー
              <select value={selectedMenuId} onChange={(event) => handleMenuChange(event.target.value)} className="rounded-xl border px-3 py-2">
                {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold">日付
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-xl border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-bold">開始
              <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="rounded-xl border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-bold">分数
              <input type="number" min="5" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="rounded-xl border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-bold">定員
              <input type="number" min="1" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} className="rounded-xl border px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-bold">状態
              <select value={isOpen ? 'open' : 'closed'} onChange={(event) => setIsOpen(event.target.value === 'open')} className="rounded-xl border px-3 py-2">
                <option value="open">受付中</option>
                <option value="closed">受付停止</option>
              </select>
            </label>
          </div>
          <button type="button" onClick={handleCreateSlot} disabled={savingId === 'new'} className="mt-4 rounded-full bg-yellow-400 px-6 py-3 font-black text-gray-950 disabled:opacity-50">
            {savingId === 'new' ? '保存中...' : '予約枠を作成'}
          </button>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">今後60日分の予約枠</h2>
              <p className="mt-1 text-sm text-gray-600">予約済み枠は削除ではなく受付停止に切り替えます。</p>
            </div>
            <button type="button" onClick={() => void loadData()} className="rounded-full border border-gray-900 px-4 py-2 text-sm font-bold">再読み込み</button>
          </div>
          {loading && <div className="rounded-2xl bg-gray-50 p-4 font-bold text-gray-600">読み込み中です。</div>}
          {!loading && slots.length === 0 && <div className="rounded-2xl bg-gray-50 p-4 font-bold text-gray-600">予約枠はまだありません。</div>}
          <div className="grid gap-3">
            {slots.map((slot) => {
              const draft = drafts[slot.id] ?? toDraft(slot);
              const isSaving = savingId === slot.id;
              return (
                <div key={slot.id} className="rounded-2xl border border-gray-200 p-4">
                  <p className="font-black">{formatDateTime(slot.starts_at)}</p>
                  <p className="mb-3 text-sm font-bold text-gray-500">{menuNameById.get(slot.menu_id) ?? 'メニュー未設定'} / 定員 {slot.capacity}名 / {slot.is_open ? '受付中' : '受付停止'}</p>
                  <div className="grid gap-3 md:grid-cols-6">
                    <select value={draft.menuId} onChange={(event) => updateDraft(slot.id, { menuId: event.target.value })} className="rounded-xl border px-3 py-2 font-bold">
                      {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
                    </select>
                    <input type="date" value={draft.date} onChange={(event) => updateDraft(slot.id, { date: event.target.value })} className="rounded-xl border px-3 py-2" />
                    <input type="time" value={draft.time} onChange={(event) => updateDraft(slot.id, { time: event.target.value })} className="rounded-xl border px-3 py-2" />
                    <input type="number" min="5" value={draft.durationMinutes} onChange={(event) => updateDraft(slot.id, { durationMinutes: Number(event.target.value) })} className="rounded-xl border px-3 py-2" />
                    <input type="number" min="1" value={draft.capacity} onChange={(event) => updateDraft(slot.id, { capacity: Number(event.target.value) })} className="rounded-xl border px-3 py-2" />
                    <select value={draft.isOpen ? 'open' : 'closed'} onChange={(event) => updateDraft(slot.id, { isOpen: event.target.value === 'open' })} className="rounded-xl border px-3 py-2 font-bold">
                      <option value="open">受付中</option>
                      <option value="closed">受付停止</option>
                    </select>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void handleSaveSlot(slot)} disabled={isSaving} className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-black text-gray-950 disabled:opacity-50">{isSaving ? '保存中' : '保存'}</button>
                    <button type="button" onClick={() => void handleToggleOpen(slot)} disabled={isSaving} className="rounded-full border border-gray-900 px-4 py-2 text-sm font-bold">{slot.is_open ? '受付停止' : '受付中に戻す'}</button>
                    <button type="button" onClick={() => void handleDeleteSlot(slot)} disabled={isSaving} className="rounded-full border border-red-300 px-4 py-2 text-sm font-black text-red-600">削除</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
