"use client";

import { useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { buildBundlePlanName, selectableBasePlans, selectedPlanIdsFromMemberPlan, type PlanLike } from '@/lib/planBundles';

type Member = { id: string; full_name: string | null; email: string | null; plan_id: string | null; status: string | null };
type Plan = PlanLike & { weekly_limit: number | null; unlimited: boolean | null; is_active: boolean | null };
type ApiBody = { ok?: boolean; message?: string; members?: Member[]; plans?: Plan[]; member?: Member; plan?: Plan };

function rule(plan: Plan) { return plan.unlimited ? '通い放題' : typeof plan.weekly_limit === 'number' ? `週${plan.weekly_limit}回` : '個別'; }
function same(a: string[], b: string[]) { return [...a].sort().join(',') === [...b].sort().join(','); }

export default function BulkPlanPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [target, setTarget] = useState('all');
  const [planIds, setPlanIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [message, setMessage] = useState('読み込み中です。');
  const [saving, setSaving] = useState(false);

  const basePlans = useMemo(() => selectableBasePlans(plans) as Plan[], [plans]);
  const targetPlan = useMemo(() => target === 'all' ? null : plans.find((p) => p.id === target), [plans, target]);
  const targetMembers = useMemo(() => target === 'all' ? members : members.filter((m) => same(selectedPlanIdsFromMemberPlan(plans, m.plan_id), targetPlan ? selectedPlanIdsFromMemberPlan(plans, targetPlan.id) : [target])), [members, plans, target, targetPlan]);

  async function token() { const c = getSupabaseClient(); if (!c) return ''; const { data } = await c.auth.getSession(); return data.session?.access_token ?? ''; }
  async function adminFetch(path: string, init?: RequestInit) { const t = await token(); if (!t) throw new Error('管理者としてログインしてください。'); return fetch(path, { ...init, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, cache: 'no-store' }); }
  async function load() { const res = await adminFetch('/api/admin/members'); const body = await res.json().catch(() => ({})) as ApiBody; if (!res.ok || !body.ok) throw new Error(body.message ?? '読み込みに失敗しました。'); setMembers(body.members ?? []); setPlans(body.plans ?? []); setMessage('対象と追加するプランを選んでください。'); }
  useEffect(() => { void load().catch((e) => setMessage(e instanceof Error ? e.message : '読み込みに失敗しました。')); }, []);

  function toggle(id: string) { setPlanIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]); }
  async function ensurePlan(ids: string[]) {
    if (ids.length === 0) return null;
    if (ids.length === 1) return ids[0];
    const name = buildBundlePlanName(plans, ids);
    const found = plans.find((p) => p.name === name);
    if (found) return found.id;
    const response = await adminFetch('/api/admin/plans', { method: 'POST', body: JSON.stringify({ name, weeklyLimit: null, unlimited: true, isActive: true }) });
    const body = await response.json().catch(() => ({})) as ApiBody;
    if (!response.ok || !body.ok || !body.plan) throw new Error(body.message ?? '組み合わせプランの作成に失敗しました。');
    const created = body.plan as Plan;
    setPlans((current) => [...current, created]);
    return created.id;
  }

  async function apply() {
    if (planIds.length === 0) return setMessage('付けるプランを選択してください。');
    if (!window.confirm(`${targetMembers.length}名にプランを一括反映します。よろしいですか？`)) return;
    setSaving(true); setMessage('一括反映中です。');
    try {
      let count = 0;
      for (const member of targetMembers) {
        const currentIds = selectedPlanIdsFromMemberPlan(plans, member.plan_id);
        const nextIds = mode === 'replace' ? planIds : Array.from(new Set([...currentIds, ...planIds]));
        const planId = await ensurePlan(nextIds);
        const res = await adminFetch('/api/admin/members', { method: 'PATCH', body: JSON.stringify({ memberId: member.id, planId, status: member.status || '有効' }) });
        const result = await res.json().catch(() => ({})) as ApiBody;
        if (!res.ok || !result.ok) throw new Error(result.message ?? '一括反映に失敗しました。');
        count += 1;
      }
      setMessage(`${count}名にプランを反映しました。`);
      await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : '一括反映に失敗しました。'); } finally { setSaving(false); }
  }

  return <AdminPage title="プラン一括付与" description="全員、または特定プランの会員だけに新しいプランをまとめて追加できます。"><div className="space-y-4"><p className="rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-900">{message}</p><section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="grid gap-4 md:grid-cols-3"><label className="grid gap-2 text-sm font-black">対象<select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-xl border px-3 py-3"><option value="all">全員</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="grid gap-2 text-sm font-black">反映方法<select value={mode} onChange={(e) => setMode(e.target.value as 'add' | 'replace')} className="rounded-xl border px-3 py-3"><option value="add">今のプランに追加</option><option value="replace">選択したプランに置き換え</option></select></label><div className="rounded-2xl bg-gray-50 p-4 text-sm font-black">対象人数: {targetMembers.length}名</div></div><div className="mt-5"><p className="mb-2 text-sm font-black">付けるプラン 複数選択可</p><div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">{basePlans.map((p) => <label key={p.id} className={`rounded-xl border px-3 py-2 text-sm font-black ${planIds.includes(p.id) ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'}`}><input className="mr-2" type="checkbox" checked={planIds.includes(p.id)} onChange={() => toggle(p.id)} />{p.name}<span className="ml-1 text-xs text-gray-500">{rule(p)}</span></label>)}</div></div><button disabled={saving} onClick={() => void apply()} className="mt-5 w-full rounded-full bg-yellow-400 px-5 py-4 font-black disabled:opacity-50">{saving ? '反映中' : '一括反映する'}</button></section></div></AdminPage>;
}
