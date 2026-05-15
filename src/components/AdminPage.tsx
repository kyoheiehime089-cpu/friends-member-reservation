"use client";

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { SupabaseNotice } from '@/components/SupabaseNotice';
import { getSupabaseClient } from '@/lib/supabaseClient';

const adminLinks = [
  { href: '/admin', label: 'ダッシュボード' },
  { href: '/admin/reservations', label: '予約一覧' },
  { href: '/admin/members', label: '会員一覧' },
  { href: '/admin/menus', label: 'メニュー管理' },
  { href: '/admin/plans', label: 'プラン管理' },
  { href: '/admin/schedules', label: '予約枠管理' },
  { href: '/admin/settings', label: '基本設定' }
];

export function AdminPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [message, setMessage] = useState('管理者権限を確認しています。');

  useEffect(() => {
    let mounted = true;
    async function checkAdmin() {
      const client = getSupabaseClient();
      if (!client) {
        if (mounted) {
          setMessage('Supabase環境変数を設定してください。');
          setChecking(false);
        }
        return;
      }

      const { data: userData } = await client.auth.getUser();
      if (!userData.user) {
        if (mounted) {
          setMessage('管理者画面を表示するにはログインしてください。');
          setChecking(false);
        }
        return;
      }

      const { data: adminRow, error } = await client
        .from('admin_users')
        .select('id')
        .eq('id', userData.user.id)
        .maybeSingle();

      if (mounted) {
        setAllowed(Boolean(adminRow) && !error);
        setMessage(error ? `管理者権限の確認に失敗しました: ${error.message}` : '管理者権限がありません。');
        setChecking(false);
      }
    }

    void checkAdmin();
    return () => { mounted = false; };
  }, []);

  if (checking || !allowed) {
    return (
      <AppShell>
        <SupabaseNotice />
        <div className="mx-auto max-w-xl rounded-3xl border border-yellow-200 bg-white p-6 text-center shadow-sm">
          <p className="text-xl font-black">{checking ? '確認中' : '管理者画面'}</p>
          <p className="mt-3 font-bold text-gray-600">{message}</p>
          {!checking && <Link href="/login" className="mt-5 inline-block rounded-full bg-yellow-400 px-6 py-3 font-black text-gray-950">ログインへ</Link>}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-3xl border border-yellow-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-yellow-600">Admin</p>
          <nav className="grid gap-2">
            {adminLinks.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-yellow-100">
                {link.label}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="space-y-5">
          <SupabaseNotice />
          <div>
            <h1 className="text-3xl font-black text-gray-900">{title}</h1>
            <p className="mt-2 text-gray-600">{description}</p>
          </div>
          {children}
        </section>
      </div>
    </AppShell>
  );
}
