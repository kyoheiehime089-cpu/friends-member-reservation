"use client";

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('アカウント');
  const [active, setActive] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const client = getSupabaseClient();
      if (!client) return;
      const { data } = await client.auth.getUser();
      const user = data.user;
      if (!mounted || !user) return;
      setLabel(String(user.user_metadata?.full_name || user.user_metadata?.name || user.email || '会員'));
      setActive(true);
    }
    void load();
    return () => { mounted = false; };
  }, []);

  async function endSession() {
    const client = getSupabaseClient();
    if (client) await client.auth.signOut();
    window.location.href = '/login';
  }

  if (!active) return null;
  return <div className="relative"><button type="button" onClick={() => setOpen((v) => !v)} className="rounded-full bg-yellow-100 px-3 py-1 text-[11px] font-black text-yellow-900 sm:text-xs">{label} ▾</button>{open && <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 text-sm shadow-lg"><p className="px-3 py-2 text-xs font-bold text-gray-500">ログイン中</p><p className="truncate px-3 pb-2 font-black text-gray-900">{label}</p><button type="button" onClick={() => void endSession()} className="w-full rounded-xl border border-red-200 px-3 py-2 text-left font-black text-red-600 hover:bg-red-50">ログアウトする</button></div>}</div>;
}
