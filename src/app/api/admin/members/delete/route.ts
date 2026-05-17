import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  }

  const body = await request.json().catch(() => ({})) as { memberId?: string };
  const memberId = body.memberId?.trim();
  if (!memberId || !uuidPattern.test(memberId)) {
    return NextResponse.json({ ok: false, message: 'memberId が不正です。' }, { status: 400 });
  }

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { error } = await serviceClient.from('members').delete().eq('id', memberId);
  if (error) {
    return NextResponse.json({ ok: false, message: `会員削除に失敗しました: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: '会員を削除しました。' });
}
