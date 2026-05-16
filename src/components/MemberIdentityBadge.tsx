"use client";

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';

export function MemberIdentityBadge() {
  const [label, setLabel] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      const client = getSupabaseClient();
      if (!client) return;
      const { data: userData } = await client.auth.getUser();
      const user = userData.user;
      if (!user) return;

      const fallback = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email || '会員');
      const { data } = await client.from('members').select('full_name,email').eq('id', user.id).maybeSingle();
      const name = data?.full_name || fallback;
      if (mounted) setLabel(`${name}様でログイン中`);
    }
    void load();
    return () => { mounted = false; };
  }, []);

  if (!label) return null;
  return <p className="truncate rounded-full bg-yellow-100 px-3 py-1 text-[11px] font-black text-yellow-900 sm:text-xs">{label}</p>;
}
