"use client";

import { useEffect, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type Plan = { id: string; name: string; weekly_limit: number | null; unlimited: boolean | null; is_active: boolean | null };

function label(plan: Plan) {
  return plan.unlimited ? '通い放題' : `週${plan.weekly_limit ?? 1}回まで`;
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [message, setMessage] = useState('読み込み中です。');
  const [newName, setNewName] = useState('');
  const [newLimit, setNewLimit] = useState(1);
  const [newUnlimited, setNewUnlimited] = useState(false);

  async function load() {
    const client = getSupabaseClient();
    if (!client) return setMessage('Supabase環境変数を設定してください。');
    const { data, error } = await client.from('plans').select('id,name,weekly_limit,unlimited,is_active').order('name');
    if (error) return setMessage(`読み込みに失敗しました: ${error.message}`);
    setPlans((data ?? []) as Plan[]);
    setMessage('プランを追加・編集できます。');
  }

  useEffect(() => { void load(); }, []);

  async function addPlan() {
    const client = getSupabaseClient();
    if (!client) return;
    if (!newName.trim()) return setMessage('プラン名を入力してください。');
    const { error } = await client.from('plans').insert({ name: newName.trim(), weekly_limit: newUnlimited ? null : newLimit, unlimited: newUnlimited, is_active: true });
    if (error) return setMessage(`追加に失敗しました: ${error.message}`);
    setNewName('');
    setNewLimit(1);
    setNewUnlimited(false);
    setMessage('プランを追加しました。');
    await load();
  }

  async function savePlan(plan: Plan) {
    const client = getSupabaseClient();
    if (!client) return;
    const { error } = await client.from('plans').update({ name: plan.name, weekly_limit: plan.unlimited ? null : plan.weekly_limit, unlimited: plan.unlimited, is_active: plan.is_active, updated_at: new Date().toISOString() }).eq('id', plan.id);
    if (error) return setMessage(`保存に失敗しました: ${error.message}`);
    setMessage('プランを保存しました。');
    await load();
  }

  function patchPlan(id: string, patch: Partial<Plan>) {
    setPlans((current) => current.map((plan) => plan.id === id ? { ...plan, ...patch } : plan));
  }

  return (
    <AdminPage title="プラン管理" description="週1・週2・通い放題などの予約制限を管理します。">
      <div className="space-y-5">
        <div className="rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-900">{message}</div>
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">新しいプラン</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_120px_150px_120px]">
            <input className="rounded-xl border px-3 py-2 font-bold" placeholder="プラン名" value={newName} onChange={(event) => setNewName(event.target.value)} />
            <input className="rounded-xl border px-3 py-2 font-bold" type="number" min="1" disabled={newUnlimited} value={newLimit} onChange={(event) => setNewLimit(Number(event.target.value))} />
            <select className="rounded-xl border px-3 py-2 font-bold" value={newUnlimited ? 'yes' : 'no'} onChange={(event) => setNewUnlimited(event.target.value === 'yes')}>
              <option value="no">週回数制限</option>
              <option value="yes">通い放題</option>
            </select>
            <button type="button" onClick={() => void addPlan()} className="rounded-full bg-yellow-400 px-5 py-2 font-black text-gray-950">追加</button>
          </div>
        </section>
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">プラン一覧</h2>
          <div className="mt-4 grid gap-3">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-2xl border border-gray-200 p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_120px_150px_120px_120px]">
                  <input className="rounded-xl border px-3 py-2 font-bold" value={plan.name} onChange={(event) => patchPlan(plan.id, { name: event.target.value })} />
                  <input className="rounded-xl border px-3 py-2 font-bold" type="number" min="1" disabled={plan.unlimited === true} value={plan.weekly_limit ?? 1} onChange={(event) => patchPlan(plan.id, { weekly_limit: Number(event.target.value) })} />
                  <select className="rounded-xl border px-3 py-2 font-bold" value={plan.unlimited ? 'yes' : 'no'} onChange={(event) => patchPlan(plan.id, { unlimited: event.target.value === 'yes' })}>
                    <option value="no">週回数制限</option>
                    <option value="yes">通い放題</option>
                  </select>
                  <select className="rounded-xl border px-3 py-2 font-bold" value={plan.is_active === false ? 'no' : 'yes'} onChange={(event) => patchPlan(plan.id, { is_active: event.target.value === 'yes' })}>
                    <option value="yes">有効</option>
                    <option value="no">無効</option>
                  </select>
                  <button type="button" onClick={() => void savePlan(plan)} className="rounded-full bg-yellow-400 px-5 py-2 font-black text-gray-950">保存</button>
                </div>
                <p className="mt-2 text-xs font-bold text-gray-500">現在の制限: {label(plan)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminPage>
  );
}
