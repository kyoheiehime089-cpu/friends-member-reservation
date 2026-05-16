export function createInitialLoginCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const values = new Uint32Array(10);
  crypto.getRandomValues(values);
  return Array.from(values).map((value) => chars[value % chars.length]).join('');
}

export async function sendMemberLoginGuide(params: { to: string; fullName: string; loginCode: string }) {
  const apiKey = process.env.MAIL_API_KEY?.trim();
  const from = process.env.MAIL_FROM_FRIENDS?.trim() || 'onboarding@resend.dev';
  if (!apiKey) return { ok: false, message: 'MAIL_API_KEY が未設定です。' };

  const reservationUrl = 'https://friends-member-reservation.vercel.app';
  const text = `${params.fullName} 様

friends予約システムのアカウントを作成しました。
下記URLからログインしてご予約ください。

【予約サイト】
${reservationUrl}

【ログイン用メールアドレス】
${params.to}

【初期ログインコード】
${params.loginCode}

ログイン後、予約したいメニューを選んで空き枠からご予約ください。

friends`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: '【friends】予約システム ログイン情報のお知らせ',
      text
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { ok: false, message: detail || `メール送信に失敗しました。status=${response.status}` };
  }

  return { ok: true, message: 'ログイン案内メールを送信しました。' };
}
