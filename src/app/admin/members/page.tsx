import { AdminPage } from '@/components/AdminPage';
import { initialPlans, memberStatuses } from '@/lib/initialData';

export default function AdminMembersPage() {
  return (
    <AdminPage title="会員一覧" description="会員登録、プラン変更、ステータス管理、仮パスワード送信準備を行います。">
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:justify-between">
            <input className="rounded-xl border px-3 py-2" placeholder="会員名・メールで検索" />
            <button className="rounded-full bg-yellow-400 px-5 py-2 font-black">会員を追加</button>
          </div>
          <table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">会員</th><th>プラン</th><th>状態</th></tr></thead><tbody><tr className="border-b"><td className="py-3">デモ会員</td><td>{initialPlans[0].name}</td><td>{memberStatuses[0]}</td></tr></tbody></table>
        </div>
        <div className="rounded-3xl border border-yellow-200 bg-yellow-50 p-5">
          <h2 className="font-black">初期ステータス</h2>
          <ul className="mt-3 space-y-2 text-sm font-semibold">{memberStatuses.map((status) => <li key={status}>{status}</li>)}</ul>
        </div>
      </div>
    </AdminPage>
  );
}
