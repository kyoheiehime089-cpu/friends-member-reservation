import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type CancelRequestBody = {
  reservationId?: string;
};

type ReservationRow = {
  id: string;
  member_id: string | null;
  status: string | null;
  reservation_slot_id: string | null;
};

type SlotRow = {
  id: string;
  starts_at: string | null;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const gridTimeZone = 'Asia/Tokyo';
const jstDatePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: gridTimeZone
});

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!supabaseUrl || !anonKey) return null;
  return { supabaseUrl, anonKey, serviceKey };
}

function userClient(supabaseUrl: string, anonKey: string, token: string) {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function dbClient(supabaseUrl: string, anonKey: string, serviceKey: string, token: string): SupabaseClient {
  if (serviceKey) {
    return createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return userClient(supabaseUrl, anonKey, token);
}

function getPreviousDay22JstDeadline(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = jstDatePartsFormatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '0');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '0');
  return new Date(Date.UTC(year, month - 1, day - 1, 13, 0, 0, 0));
}

function hasPassedPreviousDay22Deadline(value: Date | string) {
  return new Date() >= getPreviousDay22JstDeadline(value);
}

export async function POST(request: Request) {
  const config = getConfig();
  if (!config) {
    return NextResponse.json({ ok: false, message: 'Supabase環境変数が未設定です。' }, { status: 500 });
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) {
    return NextResponse.json({ ok: false, message: 'ログイン情報が確認できません。' }, { status: 401 });
  }

  const authClient = userClient(config.supabaseUrl, config.anonKey, token);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ ok: false, message: 'ログイン情報を確認できません。' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as CancelRequestBody;
  const reservationId = body.reservationId?.trim();
  if (!reservationId) {
    return NextResponse.json({ ok: false, message: 'reservationId がありません。' }, { status: 400 });
  }

  const client = dbClient(config.supabaseUrl, config.anonKey, config.serviceKey, token);
  const { data: reservationData, error: reservationError } = await client
    .from('reservations')
    .select('id,member_id,status,reservation_slot_id')
    .eq('id', reservationId)
    .maybeSingle();

  if (reservationError || !reservationData) {
    return NextResponse.json({ ok: false, message: '予約情報が見つかりません。' }, { status: 404 });
  }

  const reservation = reservationData as ReservationRow;
  if (reservation.member_id !== userData.user.id) {
    return NextResponse.json({ ok: false, message: 'この予約はキャンセルできません。' }, { status: 403 });
  }

  if (reservation.status === 'cancelled') {
    return NextResponse.json({ ok: true, message: 'すでにキャンセル済みです。' });
  }

  if (reservation.reservation_slot_id) {
    const { data: slotData, error: slotError } = await client
      .from('reservation_slots')
      .select('id,starts_at')
      .eq('id', reservation.reservation_slot_id)
      .maybeSingle();

    if (slotError) {
      return NextResponse.json({ ok: false, message: `予約枠情報の確認に失敗しました: ${slotError.message}` }, { status: 400 });
    }

    const slot = slotData as SlotRow | null;
    if (slot?.starts_at && hasPassedPreviousDay22Deadline(slot.starts_at)) {
      return NextResponse.json({ ok: false, message: 'キャンセル受付は終了しました。キャンセルは前日22:00までです。' }, { status: 400 });
    }
  }

  const { error: updateError } = await client
    .from('reservations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: userData.user.id
    })
    .eq('id', reservationId)
    .eq('member_id', userData.user.id);

  if (updateError) {
    return NextResponse.json({ ok: false, message: `キャンセル処理に失敗しました: ${updateError.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: 'キャンセルしました。' });
}
