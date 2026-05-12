import { isSupabaseConfigured, supabaseSetupMessage } from '@/lib/supabaseClient';

export function SupabaseNotice() {
  if (isSupabaseConfigured) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
      <p className="font-bold">Supabase環境変数を設定してください</p>
      <p className="mt-1">{supabaseSetupMessage}</p>
    </div>
  );
}
