import { NextResponse } from 'next/server';
import { createServiceClient, getAdminConfig } from '@/lib/adminServer';
import { fetchLineProfile, verifyLineSignature } from '@/lib/line';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LineWebhookEvent = {
  type?: string;
  source?: { type?: string; userId?: string };
};

type LineWebhookBody = { events?: LineWebhookEvent[] };

async function saveLineUser(lineUserId: string, displayName: string | null) {
  const config = getAdminConfig();
  if (!config) throw new Error('Supabase環境変数が未設定です。');
  const db = createServiceClient(config.supabaseUrl, config.serviceKey);
  const { data: existing, error: selectError } = await db.from('line_users').select('member_status').eq('line_user_id', lineUserId).maybeSingle();
  if (selectError) throw new Error(selectError.message);
  const now = new Date().toISOString();
  const payload: { line_user_id: string; display_name: string | null; member_status?: string; updated_at: string } = existing
    ? { line_user_id: lineUserId, display_name: displayName, updated_at: now }
    : { line_user_id: lineUserId, display_name: displayName, member_status: 'guest', updated_at: now };
  const { error } = await db.from('line_users').upsert(payload, { onConflict: 'line_user_id' });
  if (error) throw new Error(error.message);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyLineSignature(rawBody, request.headers.get('x-line-signature'), process.env.LINE_CHANNEL_SECRET)) {
    return NextResponse.json({ ok: false, message: 'LINE署名の検証に失敗しました。' }, { status: 401 });
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody || '{}') as LineWebhookBody;
  } catch {
    return NextResponse.json({ ok: false, message: 'Webhook body がJSONではありません。' }, { status: 400 });
  }
  const events = body.events ?? [];
  const results = await Promise.all(events.map(async (event) => {
    const lineUserId = event.source?.userId;
    if (!lineUserId) return { ok: true, skipped: true };
    const profile = await fetchLineProfile(lineUserId, process.env.LINE_CHANNEL_ACCESS_TOKEN);
    await saveLineUser(lineUserId, profile?.displayName ?? null);
    return { ok: true, lineUserId };
  }));

  return NextResponse.json({ ok: true, results });
}
