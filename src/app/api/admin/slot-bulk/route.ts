import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  menuId?: string;
  capacity?: number;
  isOpen?: boolean;
  days?: number;
};

function normalizeCapacity(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 1 || numberValue > 99) return null;
  return Math.floor(numberValue);
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  }

  const body = await request.json().catch(() => ({})) as Body;
  const menuId = body.menuId?.trim();
  const capacity = normalizeCapacity(body.capacity);
  const days = Number.isFinite(Number(body.days)) ? Math.min(Math.max(Number(body.days), 1), 180) : 60;

  if (!menuId || !uuidPattern.test(menuId)) {
    return NextResponse.json({ ok: false, message: 'メニューを選択してください。' }, { status: 400 });
  }
  if (!capacity) {
    return NextResponse.json({ ok: false, message: '定員は1〜99名で入力してください。' }, { status: 400 });
  }
  if (typeof body.isOpen !== 'boolean') {
    return NextResponse.json({ ok: false, message: '受付状態を選択してください。' }, { status: 400 });
  }

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const { data, error } = await serviceClient
    .from('reservation_slots')
    .update({ capacity, is_open: body.isOpen })
    .eq('menu_id', menuId)
    .gte('starts_at', start.toISOString())
    .lte('starts_at', end.toISOString())
    .select('id');

  if (error) {
    return NextResponse.json({ ok: false, message: `一括変更に失敗しました: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, count: data?.length ?? 0, message: `${data?.length ?? 0}件の予約枠を一括変更しました。` });
}
