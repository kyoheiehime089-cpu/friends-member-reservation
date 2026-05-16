"use client";

import { useEffect, useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type Member = { id: string; full_name: string | null; email: string | null; status: string | null; plan_id: string | null };
type ApiBody = { ok?: boolean; message?: string; members?: Member[] };

export default function OwnerDeleteMemberPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [notice, setNotice] = useState('退会済みにする会員を選んでください。');
  const [busyId, setBusyId] = useState<string | null>(null);

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
      if (!response.ok || !body.ok) throw new Error(body.message ?? '会員一覧の取得に失敗しました。');
      setMembers((body.members ?? []).filter((member) => member.status !== '退会済み'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '会員一覧の取得に失敗しました。');
    }
  }

  useEffect(() => { void load(); }, []);

  async function remove(member: Member) {
    const label = member.full_name || member.email || 'この会員';
    if (!window.confirm(`${label} を退会済みにしますか？`)) return;
    setBusyId(member.id);
    setNotice('会員を退会済みにしています。');
    try {
      const response = await api('/api/admin/member-delete', {
        method: 'POST',
        body: JSON.stringify({ memberId: member.id })
      });
      const body = await response.json().catch(() => ({})) as ApiBody;
      if (!response.ok || !body.ok) throw new Error(body.message ?? '削除に失敗しました。');
      setNotice('会員を退会済みにしました。');
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '削除に失敗しました。');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminPage title="会員を削除" description="会員を退会済みにして、予約できない状態にします。">
      <div className="space-y-4">
        <p className={`rounded-2xl px-4 py-3 text-sm font-bold ${notice.includes('失敗') || notice.includes('サインイン') ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-gray-700'}`}>{notice}</p>
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">会員一覧</h2>
          <div className="mt-4 grid gap-3">
            {members.map((member) => (
              <div key={member.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-black">{member.full_name || '名前未設定'}</p>
                  <p className="text-sm text-gray-500">{member.email || 'メール未設定'}</p>
                  <p className="mt-1 text-xs font-bold text-gray-500">状態: {member.status || '有効'}</p>
                </div>
                <button type="button" disabled={busyId === member.id} onClick={() => void remove(member)} className="rounded-full bg-red-600 px-5 py-3 font-black text-white disabled:opacity-50">
                  {busyId === member.id ? '処理中' : '退会済みにする'}
                </button>
              </div>
            ))}
            {members.length === 0 && <p className="rounded-2xl bg-gray-50 p-5 text-center font-bold text-gray-500">退会処理できる会員がいません。</p>}
          </div>
        </section>
      </div>
    </AdminPage>
  );
}
