"use client";

import { useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type Member = { id: string; full_name: string | null; email: string | null };
type Menu = { id: string; name: string };
type Slot = { id: string; menu_id: string; starts_at: string; capacity: number; is_open: boolean };
type ApiBody = { ok?: boolean; message?: string; members?: Member[] };

const fmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });

export default function ManualReservationPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [memberId, setMemberId] = useState('');
  const [menuId, setMenuId] = useState('all');
  const [slotId, setSlotId] = useState('');
  const [message, setMessage] = useState('読み込み中です。');
  const [saving, setSaving] = useState(false);

  const shownSlots = useMemo(() => menuId === 'all' ? slots : slots.filter((s) => s.menu_id === menuId), [slots, menuId]);
  const menuMap = useMemo(() => new Map(menus.map((m) => [m.id, m.name])), [menus]);

  async function token() { const c = getSupabaseClient(); if (!c) return ''; const { data } = await c.auth.getSession(); return data.session?.access_token ?? ''; }
  async function adminFetch(path: string, init?: RequestInit) { const t = await token(); if (!t) throw new Error('管理者としてログインしてください。'); return fetch(path, { ...init, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, cache: 'no-store' }); }

  async function load() {
    const c = getSupabaseClient(); if (!c) return setMessage('Supabase環境変数を設定してください。');
    const memberRes = await adminFetch('/api/admin/members');
    const memberBody = await memberRes.json().catch(() => ({})) as ApiBody;
    if (!memberRes.ok || !memberBody.ok) throw new Error(memberBody.message ?? '会員一覧の取得に失敗しました。');
    const now = new Date(); const end = new Date(); end.setDate(end.getDate() + 90);
    const [{ data: menuRows }, { data: slotRows }] = await Promise.all([
      c.from('menus').select('id,name').eq('is_active', true).order('name'),
      c.from('reservation_slots').select('id,menu_id,starts_at,capacity,is_open').gte('starts_at', now.toISOString()).lte('starts_at', end.toISOString()).order('starts_at')
    ]);
    setMembers(memberBody.members ?? []); setMenus((menuRows ?? []) as Menu[]); setSlots((slotRows ?? []) as Slot[]);
    setMemberId(memberBody.members?.[0]?.id ?? ''); setSlotId(((slotRows ?? []) as Slot[])[0]?.id ?? '');
    setMessage('会員と予約枠を選んで、管理者側から予約を入れられます。');
  }

  useEffect(() => { void load().catch((e) => setMessage(e instanceof Error ? e.message : '読み込みに失敗しました。')); }, []);

  async function reserve() {
    if (!memberId || !slotId) return setMessage('会員と予約枠を選択してください。');
    setSaving(true); setMessage('予約を保存しています。');
    try {
      const res = await adminFetch('/api/admin/manual-reservation', { method: 'POST', body: JSON.stringify({ memberId, slotId }) });
      const body = await res.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (!res.ok || !body.ok) throw new Error(body.message ?? '予約に失敗しました。');
      setMessage(body.message ?? '予約を入れました。');
    } catch (e) { setMessage(e instanceof Error ? e.message : '予約に失敗しました。'); } finally { setSaving(false); }
  }

  return <AdminPage title="代理予約" description="管理者画面から会員の予約を入れます。"><div className="space-y-4"><p className="rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-900">{message}</p><section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm font-black">会員<select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="rounded-xl border px-3 py-3">{members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email || m.id}</option>)}</select></label><label className="grid gap-2 text-sm font-black">メニュー<select value={menuId} onChange={(e) => { setMenuId(e.target.value); setSlotId(''); }} className="rounded-xl border px-3 py-3"><option value="all">全メニュー</option>{menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label></div><label className="mt-4 grid gap-2 text-sm font-black">予約枠<select value={slotId} onChange={(e) => setSlotId(e.target.value)} className="rounded-xl border px-3 py-3">{shownSlots.map((s) => <option key={s.id} value={s.id}>{fmt.format(new Date(s.starts_at))} / {menuMap.get(s.menu_id) ?? '未設定'} / 定員{s.capacity}名 / {s.is_open ? '受付中' : '受付停止'}</option>)}</select></label><button disabled={saving} onClick={() => void reserve()} className="mt-5 w-full rounded-full bg-yellow-400 px-5 py-4 font-black disabled:opacity-50">{saving ? '予約中' : 'この会員で予約する'}</button></section></div></AdminPage>;
}
