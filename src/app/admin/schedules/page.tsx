import { AdminPage } from '@/components/AdminPage';
import { weekdaySlots, weekendSlots } from '@/lib/initialData';

export default function AdminSchedulesPage() {
  return (
    <AdminPage title="予約枠管理" description="時間枠の追加、編集、休業日、一括作成を管理します。">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-black">平日（月火水金）</h2><p className="mt-2 text-sm text-gray-600">木曜定休</p><div className="mt-4 flex flex-wrap gap-2">{weekdaySlots.map((slot) => <span key={slot} className="rounded-full bg-yellow-100 px-4 py-2 font-bold">{slot}</span>)}</div></div>
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-black">土日祝</h2><div className="mt-4 flex flex-wrap gap-2">{weekendSlots.map((slot) => <span key={slot} className="rounded-full bg-yellow-100 px-4 py-2 font-bold">{slot}</span>)}</div></div>
      </div>
    </AdminPage>
  );
}
