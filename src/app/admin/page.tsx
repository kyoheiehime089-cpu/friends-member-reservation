"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      const { data: admin } = await supabase
        .from('admin_profiles')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle();
      setIsAdmin(!!admin);
      setLoading(false);
    };
    checkAdmin();
  }, [router]);

  if (loading) return null;
  if (!isAdmin) {
    return <p className="p-4">管理者権限がありません。</p>;
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">管理者ダッシュボード</h1>
      <p className="mb-4">以下のメニューから操作を行ってください。</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => router.push('/admin/reservations')}
          className="bg-white border p-4 rounded shadow hover:bg-gray-50 text-left"
        >
          予約一覧
        </button>
        <button
          onClick={() => router.push('/admin/members')}
          className="bg-white border p-4 rounded shadow hover:bg-gray-50 text-left"
        >
          会員管理
        </button>
        <button
          onClick={() => router.push('/admin/menus')}
          className="bg-white border p-4 rounded shadow hover:bg-gray-50 text-left"
        >
          メニュー管理
        </button>
        <button
          onClick={() => router.push('/admin/plans')}
          className="bg-white border p-4 rounded shadow hover:bg-gray-50 text-left"
        >
          プラン管理
        </button>
        <button
          onClick={() => router.push('/admin/schedules')}
          className="bg-white border p-4 rounded shadow hover:bg-gray-50 text-left"
        >
          スケジュール管理
        </button>
        <button
          onClick={() => router.push('/admin/settings')}
          className="bg-white border p-4 rounded shadow hover:bg-gray-50 text-left"
        >
          設定管理
        </button>
      </div>
    </div>
  );
}