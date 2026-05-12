type MailPayload = {
  to: string;
  subject: string;
  body: string;
  from?: string;
};

export async function sendMail(payload: MailPayload) {
  if (!process.env.MAIL_API_KEY) {
    return {
      ok: false,
      skipped: true,
      message: 'MAIL_API_KEY が未設定のため、実メール送信はスキップしました。',
      payload
    };
  }

  // TODO: SendGrid / Resend などのメールAPIに接続する。
  return {
    ok: false,
    skipped: true,
    message: 'メールAPI接続処理はローンチ前に実装してください。',
    payload
  };
}
