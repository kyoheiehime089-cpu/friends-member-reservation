"use client";

import { useEffect, useMemo, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type MemberRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string | null;
  plan_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PlanRow = {
  id: string;
  name: string;
  weekly_limit: number | null;
  unlimited: boolean | null;
  is_active: boolean | null;
};

type MembersResponse = {
  ok: boolean;
  message?: string;
  members?: MemberRow[];
  plans?: PlanRow[];
  statuses?: string[];
};

function planRuleLabel(plan: PlanRow) {
  if (plan.unlimited) return '週回数制限なし';
  if (typeof plan.weekly_limit === 'number') return `週${plan.weekly_limit}回まで`;
  return '個別設定';
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo'
  }).format(date);
}

export default function AdminMembersPage() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('会員情報を読み込んでいます。');
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { planId: string; status: string }>>({});

  async function getAccessToken() {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function loadMembers() {
    setLoading(true);
    setMessage('会員情報を読み込んでいます。');

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setLoading(false);
      setMessage('管理者としてログインしてください。');
      return;
    }

    const response = await fetch('/api/admin/members', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store'
    });
    const result = await response.json().catch(() => ({})) as MembersResponse;

    if (!response.ok || !result.ok) {
      setLoading(false);
      setMessage(result.message ?? '会員情報の取得に失敗しました。');
      return;
    }

    const nextMembers = result.members ?? [];
    setMembers(nextMembers);
    setPlans(result.plans ?? []);
    setStatuses(result.statuses ?? []);
    setDrafts(Object.fromEntries(nextMembers.map((member) => [
      member.id,
      { planId: member.plan_id ?? '', status: member.status ?? '有効' }
    ])));
    setMessage(nextMembers.length > 0 ? '会員ごとにプランと状態を変更できます。' : '会員がまだ登録されていません。');
    setLoading(false);
  }

  useEffect(() => {
    void loadMembers();
  }, []);

  const filteredMembers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return members;
    return members.filter((member) => `${member.full_name ?? ''} ${member.email ?? ''}`.toLowerCase().includes(keyword));
  }, [members, search]);

  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);

  async function saveMember(memberId: string) {
    const draft = drafts[memberId];
    if (!draft) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMessage('管理者としてログインしてください。');
      return;
    }

    setSavingMemberId(memberId);
    setMessage('会員情報を保存しています。');

    const response = await fetch('/api/admin/members', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        memberId,
        planId: draft.planId || null,
        status: draft.status
      })
    });
    const result = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; member?: MemberRow };

    setSavingMemberId(null);
    if (!response.ok || !result.ok || !result.member) {
      setMessage(result.message ?? '会員情報の保存に失敗しました。');
      return;
    }

    setMembers((current) => current.map((member) => member.id === memberId ? result.member as MemberRow : member));
    setDrafts((current) => ({
      ...current,
      [memberId]: {
        planId: result.member?.plan_id ?? '',
        status: result.member?.status ?? '有効'
      }
    }));
    setMessage('会員情報を保存しました。予約制限は次回の予約から反映されます。');
  }

  return (
    <AdminPage title="会員一覧" description="会員ごとに週1・週2・通い放題などのプランを設定し、予約制限に反映します。">
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              className="rounded-xl border px-3 py-2"
              placeholder="会員名・メールで検索"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              type="button"
              onClick={() => void loadMembers()}
              className="rounded-full bg-gray-900 px-5 py-2 font-black text-white"
            >
              再読み込み
            </button>
          </div>

          <p className={`mb-4 rounded-2xl px-4 py-3 text-sm font-bold ${message.includes('失敗') || message.includes('ログイン') ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-gray-700'}`}>
            {message}
          </p>

          {loading ? (
            <div className="rounded-2xl bg-gray-50 p-6 text-center font-bold text-gray-600">読み込み中...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs text-gray-500">
                    <th className="px-3 py-3">会員</th>
                    <th className="px-3 py-3">現在のプラン</th>
                    <th className="px-3 py-3">プラン変更</th>
                    <th className="px-3 py-3">状態</th>
                    <th className="px-3 py-3">更新日</th>
                    <th className="px-3 py-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member) => {
                    const draft = drafts[member.id] ?? { planId: member.plan_id ?? '', status: member.status ?? '有効' };
                    const currentPlan = member.plan_id ? planMap.get(member.plan_id) : null;
                    const isSaving = savingMemberId === member.id;
                    const changed = draft.planId !== (member.plan_id ?? '') || draft.status !== (member.status ?? '有効');

                    return (
                      <tr key={member.id} className="border-b align-top">
                        <td className="px-3 py-4">
                          <p className="font-black text-gray-900">{member.full_name || '名前未設定'}</p>
                          <p className="text-xs text-gray-500">{member.email || 'メール未設定'}</p>
                          <p className="mt-1 text-[11px] text-gray-400">ID: {member.id}</p>
                        </td>
                        <td className="px-3 py-4">
                          <p className="font-bold">{currentPlan?.name ?? '未設定'}</p>
                          {currentPlan && <p className="text-xs text-gray-500">{planRuleLabel(currentPlan)}</p>}
                        </td>
                        <td className="px-3 py-4">
                          <select
                            className="w-full rounded-xl border px-3 py-2 font-bold"
                            value={draft.planId}
                            onChange={(event) => setDrafts((current) => ({
                              ...current,
                              [member.id]: { ...draft, planId: event.target.value }
                            }))}
                          >
                            <option value="">未設定</option>
                            {plans.map((plan) => (
                              <option key={plan.id} value={plan.id}>{plan.name} / {planRuleLabel(plan)}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-4">
                          <select
                            className="w-full rounded-xl border px-3 py-2 font-bold"
                            value={draft.status}
                            onChange={(event) => setDrafts((current) => ({
                              ...current,
                              [member.id]: { ...draft, status: event.target.value }
                            }))}
                          >
                            {statuses.map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-4 text-xs text-gray-500">{formatDate(member.updated_at ?? member.created_at)}</td>
                        <td className="px-3 py-4">
                          <button
                            type="button"
                            disabled={!changed || isSaving}
                            onClick={() => void saveMember(member.id)}
                            className="rounded-full bg-yellow-400 px-4 py-2 font-black text-gray-950 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                          >
                            {isSaving ? '保存中' : '保存'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredMembers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center font-bold text-gray-500">該当する会員がいません。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-yellow-200 bg-yellow-50 p-5">
          <h2 className="font-black">プラン制限</h2>
          <div className="mt-3 space-y-3 text-sm font-semibold">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-2xl bg-white p-3 shadow-sm">
                <p className="font-black">{plan.name}</p>
                <p className="text-gray-600">{planRuleLabel(plan)}</p>
              </div>
            ))}
            {plans.length === 0 && <p className="text-gray-600">プランが登録されていません。</p>}
          </div>
          <div className="mt-5 rounded-2xl bg-white p-3 text-xs font-bold text-gray-600">
            <p>全プラン共通ルール</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>同日2枠予約は禁止</li>
              <li>予約は前日22:00まで</li>
              <li>キャンセルも前日22:00まで</li>
              <li>キャンセル済みは回数制限に含めない</li>
            </ul>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
