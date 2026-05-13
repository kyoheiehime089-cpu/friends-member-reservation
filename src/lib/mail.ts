type MailPayload = {
  to: string;
  subject: string;
  body: string;
  from?: string;
};

type MailResult = {
  ok: boolean;
  skipped: boolean;
  message: string;
  payload: MailPayload;
  provider?: string;
  providerResponse?: unknown;
};

export async function sendMail(payload: MailPayload): Promise<MailResult> {
  const apiKey = process.env.MAIL_API_KEY?.trim();
  const provider = process.env.MAIL_PROVIDER?.trim().toLowerCase() || 'resend';
  const from = payload.from || process.env.MAIL_FROM_FRIENDS || process.env.MAIL_FROM_YOGA || '';

  if (!apiKey) {
    return {
      ok: false,
      skipped: true,
      message: 'MAIL_API_KEY が未設定のため、実メール送信はスキップしました。',
      payload: { ...payload, from },
      provider
    };
  }

  if (!from) {
    return {
      ok: false,
      skipped: true,
      message: '送信元メールアドレスが未設定のため、実メール送信はスキップしました。',
      payload,
      provider
    };
  }

  if (provider !== 'resend') {
    return {
      ok: false,
      skipped: true,
      message: `未対応のメールプロバイダです: ${provider}`,
      payload: { ...payload, from },
      provider
    };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject: payload.subject,
        text: payload.body
      })
    });

    const providerResponse = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        message: 'メールAPIで送信エラーが発生しました。',
        payload: { ...payload, from },
        provider,
        providerResponse
      };
    }

    return {
      ok: true,
      skipped: false,
      message: 'メールを送信しました。',
      payload: { ...payload, from },
      provider,
      providerResponse
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      message: error instanceof Error ? error.message : 'メール送信中に不明なエラーが発生しました。',
      payload: { ...payload, from },
      provider
    };
  }
}
