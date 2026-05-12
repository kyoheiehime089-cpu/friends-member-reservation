import { AdminPage } from '@/components/AdminPage';

const cards = [
  ['今日の予約', '当日の予約数、満席枠、キャンセル連絡を確認します。'],
  ['管理者による予約追加', '電話・店頭受付分を代理で登録できる導線です。'],
  ['管理者によるキャンセル処理', '期限後キャンセルや例外対応を管理者が処理します。'],
  ['基本設定', '予約受付開始日、同時予約数、キャンセル期限を変更します。']
];

export default function AdminDashboard() {
  return (
    <AdminPage title="管理者ダッシュボード" description="friends と blossom yoga の予約運用をまとめて確認します。">
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map(([title, text]) => (
          <div key={title} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">{title}</h2>
            <p className="mt-2 text-gray-600">{text}</p>
          </div>
        ))}
      </div>
    </AdminPage>
  );
}
