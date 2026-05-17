import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  memberId?: string;
  planId?: string | null;
  status?: string;
  pauseMonth?: string;
};

const validStatuses = ['有効', '休止予定', '休止中', '停止中'];

function nextMonthValue() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

function toStoredStatus(status: string, pauseMonth?: string) {
  if (status !== '休止予定') return status;
  if (!pauseMonth || !/^\d{4}-\d{2}$/.test(pauseMonth)) throw new Error('休止予定月を選択してください。');
  if (pauseMonth < nextMonthValue()) throw new Error('休止予定月は翌月以降を選択してください。');
  return `休止予定:${pauseMonth}-01`;
}

async function assertPlanExists(serviceClient: ReturnType<typeof createServiceClient>, planId: string | null) {
  if (!planId) return;
  if (!uuidPattern.test(planId)) throw new Error('planId が不正です。');
  const { data: plan, error } = await serviceClient.from('plans').select('id').eq('id', planId).maybeSingle();
  if (error) throw new Error(`プラン確認に失敗しました: ${error.message}`);
  if (!plan) throw new Error('指定されたプランが見つかりません。');
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  }

  const body = await request.json().catch(() => ({})) as Body;
  const memberId = body.memberId?.trim();
  const planId = typeof body.planId === 'string' && body.planId.trim() ? body.planId.trim() : null;
  const status = body.status?.trim() || '有効';

  if (!memberId || !uuidPattern.test(memberId)) {
    return NextResponse.json({ ok: false, message: 'memberId が不正です。' }, { status: 400 });
  }
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ ok: false, message: '状態が不正です。' }, { status: 400 });
  }

  let storedStatus = status;
  try {
    storedStatus = toStoredStatus(status, body.pauseMonth);
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : '休止予定月が不正です。' }, { status: 400 });
  }

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  try {
    await assertPlanExists(serviceClient, planId);
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'プラン確認に失敗しました。' }, { status: 400 });
  }

  const { data, error } = await serviceClient
    .from('members')
    .update({ plan_id: planId, status: storedStatus, updated_at: new Date().toISOString() })
    .eq('id', memberId)
    .select('id,full_name,email,status,plan_id,created_at,updated_at')
    .single();

  if (error) {
    return NextResponse.json({ ok: false, message: `会員情報の更新に失敗しました: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, member: data });
}
