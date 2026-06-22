import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin } from '@/lib/adminServer';
import { linkLineRichMenu } from '@/lib/line';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { lineUserId?: string; memberStatus?: string };
const statuses = ['guest', 'member'];

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data, error } = await db.from('line_users').select('line_user_id,display_name,member_status,created_at,updated_at').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ ok: false, message: `LINEユーザー一覧の取得に失敗しました: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, lineUsers: data ?? [], statuses });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  const body = await request.json().catch(() => ({})) as Body;
  const lineUserId = body.lineUserId?.trim();
  const memberStatus = body.memberStatus?.trim() || 'guest';
  if (!lineUserId) return NextResponse.json({ ok: false, message: 'lineUserId が不正です。' }, { status: 400 });
  if (!statuses.includes(memberStatus)) return NextResponse.json({ ok: false, message: 'member_status が不正です。' }, { status: 400 });

  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data, error } = await db.from('line_users').update({ member_status: memberStatus, updated_at: new Date().toISOString() }).eq('line_user_id', lineUserId).select('line_user_id,display_name,member_status,created_at,updated_at').single();
  if (error) return NextResponse.json({ ok: false, message: `LINEユーザーの更新に失敗しました: ${error.message}` }, { status: 400 });

  const richMenuId = memberStatus === 'member' ? process.env.LINE_MEMBER_RICH_MENU_ID : process.env.LINE_GUEST_RICH_MENU_ID;
  const richMenu = await linkLineRichMenu(lineUserId, richMenuId, process.env.LINE_CHANNEL_ACCESS_TOKEN);
  return NextResponse.json({ ok: true, lineUser: data, richMenu });
}
