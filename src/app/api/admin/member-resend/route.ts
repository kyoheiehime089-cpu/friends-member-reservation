import { NextResponse } from 'next/server';
import { createServiceClient, requireAdmin } from '@/lib/adminServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ResendBody = { email?: string };

async function sendResetMail(params: { to: string; link: string }) {
  const apiKey = process.env.MAIL_API_KEY?.trim();
  const from = process.env.MAIL_FROM_FRIENDS?.trim() || 'onboarding@resend.dev';
  if (!apiKey) return { ok: false, message: 'MAIL_API_KEY が未設定です。' };

  const text = `friends予約システムのログイン再設定メールです。

下記リンクから新しいログイン情報を設定してください。

${params.link}

リンクの有効期限が切れた場合は、スタッフへ再送をご依頼ください。

friends`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: '【friends】予約システム ログイン再設定のお知らせ',
      text
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { ok: false, message: detail || `メール送信に失敗しました。status=${response.status}` };
  }
  return { ok: true, message: 'ログイン再設定メールを送信しました。' };
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok || !admin.config) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status });
  }

  const body = await request.json().catch(() => ({})) as ResendBody;
  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ ok: false, message: 'メールアドレスを正しく入力してください。' }, { status: 400 });
  }

  const serviceClient = createServiceClient(admin.config.supabaseUrl, admin.config.serviceKey);
  const { data: member, error: memberError } = await serviceClient.from('members').select('id,email').eq('email', email).maybeSingle();
  if (memberError) {
    return NextResponse.json({ ok: false, message: `会員確認に失敗しました: ${memberError.message}` }, { status: 400 });
  }
  if (!member) {
    return NextResponse.json({ ok: false, message: 'このメールアドレスの会員は見つかりません。' }, { status: 404 });
  }

  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: 'https://friends-member-reservation.vercel.app/login' }
  });

  if (error || !data.properties?.action_link) {
    return NextResponse.json({ ok: false, message: `再設定リンクの作成に失敗しました: ${error?.message ?? 'link not created'}` }, { status: 400 });
  }

  const mail = await sendResetMail({ to: email, link: data.properties.action_link });
  return NextResponse.json({ ok: true, mail });
}
