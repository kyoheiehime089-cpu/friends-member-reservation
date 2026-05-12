import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { SupabaseNotice } from '@/components/SupabaseNotice';

const adminLinks = [
  { href: '/admin', label: 'ダッシュボード' },
  { href: '/admin/reservations', label: '予約一覧' },
  { href: '/admin/members', label: '会員一覧' },
  { href: '/admin/menus', label: 'メニュー管理' },
  { href: '/admin/plans', label: 'プラン管理' },
  { href: '/admin/schedules', label: '予約枠管理' },
  { href: '/admin/settings', label: '基本設定' }
];

export function AdminPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
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
