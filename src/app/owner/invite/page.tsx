"use client";

import { useEffect, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type Plan = { id: string; name: string; weekly_limit: number | null; unlimited: boolean | null; is_active: boolean | null };
type ApiBody = { ok?: boolean; message?: string; plans?: Plan[]; statuses?: string[]; mail?: { ok?: boolean; message?: string } };

function planText(plan: Plan) {
  if (plan.unlimited) return '週回数制限なし';
  if (typeof plan.weekly_limit === 'number') return `週${plan.weekly_limit}回まで`;
  return '個別設定';
}

export default function OwnerInvitePage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [statuses, setStatuses] = useState(['有効', '休会中', '退会予定', '退会済み', '停止中', '未払い']);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [planId, setPlanId] = useState('');
  const [status, setStatus] = useState('有効');
  const [notice, setNotice] = useState('会員名・メールアドレス・プランを入力してください。');
  const [busy, setBusy] = useState(false);

  async function token() {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function api(path: string, init?: RequestInit) {
    const accessToken = await token();
    if (!accessToken) throw new Error('管理者としてサインインしてください。');
    return fetch(path, { ...init, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, cache: 'no-store' });
  }

  async function load() {
    try {
      const response = await api('/api/admin/members');
      const body = await response.json().catch(() => ({})) as ApiBody;
      if (!response.ok || !body.ok) throw new Error(body.message ?? '読み込みに失敗しました。');
      setPlans(body.plans ?? []);
      if (body.statuses?.length) setStatuses(body.statuses);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '読み込みに失敗しました。');
    }
  }

  useEffect(() => { void load(); }, []);

  async function send() {
    if (!fullName.trim()) return setNotice('会員名を入力してください。');
    if (!email.trim()) return setNotice('メールアドレスを入力してください。');
    setBusy(true);
    setNotice('会員を作成し、案内メールを送信しています。');
    try {
      const response = await api('/api/admin/member-invite', {
        method: 'POST',
        body: JSON.stringify({ fullName, email, planId: planId || null, status })
      });
      const body = await response.json().catch(() => ({})) as ApiBody;
      if (!response.ok || !body.ok) throw new Error(body.message ?? '送信に失敗しました。');
      setFullName('');
      setEmail('');
      setPlanId('');
      setStatus('有効');
      setNotice(body.mail?.ok ? '会員を作成し、案内メールを送信しました。' : '会員は作成しましたが、メール送信に失敗しました。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '送信に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPage title="会員招待" description="メールアドレスを入れるだけで会員作成と案内メール送信を行います。">
      <div className="space-y-4">
        <p className={`rounded-2xl px-4 py-3 text-sm font-bold ${notice.includes('失敗') || notice.includes('入力') || notice.includes('サインイン') ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-gray-700'}`}>{notice}</p>
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">新しい会員を招待</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input className="rounded-xl border px-3 py-3 font-bold" placeholder="会員名" value={fullName} onChange={(event) => setFullName(event.target.value)} />
            <input className="rounded-xl border px-3 py-3" type="email" placeholder="メールアドレス" value={email} onChange={(event) => setEmail(event.target.value)} />
            <select className="rounded-xl border px-3 py-3 font-bold" value={planId} onChange={(event) => setPlanId(event.target.value)}>
              <option value="">プラン未設定</option>
              {plans.filter((plan) => plan.is_active !== false).map((plan) => <option key={plan.id} value={plan.id}>{plan.name} / {planText(plan)}</option>)}
            </select>
            <select className="rounded-xl border px-3 py-3 font-bold" value={status} onChange={(event) => setStatus(event.target.value)}>
              {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <button type="button" onClick={() => void send()} disabled={busy} className="rounded-full bg-yellow-400 px-5 py-3 font-black text-gray-950 disabled:opacity-50 md:col-span-2">
              {busy ? '送信中' : '会員を作成して案内メールを送信'}
            </button>
          </div>
        </section>
      </div>
    </AdminPage>
  );
}
