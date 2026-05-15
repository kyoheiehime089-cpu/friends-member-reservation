import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const mailProvider = process.env.MAIL_PROVIDER?.trim() || 'resend';
  const mailApiKey = process.env.MAIL_API_KEY?.trim() ?? '';
  const mailFromFriends = process.env.MAIL_FROM_FRIENDS?.trim() ?? '';
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL?.trim() ?? '';

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(supabaseUrl),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(anonKey),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceKey),
    MAIL_PROVIDER: mailProvider,
    MAIL_API_KEY: Boolean(mailApiKey),
    MAIL_FROM_FRIENDS: Boolean(mailFromFriends),
    ADMIN_NOTIFICATION_EMAIL: Boolean(adminEmail)
  };

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ ok: false, env, database: { ok: false, message: 'Supabase public environment variables are missing.' } }, { status: 500 });
  }

  const client = createClient(supabaseUrl, serviceKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const requiredTables = ['stores', 'plans', 'members', 'menus', 'reservation_slots', 'reservations', 'mail_logs', 'admin_users'];
  const tableChecks = await Promise.all(requiredTables.map(async (table) => {
    const { error } = await client.from(table).select('*', { count: 'exact', head: true });
    return { table, ok: !error, message: error?.message ?? null };
  }));

  const databaseOk = tableChecks.every((check) => check.ok);

  return NextResponse.json({
    ok: databaseOk,
    env,
    database: {
      ok: databaseOk,
      tables: tableChecks
    },
    note: 'This endpoint reports presence only. It never returns secret values.'
  }, { status: databaseOk ? 200 : 500 });
}
