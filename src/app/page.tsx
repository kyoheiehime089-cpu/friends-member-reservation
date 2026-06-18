import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { SupabaseNotice } from '@/components/SupabaseNotice';
import { initialMenus, reservationRules, storeName } from '@/lib/initialData';

export default function HomePage() {
  return (
    <AppShell>
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section className="space-y-6">
          <SupabaseNotice />
          <div className="rounded-3xl bg-yellow-400 p-8 shadow-lg">
            <p className="text-sm font-bold uppercase tracking-wide text-yellow-900">{storeName}</p>
            <h1 className="mt-3 text-4xl font-black leading-tight text-gray-950 md:text-5xl">
              friends / blossom yoga 会員予約システム
            </h1>
            <p className="mt-4 text-lg font-medium text-gray-800">
              メニューを選んで空き枠を確認し、スマホから迷わず予約できます。
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="rounded-full bg-gray-950 px-6 py-3 text-center font-bold text-white">ログイン</Link>
              <Link href="/reserve" className="rounded-full bg-white px-6 py-3 text-center font-bold text-gray-950">予約画面を見る</Link>
              <Link href="/block-puzzle" className="rounded-full bg-yellow-100 px-6 py-3 text-center font-bold text-gray-950 ring-2 ring-yellow-700/20">ブロックパズルを開く</Link>
            </div>
          </div>
        </section>
        <section className="grid gap-4">
          {initialMenus.map((menu) => (
            <div key={menu.id} className="rounded-2xl border border-yellow-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-bold">{menu.name}</h2>
                <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-bold text-yellow-800">定員{menu.capacity}名</span>
              </div>
              <p className="mt-2 text-gray-600">{menu.description}</p>
            </div>
          ))}
        </section>
      </div>
      <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-black">予約ルール</h2>
        <ul className="mt-4 grid gap-2 md:grid-cols-2">
          {reservationRules.map((rule) => <li key={rule} className="rounded-xl bg-gray-50 px-4 py-3 text-sm font-semibold">{rule}</li>)}
        </ul>
      </section>
    </AppShell>
  );
}
