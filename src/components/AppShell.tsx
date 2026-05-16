import Link from 'next/link';
import type { ReactNode } from 'react';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-yellow-50 via-white to-white">
      <header className="sticky top-0 z-10 border-b border-yellow-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="shrink-0 font-black text-yellow-600">friends予約</Link>
          <nav className="flex shrink-0 gap-2 text-xs font-black text-gray-700 sm:gap-3 sm:text-sm">
            <Link href="/reserve">予約</Link>
            <Link href="/my-reservations">一覧</Link>
            <Link href="/history">履歴</Link>
            <a href="/admin/members?v=5" className="text-gray-700">管理</a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
