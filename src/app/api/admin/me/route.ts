import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  }
  return NextResponse.json({ ok: true, adminId: admin.adminId });
}
