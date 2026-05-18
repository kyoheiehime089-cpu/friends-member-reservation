"use client";

import { useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { adminFetch } from '@/lib/adminClient';
import { selectableBasePlans, selectedPlanIdsFromMemberPlan, selectExclusivePlanIds, type PlanLike } from '@/lib/planBundles';
import { normalizeMemberStatus } from '@/lib/memberStatus';

type MemberRow = { id: string; full_name: string | null; email: string | null; status: string | null; plan_id: string | null; created_at: string | null; updated_at: string | null };
type PlanRow = PlanLike & { weekly_limit: number | null; unlimited: boolean | null; is_active: boolean | null };
type Draft = { planIds: string[]; status: string };
type NewMember = { fullName: string; email: string; password: string; planIds: string[]; status: string };

type ResponseBody = { ok?: boolean; message?: string; members?: MemberRow[]; plans?: PlanRow[]; statuses?: string[]; member?: MemberRow };

const emptyNew: NewMember = { fullName: '', email: '', password: '', planIds: [], status: '有効' };
const defaultStatuses = ['有効', '休止中', '休会中'];

function planRule(plan: PlanRow) {
  if (plan.unlimited) return '通い放題';
  return typeof plan.weekly_limit === 'number' ? `週${plan.weekly_limit}回` : '個別';
}

function dateLabel(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(date);
}

function sameIds(a: string[], b: string[]) {
  return [...a].sort().join(',') === [...b].sort().join(',');
}

export function AdminMembersClient() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [statuses, setStatuses] = useState(defaultStatuses);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newMember, setNewMember] = useState<NewMember>(emptyNew);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('会員情報を読み込んでいます。');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const basePlans = useMemo(() => selectableBasePlans(plans) as PlanRow[], [plans]);
  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return members;
    return members.filter((member) => `${member.full_name ?? ''} ${member.email ?? ''}`.toLowerCase().includes(keyword));
  }, [members, search]);

  async function load() {
    setLoading(true);
    setMessage('会員情報を読み込んでいます。');
    try {
      const response = await adminFetch('/api/admin/members');
      const result = await response.json().catch(() => ({})) as ResponseBody;
      if (!response.ok || !result.ok) { setMessage(result.message ?? '会員情報の取得に失敗しました。'); setLoading(false); return; }
      const nextPlans = result.plans ?? [];
      const nextMembers = (result.members ?? []).map((member) => ({ ...member, status: normalizeMemberStatus(member.status) }));
      setPlans(nextPlans);
      setMembers(nextMembers);
      setStatuses(result.statuses?.length ? result.statuses : defaultStatuses);
      setDrafts(Object.fromEntries(nextMembers.map((member) => [member.id, { planIds: selectedPlanIdsFromMemberPlan(nextPlans, member.plan_id), status: normalizeMemberStatus(member.status) }])));
      setMessage(nextMembers.length ? '複数プランの付与・状態変更・会員削除ができます。' : '会員がまだ登録されていません。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '会員情報の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function togglePlan(ids: string[], planId: string) {
    return selectExclusivePlanIds(plans, ids, planId);
  }

  async function createMember() {
    if (!newMember.fullName.trim()) return setMessage('会員名を入力してください。');
    if (!newMember.email.trim()) return setMessage('メールアドレスを入力してください。');
    if (newMember.password.trim().length < 6) return setMessage('初期パスワードは6文字以上で入力してください。');
    setSavingId('new');
    setMessage('会員を作成しています。');
    try {
      const response = await adminFetch('/api/admin/members', { method: 'POST', body: JSON.stringify({ fullName: newMember.fullName, email: newMember.email, password: newMember.password, planId: newMember.planIds[0] ?? null, status: newMember.status }) });
      const result = await response.json().catch(() => ({})) as ResponseBody;
      if (!response.ok || !result.ok || !result.member) { setMessage(result.message ?? '会員の作成に失敗しました。'); return; }
      if (newMember.planIds.length > 1 || newMember.planIds[0] !== result.member.plan_id) {
        const planResponse = await adminFetch('/api/admin/member-plan', { method: 'PATCH', body: JSON.stringify({ memberId: result.member.id, planIds: newMember.planIds, status: newMember.status }) });
        const planResult = await planResponse.json().catch(() => ({})) as ResponseBody;
        if (!planResponse.ok || !planResult.ok) throw new Error(planResult.message ?? '会員は作成しましたが、プラン保存に失敗しました。');
      }
      setNewMember(emptyNew);
      setMessage('会員を作成しました。');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '会員の作成に失敗しました。');
    } finally {
      setSavingId(null);
    }
  }

  async function saveMember(member: MemberRow) {
    const draft = drafts[member.id];
    if (!draft) return;
    setSavingId(member.id);
    setMessage('会員情報を保存しています。');
    try {
      const response = await adminFetch('/api/admin/member-plan', { method: 'PATCH', body: JSON.stringify({ memberId: member.id, planIds: draft.planIds, status: draft.status }) });
      const result = await response.json().catch(() => ({})) as ResponseBody;
      if (!response.ok || !result.ok) { setMessage(result.message ?? '会員情報の保存に失敗しました。'); return; }
      setMessage('会員情報を保存しました。');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '会員情報の保存に失敗しました。');
    } finally {
      setSavingId(null);
    }
  }

  async function deleteMember(member: MemberRow) {
    const name = member.full_name || member.email || 'この会員';
    if (!window.confirm(`${name}を削除しますか？`)) return;
    setSavingId(member.id);
    setMessage('会員を削除しています。');
    try {
      const response = await adminFetch('/api/admin/members/delete', { method: 'POST', body: JSON.stringify({ memberId: member.id }) });
      const result = await response.json().catch(() => ({})) as ResponseBody;
      if (!response.ok || !result.ok) { setMessage(result.message ?? '会員削除に失敗しました。'); return; }
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setMessage('会員を削除しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '会員削除に失敗しました。');
    } finally {
      setSavingId(null);
    }
  }

  function planChecklist(ids: string[], onChange: (ids: string[]) => void) {
    return <div className="grid gap-2 sm:grid-cols-2">{basePlans.map((plan) => <label key={plan.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black ${ids.includes(plan.id) ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200 bg-white'}`}><input type="checkbox" checked={ids.includes(plan.id)} onChange={() => onChange(togglePlan(ids, plan.id))} /><span>{plan.name}<span className="ml-1 text-gray-500">{planRule(plan)}</span></span></label>)}</div>;
  }

  return (
    <AdminPage title="会員管理" description="会員作成、複数プラン付与、状態管理、削除を行います。">
      <div className="space-y-4">
        <p className={`rounded-2xl px-4 py-3 text-sm font-bold ${message.includes('失敗') || message.includes('入力') || message.includes('ログイン') ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-gray-700'}`}>{message}</p>
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">新しい会員を作成</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <input className="rounded-xl border px-3 py-2 font-bold" placeholder="会員名" value={newMember.fullName} onChange={(e) => setNewMember((v) => ({ ...v, fullName: e.target.value }))} />
            <input className="rounded-xl border px-3 py-2" type="email" placeholder="メールアドレス" value={newMember.email} onChange={(e) => setNewMember((v) => ({ ...v, email: e.target.value }))} />
            <input className="rounded-xl border px-3 py-2" placeholder="初期パスワード 6文字以上" value={newMember.password} onChange={(e) => setNewMember((v) => ({ ...v, password: e.target.value }))} />
            <select className="rounded-xl border px-3 py-2 font-bold" value={newMember.status} onChange={(e) => setNewMember((v) => ({ ...v, status: e.target.value }))}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
          </div>
          <div className="mt-4"><p className="mb-2 text-sm font-black">付けるプラン 複数選択可</p>{planChecklist(newMember.planIds, (planIds) => setNewMember((v) => ({ ...v, planIds })))}</div>
          <button type="button" onClick={() => void createMember()} disabled={savingId === 'new'} className="mt-4 rounded-full bg-yellow-400 px-6 py-3 font-black disabled:opacity-50">{savingId === 'new' ? '作成中' : '会員を作成'}</button>
        </section>
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><input className="rounded-xl border px-3 py-2" placeholder="会員名・メールで検索" value={search} onChange={(e) => setSearch(e.target.value)} /><button type="button" onClick={() => void load()} className="rounded-full bg-gray-900 px-5 py-2 font-black text-white">再読み込み</button></div>
          {loading ? <div className="rounded-2xl bg-gray-50 p-6 text-center font-bold text-gray-600">読み込み中...</div> : <div className="grid gap-3">{filtered.map((member) => {
            const draft = drafts[member.id] ?? { planIds: selectedPlanIdsFromMemberPlan(plans, member.plan_id), status: normalizeMemberStatus(member.status) };
            const currentPlan = member.plan_id ? planMap.get(member.plan_id) : null;
            const isSaving = savingId === member.id;
            const changed = !sameIds(draft.planIds, selectedPlanIdsFromMemberPlan(plans, member.plan_id)) || draft.status !== normalizeMemberStatus(member.status);
            return <div key={member.id} className="rounded-2xl border border-gray-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-lg font-black">{member.full_name || '名前未設定'}</p><p className="text-xs text-gray-500">{member.email || 'メール未設定'}</p><p className="mt-1 text-xs font-bold text-gray-500">現在: {currentPlan?.name ?? '未設定'} / {normalizeMemberStatus(member.status)} / 更新 {dateLabel(member.updated_at ?? member.created_at)}</p></div><div className="flex gap-2"><button type="button" disabled={!changed || isSaving} onClick={() => void saveMember(member)} className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-black disabled:bg-gray-200 disabled:text-gray-400">{isSaving ? '保存中' : '保存'}</button><button type="button" disabled={isSaving} onClick={() => void deleteMember(member)} className="rounded-full border border-red-300 px-4 py-2 text-sm font-black text-red-600">削除</button></div></div><div className="mt-3 grid gap-3 lg:grid-cols-[1fr_160px]"><div>{planChecklist(draft.planIds, (planIds) => setDrafts((v) => ({ ...v, [member.id]: { ...draft, planIds } })))}</div><select className="rounded-xl border px-3 py-2 font-bold" value={draft.status} onChange={(e) => setDrafts((v) => ({ ...v, [member.id]: { ...draft, status: e.target.value } }))}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></div></div>;
          })}{filtered.length === 0 && <div className="rounded-2xl bg-gray-50 p-6 text-center font-bold text-gray-500">該当する会員がいません。</div>}</div>}
        </section>
      </div>
    </AdminPage>
  );
}
