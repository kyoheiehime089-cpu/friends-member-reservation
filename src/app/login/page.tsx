"use client";

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { SupabaseNotice } from '@/components/SupabaseNotice';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const client = getSupabaseClient();
    if (!client) {
      setError('Supabase環境変数を設定してください。設定後にログインできます。');
      return;
    }

    setLoading(true);
    const { error: loginError } = await client.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (loginError) {
      setError(loginError.message);
      return;
    }

    router.push('/reserve');
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-5">
        <SupabaseNotice />
        <div className="rounded-3xl border border-yellow-200 bg-white p-6 shadow-sm">
          <h1 className="text-center text-3xl font-black">ログイン</h1>
          <p className="mt-2 text-center text-sm text-gray-600">会員・管理者共通のログイン画面です。</p>
          {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <label className="block text-sm font-bold">メールアドレス
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3" />
            </label>
            <label className="block text-sm font-bold">パスワード
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3" />
            </label>
            <button type="submit" disabled={loading || !isSupabaseConfigured} className="w-full rounded-full bg-yellow-400 px-5 py-3 font-black text-gray-950 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? 'ログイン中…' : 'ログイン'}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
