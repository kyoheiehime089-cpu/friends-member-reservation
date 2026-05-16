"use client";

import { useEffect, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type Plan = { id: string; name: string; weekly_limit: number | null; unlimited: boolean | null; is_active: boolean | null };
type ApiBody = { ok?: boolean; message?: string; plans?: Plan[]; statuses?: string[]; lineMessage?: string };

export default function OwnerTextPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [statuses, setStatuses] = useState(['有効', '休会中', '退会予定', '退会済み', '停止中', '未払い']);
  const [name, setName] = useState('');
  const [mail, setMail] = useState('');
  const [planId, setPlanId] = useState('');
  const [status, setStatus] = useState('有効');
  const [notice, setNotice] = useState('会員情報を入力してください。');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function token() {
    const client = getSupabaseClient();
    if (!client) return '';
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? '';
  }

  async function load() {
    const t = await token();
    if (!t) return setNotice('管理者としてサインインしてください。');
    const r = await fetch('/api/admin/members', { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
    const b = await r.json().catch(() => ({})) as ApiBody;
    if (!r.ok || !b.ok) return setNotice(b.message ?? '読み込みに失敗しました。');
    setPlans(b.plans ?? []);
    if (b.statuses?.length) setStatuses(b.statuses);
  }

  useEffect(() => { void load(); }, []);

  async function submit() {
    if (!name.trim()) return setNotice('会員名を入力してください。');
    if (!mail.trim()) return setNotice('メールアドレスを入力してください。');
    const t = await token();
    if (!t) return setNotice('管理者としてサインインしてください。');
    setBusy(true);
    setText('');
    setNotice('作成しています。');
    const r = await fetch('/api/admin/member-invite', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: name, email: mail, planId: planId || null, status })
    });
    const b = await r.json().catch(() => ({})) as ApiBody;
    setBusy(false);
    if (!r.ok || !b.ok) return setNotice(b.message ?? '作成に失敗しました。');
    setText(b.lineMessage ?? '');
    setName(''); setMail(''); setPlanId(''); setStatus('有効');
    setNotice('作成しました。下の文面をLステップで送ってください。');
  }

  return (
    <AdminPage title="Lステップ用文面" description="会員作成後に送る文面を作成します。">
      <div className="space-y-4">
        <p className="rounded-2xl bg-yellow-50 px-4 py-3 text-sm font-bold text-gray-700">{notice}</p>
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <input className="rounded-xl border px-3 py-3 font-bold" placeholder="会員名" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="rounded-xl border px-3 py-3" type="email" placeholder="メールアドレス" value={mail} onChange={(e) => setMail(e.target.value)} />
            <select className="rounded-xl border px-3 py-3 font-bold" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">プラン未設定</option>
              {plans.filter((p) => p.is_active !== false).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="rounded-xl border px-3 py-3 font-bold" value={status} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-full bg-yellow-400 px-5 py-3 font-black text-gray-950 disabled:opacity-50 md:col-span-2">{busy ? '作成中' : '文面を作成'}</button>
          </div>
        </section>
        {text && <textarea className="min-h-52 w-full rounded-3xl border border-yellow-200 bg-yellow-50 p-4 text-sm font-bold" value={text} readOnly />}
      </div>
    </AdminPage>
  );
}
