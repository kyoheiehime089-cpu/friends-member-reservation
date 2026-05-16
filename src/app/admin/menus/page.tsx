"use client";

import { useEffect, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type MenuRow = {
  id: string;
  name: string;
  description: string | null;
  default_capacity: number;
  is_active: boolean | null;
};

type MenuDraft = {
  name: string;
  description: string;
  defaultCapacity: number;
  isActive: boolean;
};

type MenusResponse = {
  ok?: boolean;
  message?: string;
  menus?: MenuRow[];
  menu?: MenuRow;
};

const emptyDraft: MenuDraft = {
  name: '',
  description: '',
  defaultCapacity: 5,
  isActive: true
};

export default function AdminMenusPage() {
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, MenuDraft>>({});
  const [newMenu, setNewMenu] = useState<MenuDraft>(emptyDraft);
  const [message, setMessage] = useState('メニューを読み込んでいます。');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function getAccessToken() {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function requestAdmin(path: string, init?: RequestInit) {
    const token = await getAccessToken();
    if (!token) throw new Error('管理者としてログインしてください。');
    return fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {})
      },
      cache: 'no-store'
    });
  }

  function toDraft(menu: MenuRow): MenuDraft {
    return {
      name: menu.name,
      description: menu.description ?? '',
      defaultCapacity: menu.default_capacity,
      isActive: menu.is_active !== false
    };
  }

  async function loadMenus() {
    setLoading(true);
    setMessage('メニューを読み込んでいます。');
    try {
      const response = await requestAdmin('/api/admin/menus');
      const result = await response.json().catch(() => ({})) as MenusResponse;
      if (!response.ok || !result.ok) throw new Error(result.message ?? 'メニューの取得に失敗しました。');
      const nextMenus = result.menus ?? [];
      setMenus(nextMenus);
      setDrafts(Object.fromEntries(nextMenus.map((menu) => [menu.id, toDraft(menu)])));
      setMessage('メニューを追加・編集・停止できます。停止したメニューは会員予約画面に表示されません。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'メニューの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMenus();
  }, []);

  async function createMenu() {
    setSavingId('new');
    setMessage('メニューを作成しています。');
    try {
      const response = await requestAdmin('/api/admin/menus', {
        method: 'POST',
        body: JSON.stringify(newMenu)
      });
      const result = await response.json().catch(() => ({})) as MenusResponse;
      if (!response.ok || !result.ok) throw new Error(result.message ?? 'メニューの作成に失敗しました。');
      setNewMenu(emptyDraft);
      setMessage('メニューを作成しました。');
      await loadMenus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'メニューの作成に失敗しました。');
    } finally {
      setSavingId(null);
    }
  }

  async function saveMenu(menuId: string) {
    const draft = drafts[menuId];
    if (!draft) return;
    setSavingId(menuId);
    setMessage('メニューを保存しています。');
    try {
      const response = await requestAdmin('/api/admin/menus', {
        method: 'PATCH',
        body: JSON.stringify({ id: menuId, ...draft })
      });
      const result = await response.json().catch(() => ({})) as MenusResponse;
      if (!response.ok || !result.ok) throw new Error(result.message ?? 'メニューの保存に失敗しました。');
      setMessage('メニューを保存しました。');
      await loadMenus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'メニューの保存に失敗しました。');
    } finally {
      setSavingId(null);
    }
  }

  async function stopMenu(menuId: string) {
    if (!window.confirm('このメニューを停止しますか？会員予約画面には表示されなくなります。')) return;
    setSavingId(menuId);
    setMessage('メニューを停止しています。');
    try {
      const response = await requestAdmin(`/api/admin/menus?id=${encodeURIComponent(menuId)}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({})) as MenusResponse;
      if (!response.ok || !result.ok) throw new Error(result.message ?? 'メニューの停止に失敗しました。');
      setMessage('メニューを停止しました。');
      await loadMenus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'メニューの停止に失敗しました。');
    } finally {
      setSavingId(null);
    }
  }

  function updateDraft(menuId: string, patch: Partial<MenuDraft>) {
    setDrafts((current) => ({ ...current, [menuId]: { ...current[menuId], ...patch } }));
  }

  return (
    <AdminPage title="メニュー管理" description="メニューの追加、編集、受付表示のON/OFFを行います。">
      <div className="space-y-5">
        <div className="rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-900">{message}</div>

        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">新しいメニューを追加</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_120px_120px]">
            <input className="rounded-xl border px-3 py-2 font-bold" placeholder="メニュー名" value={newMenu.name} onChange={(event) => setNewMenu((current) => ({ ...current, name: event.target.value }))} />
            <input className="rounded-xl border px-3 py-2" placeholder="説明" value={newMenu.description} onChange={(event) => setNewMenu((current) => ({ ...current, description: event.target.value }))} />
            <input className="rounded-xl border px-3 py-2 font-bold" type="number" min="1" value={newMenu.defaultCapacity} onChange={(event) => setNewMenu((current) => ({ ...current, defaultCapacity: Number(event.target.value) }))} />
            <button type="button" onClick={createMenu} disabled={savingId === 'new'} className="rounded-full bg-yellow-400 px-5 py-2 font-black text-gray-950 disabled:opacity-50">追加</button>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">メニュー一覧</h2>
            <button type="button" onClick={() => void loadMenus()} className="rounded-full border border-gray-900 px-4 py-2 text-sm font-bold">再読み込み</button>
          </div>

          {loading && <div className="rounded-2xl bg-gray-50 p-5 text-center font-bold text-gray-600">読み込み中です。</div>}
          {!loading && <div className="grid gap-3">
            {menus.map((menu) => {
              const draft = drafts[menu.id] ?? toDraft(menu);
              const isSaving = savingId === menu.id;
              return (
                <div key={menu.id} className="rounded-2xl border border-gray-200 p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_110px_130px]">
                    <input className="rounded-xl border px-3 py-2 font-bold" value={draft.name} onChange={(event) => updateDraft(menu.id, { name: event.target.value })} />
                    <input className="rounded-xl border px-3 py-2" value={draft.description} onChange={(event) => updateDraft(menu.id, { description: event.target.value })} />
                    <input className="rounded-xl border px-3 py-2 font-bold" type="number" min="1" value={draft.defaultCapacity} onChange={(event) => updateDraft(menu.id, { defaultCapacity: Number(event.target.value) })} />
                    <select className="rounded-xl border px-3 py-2 font-bold" value={draft.isActive ? 'active' : 'inactive'} onChange={(event) => updateDraft(menu.id, { isActive: event.target.value === 'active' })}>
                      <option value="active">表示中</option>
                      <option value="inactive">停止中</option>
                    </select>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void saveMenu(menu.id)} disabled={isSaving} className="rounded-full bg-yellow-400 px-5 py-2 text-sm font-black text-gray-950 disabled:opacity-50">{isSaving ? '保存中' : '保存'}</button>
                    <button type="button" onClick={() => void stopMenu(menu.id)} disabled={isSaving || draft.isActive === false} className="rounded-full border border-red-300 px-5 py-2 text-sm font-black text-red-600 disabled:opacity-40">停止</button>
                  </div>
                </div>
              );
            })}
            {menus.length === 0 && <div className="rounded-2xl bg-gray-50 p-5 text-center font-bold text-gray-600">メニューはまだありません。</div>}
          </div>}
        </section>
      </div>
    </AdminPage>
  );
}
