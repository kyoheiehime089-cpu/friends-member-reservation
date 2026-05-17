"use client";

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { SupabaseNotice } from '@/components/SupabaseNotice';
import { getSupabaseClient } from '@/lib/supabaseClient';

function OwnerShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/owner" className="shrink-0 font-black text-yellow-300">friends 管理者</Link>
          <nav className="flex gap-3 overflow-x-auto whitespace-nowrap text-xs font-black sm:text-sm">
            <Link href="/owner/members">会員作成</Link>
            <Link href="/owner/member-list">会員一覧</Link>
            <Link href="/owner/schedules">予約枠</Link>
            <Link href="/owner/plans">プラン</Link>
            <Link href="/owner/menus">メニュー</Link>
            <Link href="/owner/reservations">予約一覧</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

export function AdminPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [message, setMessage] = useState('管理者権限を確認しています。');

  useEffect(() => {
    let mounted = true;
    async function check() {
      const client = getSupabaseClient();
      if (!client) {
        if (mounted) {
          setMessage('Supabase環境変数を設定してください。');
          setChecking(false);
        }
        return;
      }

      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (mounted) {
          setMessage('管理者としてサインインしてください。');
          setChecking(false);
        }
        return;
      }

      const response = await fetch('/api/admin/me', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (mounted) {
        setAllowed(response.ok && result.ok === true);
        setMessage(result.message ?? '管理者権限がありません。');
        setChecking(false);
      }
    }
    void check();
    return () => { mounted = false; };
  }, []);

  if (checking || !allowed) {
    return (
      <OwnerShell>
        <SupabaseNotice />
        <div className="mx-auto max-w-xl rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <p className="text-xl font-black">{checking ? '確認中' : '管理者画面'}</p>
          <p className="mt-3 font-bold text-gray-600">{message}</p>
          {!checking && <Link href="/owner/signin" className="mt-5 inline-block rounded-full bg-yellow-400 px-6 py-3 font-black text-gray-950">管理者サインイン</Link>}
        </div>
      </OwnerShell>
    );
  }

  return (
    <OwnerShell>
      <section className="space-y-5">
        <SupabaseNotice />
        <div>
          <h1 className="text-3xl font-black text-gray-900">{title}</h1>
          <p className="mt-2 text-gray-600">{description}</p>
        </div>
        {children}
      </section>
    </OwnerShell>
  );
}
