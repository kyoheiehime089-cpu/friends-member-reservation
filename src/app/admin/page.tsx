import Link from 'next/link';
import { AdminPage } from '@/components/AdminPage';

const cards = [
  {
    href: '/admin/members',
    title: '会員作成・会員管理',
    text: '新しい会員の作成、プラン変更、会員ステータス変更を行います。'
  },
  {
    href: '/admin/schedules',
    title: '予約枠管理',
    text: '予約枠の作成、日時変更、定員変更、受付停止を行います。'
  },
  {
    href: '/admin/plans',
    title: 'プラン管理',
    text: '週1、週2、通い放題などの予約制限を設定します。'
  },
  {
    href: '/admin/menus',
    title: 'メニュー管理',
    text: 'セミパーソナル、ヨガ、イベントなどを管理します。'
  },
  {
    href: '/admin/reservations',
    title: '予約一覧',
    text: '予約状況とキャンセル状況を確認します。'
  },
  {
    href: '/admin/settings',
    title: '基本設定',
    text: '予約ルールや締切などの基本設定を確認します。'
  }
];

export default function AdminDashboard() {
  return (
    <AdminPage title="管理者ダッシュボード" description="使いたい管理機能を選んでください。">
      <div className="space-y-5">
        <div className="rounded-3xl border border-yellow-200 bg-yellow-50 p-5 shadow-sm">
          <h2 className="text-2xl font-black text-gray-950">会員を作る場合</h2>
          <p className="mt-2 text-sm font-bold text-gray-600">下のボタンから会員作成画面へ進んでください。</p>
          <Link href="/admin/members" className="mt-4 inline-block rounded-full bg-yellow-400 px-6 py-3 font-black text-gray-950">
            会員作成へ進む
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <Link key={card.href} href={card.href} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm hover:border-yellow-300 hover:bg-yellow-50">
              <h2 className="text-xl font-black text-gray-950">{card.title}</h2>
              <p className="mt-2 text-sm font-semibold text-gray-600">{card.text}</p>
              <p className="mt-4 inline-block rounded-full bg-gray-900 px-4 py-2 text-sm font-black text-white">開く</p>
            </Link>
          ))}
        </div>
      </div>
    </AdminPage>
  );
}
