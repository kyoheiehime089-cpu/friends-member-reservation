"use client";

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabaseClient';

export default function OwnerSigninPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [notice, setNotice] = useState('管理者アカウントでサインインしてください。');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!client) {
      setNotice('Supabase設定が未完了です。');
      return;
    }
    setLoading(true);
    const result = await client.auth.signInWithPassword({ email, password: secret });
    setLoading(false);
    if (result.error) {
      setNotice(result.error.message);
      return;
    }
    router.replace('/owner');
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-md rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-black text-yellow-600">friends owner</p>
        <h1 className="mt-1 text-2xl font-black">管理者サインイン</h1>
        <p className="mt-4 rounded-2xl bg-yellow-50 p-3 text-sm font-bold text-gray-700">{notice}</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <input className="w-full rounded-xl border px-3 py-3" type="email" placeholder="メールアドレス" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input className="w-full rounded-xl border px-3 py-3" type="password" placeholder="パスワード" value={secret} onChange={(event) => setSecret(event.target.value)} />
          <button disabled={loading} className="w-full rounded-full bg-yellow-400 px-5 py-3 font-black text-gray-950 disabled:opacity-50">{loading ? '確認中' : 'サインイン'}</button>
        </form>
      </div>
    </div>
  );
}
