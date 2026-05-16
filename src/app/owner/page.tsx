import Link from 'next/link';

const links = [
  { href: '/owner/members', title: '会員作成・会員管理', text: '新規会員作成、プラン変更、状態変更' },
  { href: '/owner/schedules', title: '予約枠管理', text: '枠作成、時間変更、定員変更、受付停止' },
  { href: '/owner/plans', title: 'プラン管理', text: '週1、週2、通い放題の設定' },
  { href: '/owner/menus', title: 'メニュー管理', text: 'セミパーソナル、ヨガ、イベントの管理' },
  { href: '/owner/reservations', title: '予約一覧', text: '予約状況とキャンセル状況の確認' },
  { href: '/owner/settings', title: '基本設定', text: '予約ルールの確認' }
];

export default function OwnerHomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-950 px-4 py-4 text-white">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-black text-yellow-300">friends owner</p>
          <h1 className="text-2xl font-black">管理者専用メニュー</h1>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <section className="rounded-3xl border border-yellow-200 bg-yellow-50 p-5">
          <h2 className="text-xl font-black">管理者だけが使う画面です</h2>
          <p className="mt-2 text-sm font-bold text-gray-600">会員にはこのURLを共有しないでください。</p>
        </section>
        <div className="grid gap-4 md:grid-cols-2">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm hover:border-yellow-300">
              <h2 className="text-xl font-black text-gray-950">{link.title}</h2>
              <p className="mt-2 text-sm font-bold text-gray-600">{link.text}</p>
              <p className="mt-4 inline-block rounded-full bg-yellow-400 px-5 py-2 font-black text-gray-950">開く</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
