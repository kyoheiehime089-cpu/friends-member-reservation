"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AdminPlansPage() {
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
      <h1 className="text-2xl font-bold mb-4">プラン管理</h1>
      <p>このページではプランの一覧表示、追加、編集、停止ができます。</p>
      {/* TODO: implement plan management */}
    </div>
  );
}