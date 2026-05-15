import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckResult = {
  name: string;
  ok: boolean;
  message: string | null;
};

async function checkSelect(client: SupabaseClient, name: string, table: string, columns: string): Promise<CheckResult> {
  const { error } = await client.from(table).select(columns).limit(1);
  return { name, ok: !error, message: error?.message ?? null };
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({
      ok: false,
      message: 'Supabase public environment variables are missing.',
      env: {
        NEXT_PUBLIC_SUPABASE_URL: Boolean(supabaseUrl),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(anonKey),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceKey)
      }
    }, { status: 500 });
  }

  const client = createClient(supabaseUrl, serviceKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const checks: CheckResult[] = [];
  checks.push(await checkSelect(client, 'stores table', 'stores', 'id,name,created_at'));
  checks.push(await checkSelect(client, 'plans table', 'plans', 'id,name,weekly_limit,unlimited,is_active,created_at'));
  checks.push(await checkSelect(client, 'members table', 'members', 'id,store_id,plan_id,full_name,email,status,created_at,updated_at'));
  checks.push(await checkSelect(client, 'menus table', 'menus', 'id,store_id,name,description,default_capacity,is_active,created_at'));
  checks.push(await checkSelect(client, 'reservation_slots table', 'reservation_slots', 'id,store_id,menu_id,starts_at,ends_at,capacity,is_open,created_at'));
  checks.push(await checkSelect(client, 'reservations table', 'reservations', 'id,reservation_slot_id,member_id,status,created_by,created_at,cancelled_at,cancelled_by'));
  checks.push(await checkSelect(client, 'mail_logs table', 'mail_logs', 'id,reservation_id,to_email,subject,status,provider_response,created_at'));
  checks.push(await checkSelect(client, 'admin_users table', 'admin_users', 'id,email,role,created_at'));

  const { error: countError } = await client.rpc('get_slot_booking_counts', { slot_ids: [] });
  checks.push({ name: 'get_slot_booking_counts rpc', ok: !countError, message: countError?.message ?? null });

  const ok = checks.every((check) => check.ok);

  return NextResponse.json({
    ok,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(supabaseUrl),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(anonKey),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceKey),
      MAIL_PROVIDER: process.env.MAIL_PROVIDER?.trim() || 'resend',
      MAIL_API_KEY: Boolean(process.env.MAIL_API_KEY?.trim()),
      MAIL_FROM_FRIENDS: Boolean(process.env.MAIL_FROM_FRIENDS?.trim()),
      ADMIN_NOTIFICATION_EMAIL: Boolean(process.env.ADMIN_NOTIFICATION_EMAIL?.trim())
    },
    checks,
    note: 'This endpoint checks schema and configuration presence only. It does not return secret values.'
  }, { status: ok ? 200 : 500 });
}
