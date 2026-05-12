import { AdminPage } from '@/components/AdminPage';
import { sampleReservations } from '@/lib/initialData';

export default function AdminReservationsPage() {
  return (
    <AdminPage title="予約一覧" description="予約検索、管理者による予約追加、キャンセル処理を行います。">
      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:justify-between">
          <input className="rounded-xl border px-3 py-2" placeholder="会員名・メニューで検索" />
          <button className="rounded-full bg-yellow-400 px-5 py-2 font-black">管理者予約を追加</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr className="border-b"><th className="py-2">日時</th><th>会員</th><th>メニュー</th><th>状態</th><th>操作</th></tr></thead>
            <tbody>{sampleReservations.map((reservation) => <tr key={reservation.id} className="border-b"><td className="py-3">{reservation.date} {reservation.time}</td><td>デモ会員</td><td>{reservation.menu}</td><td>{reservation.status}</td><td><button className="font-bold text-red-600">キャンセル処理</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </AdminPage>
  );
}
