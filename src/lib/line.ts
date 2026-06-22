import crypto from 'crypto';

export type LineProfile = {
  userId: string;
  displayName?: string;
};

export function verifyLineSignature(body: string, signature: string | null, channelSecret?: string | null) {
  const secret = channelSecret?.trim();
  if (!secret || !signature) return false;
  const digest = crypto.createHmac('sha256', secret).update(body).digest('base64');
  const expected = Buffer.from(digest);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export async function fetchLineProfile(userId: string, accessToken?: string | null): Promise<LineProfile | null> {
  const token = accessToken?.trim();
  if (!token) return null;
  const response = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null) as LineProfile | null;
  return data?.userId ? data : null;
}

export async function linkLineRichMenu(userId: string, richMenuId?: string | null, accessToken?: string | null) {
  const token = accessToken?.trim();
  const menuId = richMenuId?.trim();
  if (!token || !menuId) return { ok: false, skipped: true, message: 'LINE rich menu env is not configured.' };
  const response = await fetch(`https://api.line.me/v2/bot/user/${encodeURIComponent(userId)}/richmenu/${encodeURIComponent(menuId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!response.ok) return { ok: false, skipped: false, message: await response.text().catch(() => 'LINE rich menu switch failed.') };
  return { ok: true, skipped: false, message: 'OK' };
}
