import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin, uuidPattern } from '@/lib/adminServer';
import { createInitialLoginCode } from '@/lib/memberInviteMail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { memberId?: string };

type Member = { id: string; full_name: string | null; email: string | null };

function buildLineMessage(member: Member, loginCode: string) {
  const name = member.full_name || '会員';
  const email = member.email || '';
  return `${name}様

予約システムのログイン情報です。

【ログインID】
${email}

【パスワード】
${loginCode}

LINEのリッチメニューから予約画面を開き、上記のログインIDとパスワードでログインしてください。`;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  }

  const body = await request.json().catch(() => ({})) as Body;
  const memberId = body.memberId?.trim();
  if (!memberId || !uuidPattern.test(memberId)) {
    return NextResponse.json({ ok: false, message: 'memberId が不正です。' }, { status: 400 });
  }

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data: member, error: memberError } = await serviceClient
    .from('members')
    .select('id,full_name,email')
    .eq('id', memberId)
    .single();

  if (memberError || !member?.email) {
    return NextResponse.json({ ok: false, message: `会員情報の取得に失敗しました: ${memberError?.message ?? 'メールアドレスがありません。'}` }, { status: 400 });
  }

  const loginCode = createInitialLoginCode(String(member.email));
  const { error: authError } = await serviceClient.auth.admin.updateUserById(member.id, {
    password: loginCode,
    email_confirm: true,
    user_metadata: { full_name: member.full_name, name: member.full_name }
  });

  if (authError) {
    return NextResponse.json({ ok: false, message: `ログイン情報の更新に失敗しました: ${authError.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, loginId: member.email, loginCode, lineMessage: buildLineMessage(member as Member, loginCode) });
}
