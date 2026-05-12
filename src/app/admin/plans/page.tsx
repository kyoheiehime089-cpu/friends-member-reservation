import { AdminPage } from '@/components/AdminPage';
import { initialPlans } from '@/lib/initialData';

export default function AdminPlansPage() {
  return (
    <AdminPage title="プラン管理" description="週回数制限や通い放題プランを管理します。">
      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">{initialPlans.map((plan) => <div key={plan.name} className="rounded-2xl bg-gray-50 p-4"><h2 className="font-black">{plan.name}</h2><p className="text-sm text-gray-600">{plan.weeklyLimit}</p></div>)}</div>
      </div>
    </AdminPage>
  );
}
