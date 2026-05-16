"use client";

import { useState } from 'react';
import { AdminPage } from '@/components/AdminPage';
import { getSupabaseClient } from '@/lib/supabaseClient';

type ApiBody = { ok?: boolean; message?: string; mail?: { ok?: boolean; message?: string } };

export default function OwnerResendPage() {
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('既存会員のメールアドレスを入力してください。');
  const [busy, setBusy] = useState(false);

  async function token() {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function send() {
    if (!email.trim()) return setNotice('メールアドレスを入力してください。');
    setBusy(true);
    setNotice('ログイン再設定メールを送信しています。');
    try {
      const accessToken = await token();
      if (!accessToken) throw new Error('管理者としてサインインしてください。');
      const response = await fetch('/api/admin/member-resend', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const body = await response.json().catch(() => ({})) as ApiBody;
      if (!response.ok || !body.ok) throw new Error(body.message ?? '送信に失敗しました。');
      setNotice(body.mail?.ok ? 'ログイン再設定メールを送信しました。' : '再設定リンクは作成しましたが、メール送信に失敗しました。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '送信に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPage title="ログイン案内を再送" description="既存会員がログインできない時に、同じメールアドレスへ再設定メールを送ります。">
      <div className="space-y-4">
        <p className={`rounded-2xl px-4 py-3 text-sm font-bold ${notice.includes('失敗') || notice.includes('入力') || notice.includes('サインイン') ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-gray-700'}`}>{notice}</p>
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">既存会員に再送</h2>
          <p className="mt-1 text-sm font-bold text-gray-500">登録済みのメールアドレスでも何回でも送れます。</p>
          <div className="mt-4 grid gap-3">
            <input className="rounded-xl border px-3 py-3" type="email" placeholder="会員のメールアドレス" value={email} onChange={(event) => setEmail(event.target.value)} />
            <button type="button" disabled={busy} onClick={() => void send()} className="rounded-full bg-yellow-400 px-5 py-3 font-black text-gray-950 disabled:opacity-50">
              {busy ? '送信中' : 'ログイン再設定メールを送信'}
            </button>
          </div>
        </section>
      </div>
    </AdminPage>
  );
}
