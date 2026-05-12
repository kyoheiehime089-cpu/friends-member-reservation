import Link from 'next/link';
import type { ReactNode } from 'react';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-yellow-50 via-white to-white">
      <header className="sticky top-0 z-10 border-b border-yellow-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-black text-yellow-600">friends予約</Link>
          <nav className="flex gap-3 text-sm font-semibold text-gray-700">
            <Link href="/reserve">予約</Link>
            <Link href="/my-reservations">予約一覧</Link>
            <Link href="/admin">管理</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
