"use client";

import { useEffect, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type Menu = { id: string; name: string; default_capacity: number };
type ApiBody = { ok?: boolean; message?: string; menus?: Menu[]; count?: number };

export default function OwnerSlotBulkPage() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [menuId, setMenuId] = useState('');
  const [capacity, setCapacity] = useState(5);
  const [isOpen, setIsOpen] = useState(true);
  const [days, setDays] = useState<string>('all');
  const [message, setMessage] = useState('メニューを読み込んでいます。');
  const [saving, setSaving] = useState(false);

  async function token() {
    const client = getSupabaseClient();
    if (!client) return '';
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? '';
  }

  async function adminFetch(path: string, init?: RequestInit) {
    const accessToken = await token();
    if (!accessToken) throw new Error('管理者としてサインインしてください。');
    return fetch(path, { ...init, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, cache: 'no-store' });
  }

  async function load() {
    try {
      const response = await adminFetch('/api/admin/menus');
      const body = await response.json().catch(() => ({})) as ApiBody;
      if (!response.ok || !body.ok) throw new Error(body.message ?? 'メニュー一覧の取得に失敗しました。');
      const nextMenus = body.menus ?? [];
      setMenus(nextMenus);
      if (!menuId && nextMenus[0]) {
        setMenuId(nextMenus[0].id);
        setCapacity(nextMenus[0].default_capacity);
      }
      setMessage('一括変更した設定は、次に手動で変えるまでそのメニューの標準設定として残ります。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'メニュー一覧の取得に失敗しました。');
    }
  }

  useEffect(() => { void load(); }, []);

  async function applyBulk() {
    if (!menuId) return setMessage('メニューを選択してください。');
    const menu = menus.find((item) => item.id === menuId);
    const label = menu?.name ?? '選択したメニュー';
    const periodText = days === 'all' ? '以後ずっと' : `既存の未来枠 ${days}日分`;
    if (!window.confirm(`${label} を「定員${capacity}名 / ${isOpen ? '受付中' : '受付停止'}」に変更します。\n${periodText}に反映し、次に手動で変えるまで標準設定として残します。`)) return;
    setSaving(true);
    setMessage('一括変更しています。');
    try {
      const response = await adminFetch('/api/admin/slot-bulk', {
        method: 'PATCH',
        body: JSON.stringify({ menuId, capacity, isOpen, days })
      });
      const body = await response.json().catch(() => ({})) as ApiBody;
      if (!response.ok || !body.ok) throw new Error(body.message ?? '一括変更に失敗しました。');
      setMessage(body.message ?? `${body.count ?? 0}件の予約枠を一括変更しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '一括変更に失敗しました。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage title="予約枠の一括変更" description="メニュー単位で定員・受付状態をまとめて変更します。">
      <div className="space-y-5">
        <p className="rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-900">{message}</p>
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">メニュー単位で一括変更</h2>
          <p className="mt-2 text-sm font-bold text-gray-500">例：セミパーソナル全体を定員8名に変更すると、今後作るセミパーソナル枠も定員8名になります。</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-black text-gray-700">
              対象メニュー
              <select className="rounded-xl border px-3 py-3 font-bold" value={menuId} onChange={(event) => { const next = menus.find((item) => item.id === event.target.value); setMenuId(event.target.value); if (next) setCapacity(next.default_capacity); }}>
                {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-black text-gray-700">
              既存の未来枠への反映範囲
              <select className="rounded-xl border px-3 py-3 font-bold" value={days} onChange={(event) => setDays(event.target.value)}>
                <option value="all">以後ずっと</option>
                <option value="30">既存の未来枠 30日分</option>
                <option value="60">既存の未来枠 60日分</option>
                <option value="90">既存の未来枠 90日分</option>
                <option value="180">既存の未来枠 180日分</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-black text-gray-700">
              定員
              <input className="rounded-xl border px-3 py-3 font-bold" type="number" min="1" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} />
            </label>
            <label className="grid gap-2 text-sm font-black text-gray-700">
              受付状態
              <select className="rounded-xl border px-3 py-3 font-bold" value={isOpen ? 'open' : 'closed'} onChange={(event) => setIsOpen(event.target.value === 'open')}>
                <option value="open">受付中</option>
                <option value="closed">受付停止</option>
              </select>
            </label>
          </div>
          <button type="button" disabled={saving} onClick={() => void applyBulk()} className="mt-5 w-full rounded-full bg-yellow-400 px-5 py-4 font-black text-gray-950 disabled:opacity-50">{saving ? '一括変更中' : '一括変更する'}</button>
        </section>
      </div>
    </AdminPage>
  );
}
