"use client";

import { useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { buildBundlePlanName, getPlanCategory, selectableBasePlans, selectedPlanIdsFromMemberPlan, selectExclusivePlanIds, type PlanLike } from '@/lib/planBundles';
import { normalizeMemberStatus } from '@/lib/memberStatus';

type Member = { id: string; full_name: string | null; email: string | null; status: string | null; plan_id: string | null };
type Plan = PlanLike & { weekly_limit: number | null; unlimited: boolean | null; is_active: boolean | null };
type ApiBody = { ok?: boolean; message?: string; members?: Member[]; plans?: Plan[]; member?: Member };

function planRule(plan: Plan) {
  if (plan.unlimited) return '通い放題';
  return typeof plan.weekly_limit === 'number' ? `週${plan.weekly_limit}回` : '個別';
}

function sameIds(a: string[], b: string[]) {
  return [...a].sort().join(',') === [...b].sort().join(',');
}

export function MemberPlanManagerClient() {
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('会員情報を読み込んでいます。');
  const [savingId, setSavingId] = useState('');

  const basePlans = useMemo(() => selectableBasePlans(plans) as Plan[], [plans]);
  const groupedPlans = useMemo(() => {
    const map = new Map<string, Plan[]>();
    basePlans.forEach((plan) => {
      const category = getPlanCategory(plan.name) || 'その他';
      map.set(category, [...(map.get(category) ?? []), plan]);
    });
    return Array.from(map.entries());
  }, [basePlans]);
  const filteredMembers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return members;
    return members.filter((member) => `${member.full_name ?? ''} ${member.email ?? ''}`.toLowerCase().includes(keyword));
  }, [members, search]);

  async function token() {
    const client = getSupabaseClient();
    if (!client) return '';
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? '';
  }

  async function adminFetch(path: string, init?: RequestInit) {
    const accessToken = await token();
    if (!accessToken) throw new Error('管理者としてログインしてください。');
    return fetch(path, { ...init, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, cache: 'no-store' });
  }

  async function load() {
    try {
      const response = await adminFetch('/api/admin/members');
      const body = await response.json().catch(() => ({})) as ApiBody;
      if (!response.ok || !body.ok) throw new Error(body.message ?? '会員情報の取得に失敗しました。');
      const nextPlans = body.plans ?? [];
      const nextMembers = (body.members ?? []).map((member) => ({ ...member, status: normalizeMemberStatus(member.status) }));
      setPlans(nextPlans);
      setMembers(nextMembers);
      setDrafts(Object.fromEntries(nextMembers.map((member) => [member.id, selectedPlanIdsFromMemberPlan(nextPlans, member.plan_id)])));
      setMessage('セミパーソナル・ヨガなど同じ種類の中では1つだけ選べます。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '会員情報の取得に失敗しました。');
    }
  }

  useEffect(() => { void load(); }, []);

  function toggle(memberId: string, planId: string) {
    setDrafts((current) => ({ ...current, [memberId]: selectExclusivePlanIds(plans, current[memberId] ?? [], planId) }));
  }

  async function ensurePlan(planIds: string[]) {
    const cleanIds = Array.from(new Set(planIds.filter(Boolean)));
    if (cleanIds.length === 0) return null;
    if (cleanIds.length === 1) return cleanIds[0];
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase環境変数を設定してください。');
    const name = buildBundlePlanName(plans, cleanIds);
    const existing = plans.find((plan) => plan.name === name);
    if (existing) return existing.id;
    const { data, error } = await client.from('plans').insert({ name, weekly_limit: null, unlimited: false, is_active: true }).select('id,name,weekly_limit,unlimited,is_active').single();
    if (error) throw new Error(`組み合わせプランの作成に失敗しました: ${error.message}`);
    const created = data as Plan;
    setPlans((current) => [...current, created]);
    return created.id;
  }

  async function save(member: Member) {
    setSavingId(member.id);
    try {
      const planId = await ensurePlan(drafts[member.id] ?? []);
      const response = await adminFetch('/api/admin/members', { method: 'PATCH', body: JSON.stringify({ memberId: member.id, planId, status: normalizeMemberStatus(member.status) }) });
      const body = await response.json().catch(() => ({})) as ApiBody;
      if (!response.ok || !body.ok) throw new Error(body.message ?? '保存に失敗しました。');
      setMessage(`${member.full_name || member.email || '会員'}さんのプランを保存しました。`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setSavingId('');
    }
  }

  return (
    <AdminPage title="会員一覧" description="会員ごとのプラン付与を管理します。">
      <div className="space-y-4">
        <div className="rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-900">{message}</div>
        <div className="flex flex-col gap-2 rounded-3xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <input className="rounded-xl border px-3 py-3 text-sm font-bold" placeholder="会員名・メールで検索" value={search} onChange={(event) => setSearch(event.target.value)} />
          <a href="/owner/bulk-plan" className="rounded-full bg-gray-900 px-5 py-3 text-center text-sm font-black text-white">全員に一括付与</a>
        </div>
        <div className="grid gap-3">
          {filteredMembers.map((member) => {
            const currentIds = selectedPlanIdsFromMemberPlan(plans, member.plan_id);
            const draftIds = drafts[member.id] ?? [];
            const changed = !sameIds(currentIds, draftIds);
            return <section key={member.id} className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-black">{member.full_name || '名前未設定'}</p><p className="text-xs text-gray-500">{member.email}</p></div><button type="button" disabled={!changed || savingId === member.id} onClick={() => void save(member)} className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-black disabled:bg-gray-200 disabled:text-gray-400">{savingId === member.id ? '保存中' : '保存'}</button></div>
              <div className="mt-3 grid gap-3">{groupedPlans.map(([category, categoryPlans]) => <div key={category} className="rounded-2xl border border-gray-200 p-3"><p className="mb-2 text-xs font-black text-gray-500">{category}はいずれか1つ</p><div className="grid gap-2 sm:grid-cols-2">{categoryPlans.map((plan) => <label key={plan.id} className={`rounded-xl border px-3 py-2 text-xs font-black ${draftIds.includes(plan.id) ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'}`}><input className="mr-2" type="checkbox" checked={draftIds.includes(plan.id)} onChange={() => toggle(member.id, plan.id)} />{plan.name}<span className="ml-1 text-gray-500">{planRule(plan)}</span></label>)}</div></div>)}</div>
            </section>;
          })}
        </div>
      </div>
    </AdminPage>
  );
}
