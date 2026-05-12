import { AdminPage } from '@/components/AdminPage';
import { ownerEmail, reservationRules } from '@/lib/initialData';

export default function AdminSettingsPage() {
  return (
    <AdminPage title="基本設定" description="予約ルール、メール通知、初期オーナー、予約受付開始日を管理します。">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-black">予約ルール</h2><ul className="mt-3 space-y-2 text-sm font-semibold">{reservationRules.map((rule) => <li key={rule}>・{rule}</li>)}</ul></div>
        <div className="rounded-3xl border border-yellow-200 bg-yellow-50 p-5"><h2 className="text-xl font-black">通知・オーナー</h2><p className="mt-3 text-sm font-semibold">初期オーナーメール: {ownerEmail}</p><p className="mt-2 text-sm text-gray-700">メールAPIキーは環境変数にのみ設定し、GitHubには保存しません。</p></div>
      </div>
    </AdminPage>
  );
}
