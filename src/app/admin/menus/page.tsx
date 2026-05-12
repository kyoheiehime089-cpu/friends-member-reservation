import { AdminPage } from '@/components/AdminPage';
import { initialMenus } from '@/lib/initialData';

export default function AdminMenusPage() {
  return (
    <AdminPage title="メニュー管理" description="メニューの一覧表示、追加、編集、停止を行います。">
      <div className="grid gap-4 md:grid-cols-3">
        {initialMenus.map((menu) => <div key={menu.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-black">{menu.name}</h2><p className="mt-2 text-sm text-gray-600">{menu.description}</p><p className="mt-4 font-bold">初期定員: {menu.capacity}名</p><button className="mt-4 rounded-full border px-4 py-2 font-bold">編集</button></div>)}
      </div>
    </AdminPage>
  );
}
