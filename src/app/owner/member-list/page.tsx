"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type Member = {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string | null;
  plan_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Plan = {
  id: string;
  name: string;
  weekly_limit: number | null;
  unlimited: boolean | null;
  is_active: boolean | null;
};

type ApiBody = {
  ok?: boolean;
  message?: string;
  members?: Member[];
  plans?: Plan[];
  statuses?: string[];
  member?: Member;
};

type Draft = { planId: string; status: string; pauseMonth: string };

const statusChoices = ['有効', '休止予定', '休止中', '停止中'];

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' }).format(date);
}

function nextMonthValue() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

function pauseStartIsPast(status?: string | null) {
  if (!status?.startsWith('休止予定:')) return false;
  const value = status.replace('休止予定:', '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const start = new Date(`${value}T00:00:00+09:00`);
  return !Number.isNaN(start.getTime()) && new Date() >= start;
}

function baseStatus(status?: string | null) {
  if (pauseStartIsPast(status)) return '休止中';
  if (status?.startsWith('休止予定:')) return '休止予定';
  return statusChoices.includes(status ?? '') ? status ?? '有効' : '有効';
}

function pauseMonth(status?: string | null) {
  const min = nextMonthValue();
  if (!status?.startsWith('休止予定:')) return min;
  const value = status.replace('休止予定:', '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(value)) return min;
  return value < min ? min : value;
}

function displayStatus(status?: string | null) {
  if (pauseStartIsPast(status)) return '休止中（休止開始日を過ぎています）';
  if (status?.startsWith('休止予定:')) {
    const month = status.replace('休止予定:', '').slice(0, 7);
    const [year, monthNumber] = month.split('-');
    return `休止予定：${year}年${Number(monthNumber)}月〜`;
  }
  return baseStatus(status);
}

function planRule(plan: Plan) {
  if (plan.unlimited) return '通い放題';
  if (typeof plan.weekly_limit === 'number') return `週${plan.weekly_limit}回まで`;
  return '個別設定';
}

export default function OwnerMemberListPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [statuses, setStatuses] = useState(statusChoices);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('会員情報を読み込んでいます。');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function token() {
    const client = getSupabaseClient();
    if (!client) return '';
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? '';
  }

  async function adminFetch(path: string, init?: RequestInit) {
    const accessToken = await token();
    if (!accessToken) throw new Error('管理者としてサインインしてください。');
    return fetch(path, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      cache: 'no-store'
    });
  }

  function makeDraft(member: Member): Draft {
    return { planId: member.plan_id ?? '', status: baseStatus(member.status), pauseMonth: pauseMonth(member.status) };
  }

  async function load() {
    setNotice('会員情報を読み込んでいます。');
    try {
      const response = await adminFetch('/api/admin/members');
      const body = await response.json().catch(() => ({})) as ApiBody;
      if (!response.ok || !body.ok) throw new Error(body.message ?? '会員情報の取得に失敗しました。');
      const nextMembers = body.members ?? [];
      setMembers(nextMembers);
      setPlans(body.plans ?? []);
      setStatuses(statusChoices);
      setDrafts(Object.fromEntries(nextMembers.map((member) => [member.id, makeDraft(member)])));
      setNotice('会員のプラン・状態・休止開始月を変更できます。休止予定は翌月以降のみ選択できます。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '会員情報の取得に失敗しました。');
    }
  }

  useEffect(() => { void load(); }, []);

  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);
  const activePlans = useMemo(() => plans.filter((plan) => plan.is_active !== false), [plans]);
  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return members;
    return members.filter((member) => `${member.full_name ?? ''} ${member.email ?? ''}`.toLowerCase().includes(key));
  }, [members, search]);

  async function save(member: Member, override?: Partial<Draft>) {
    const currentDraft = drafts[member.id] ?? makeDraft(member);
    const draft = { ...currentDraft, ...override };
    if (draft.status === '休止予定' && (!draft.pauseMonth || draft.pauseMonth < nextMonthValue())) {
      setNotice('休止予定にする場合は、翌月以降の休止開始月を選択してください。');
      return;
    }
    setBusyId(member.id);
    setNotice('会員情報を保存しています。');
    try {
      const response = await adminFetch('/api/admin/member-status', {
        method: 'PATCH',
        body: JSON.stringify({ memberId: member.id, planId: draft.planId || null, status: draft.status, pauseMonth: draft.pauseMonth })
      });
      const body = await response.json().catch(() => ({})) as ApiBody;
      if (!response.ok || !body.ok || !body.member) throw new Error(body.message ?? '保存に失敗しました。');
      setMembers((current) => current.map((item) => item.id === member.id ? body.member as Member : item));
      setDrafts((current) => ({ ...current, [member.id]: makeDraft(body.member as Member) }));
      setNotice('会員情報を保存しました。予約制限は次回の予約から反映されます。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setBusyId(null);
    }
  }

  async function setPaused(member: Member) {
    const label = member.full_name || member.email || 'この会員';
    if (!window.confirm(`${label} を休止中にしますか？`)) return;
    await save(member, { status: '休止中' });
  }

  return (
    <AdminPage title="会員一覧・プラン管理" description="会員情報、開始日、プラン、状態、休止開始月を確認・変更できます。">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className={`font-bold ${notice.includes('失敗') || notice.includes('サインイン') || notice.includes('選択') ? 'text-red-700' : 'text-gray-700'}`}>{notice}</p>
          <div className="flex gap-2">
            <Link href="/owner/members" className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-black text-gray-950">会員作成</Link>
            <button type="button" onClick={() => void load()} className="rounded-full bg-gray-900 px-4 py-2 text-sm font-black text-white">再読み込み</button>
          </div>
        </div>

        <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
          <input className="mb-4 w-full rounded-xl border px-3 py-3" placeholder="会員名・メールで検索" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="grid gap-3">
            {filtered.map((member) => {
              const draft = drafts[member.id] ?? makeDraft(member);
              const currentPlan = member.plan_id ? planMap.get(member.plan_id) : null;
              const currentDraft = makeDraft(member);
              const changed = draft.planId !== currentDraft.planId || draft.status !== currentDraft.status || draft.pauseMonth !== currentDraft.pauseMonth;
              return (
                <div key={member.id} className="rounded-2xl border border-gray-200 p-4">
                  <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_auto] lg:items-center">
                    <div>
                      <p className="text-lg font-black text-gray-950">{member.full_name || '名前未設定'}</p>
                      <p className="text-sm text-gray-500">{member.email || 'メール未設定'}</p>
                      <p className="mt-1 text-xs font-bold text-gray-500">開始日：{formatDate(member.created_at)}</p>
                      <p className="mt-1 text-xs font-black text-gray-700">現在の状態：{displayStatus(member.status)}</p>
                    </div>
                    <div className="text-sm font-bold text-gray-700">
                      <p>現在のプラン</p>
                      <p className="text-gray-950">{currentPlan ? `${currentPlan.name} / ${planRule(currentPlan)}` : '未設定'}</p>
                    </div>
                    <select className="rounded-xl border px-3 py-3 font-bold" value={draft.planId} onChange={(event) => setDrafts((current) => ({ ...current, [member.id]: { ...draft, planId: event.target.value } }))}>
                      <option value="">プラン未設定</option>
                      {activePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} / {planRule(plan)}</option>)}
                    </select>
                    <select className="rounded-xl border px-3 py-3 font-bold" value={draft.status} onChange={(event) => setDrafts((current) => ({ ...current, [member.id]: { ...draft, status: event.target.value } }))}>
                      {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <div>
                      {draft.status === '休止予定' ? (
                        <label className="grid gap-1 text-xs font-black text-gray-600">
                          休止開始月
                          <input type="month" min={nextMonthValue()} className="rounded-xl border px-3 py-3 text-sm font-bold" value={draft.pauseMonth} onChange={(event) => setDrafts((current) => ({ ...current, [member.id]: { ...draft, pauseMonth: event.target.value } }))} />
                        </label>
                      ) : (
                        <p className="rounded-xl bg-gray-50 px-3 py-3 text-xs font-bold text-gray-400">休止月なし</p>
                      )}
                    </div>
                    <div className="flex gap-2 lg:flex-col">
                      <button type="button" disabled={!changed || busyId === member.id} onClick={() => void save(member)} className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-black text-gray-950 disabled:bg-gray-200 disabled:text-gray-400">保存</button>
                      <button type="button" disabled={busyId === member.id} onClick={() => void setPaused(member)} className="rounded-full bg-gray-800 px-4 py-2 text-sm font-black text-white disabled:opacity-50">休止中にする</button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="rounded-2xl bg-gray-50 p-5 text-center font-bold text-gray-500">会員がいません。</p>}
          </div>
        </section>
      </div>
    </AdminPage>
  );
}
