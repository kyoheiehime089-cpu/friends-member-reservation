"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
      }
      setLoading(false);
    };
    getUser();
  }, []);

  if (loading) return null;

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-3xl font-bold mb-4 text-center">friends 会員予約システム</h1>
      <p className="mb-6 text-center">セミパーソナルジムfriends と blossom yoga の会員予約はこちらから</p>
      {user ? (
        <button
          onClick={() => router.push('/reserve')}
          className="bg-primary text-white px-6 py-2 rounded"
        >
          予約画面へ進む
        </button>
      ) : (
        <button
          onClick={() => router.push('/login')}
          className="bg-primary text-white px-6 py-2 rounded"
        >
          ログイン
        </button>
      )}
    </main>
  );
}