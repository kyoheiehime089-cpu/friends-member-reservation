export default function OwnerSettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-950 px-4 py-4 text-white">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-black text-yellow-300">friends owner</p>
          <h1 className="text-2xl font-black">基本設定</h1>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">現在の予約ルール</h2>
          <div className="mt-4 grid gap-3 text-sm font-bold text-gray-700">
            <p>予約締切：前日22:00まで</p>
            <p>キャンセル締切：前日22:00まで</p>
            <p>同日予約：1日1枠まで</p>
            <p>同時予約：最大2枠まで</p>
            <p>会員ステータス：有効のみ予約可能</p>
          </div>
        </section>
        <a href="/owner" className="inline-block rounded-full bg-yellow-400 px-5 py-3 font-black text-gray-950">管理トップへ戻る</a>
      </main>
    </div>
  );
}
