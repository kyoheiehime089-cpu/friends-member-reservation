"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AdminSchedulesPage() {
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
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">スケジュール管理</h1>
      <p>このページでは時間枠の追加、編集、休業日設定、一括設定ができます。</p>
      {/* TODO: implement schedule management */}
    </div>
  );
}