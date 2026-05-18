import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';
import { ensurePlanForSelection } from '@/lib/planBundles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  memberId?: string;
  planIds?: string[];
  status?: string | null;
};

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  }

  const body = await request.json().catch(() => ({})) as Body;
  const memberId = body.memberId?.trim();
  if (!memberId || !uuidPattern.test(memberId)) {
    return NextResponse.json({ ok: false, message: '会員IDが不正です。' }, { status: 400 });
  }

  const planIds = Array.isArray(body.planIds)
    ? Array.from(new Set(body.planIds.filter((id) => typeof id === 'string' && uuidPattern.test(id))))
    : [];

  const db = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);

  try {
    const planId = await ensurePlanForSelection(db, planIds);
    const updatePayload: { plan_id: string | null; updated_at: string; status?: string } = {
      plan_id: planId,
      updated_at: new Date().toISOString()
    };
    if (body.status) updatePayload.status = body.status;

    const { data, error } = await db
      .from('members')
      .update(updatePayload)
      .eq('id', memberId)
      .select('id,full_name,email,status,plan_id,created_at,updated_at')
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, member: data, planId, message: 'プランを保存しました。' });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'プラン保存に失敗しました。' }, { status: 400 });
  }
}
