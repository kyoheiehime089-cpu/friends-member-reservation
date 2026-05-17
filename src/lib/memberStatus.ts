const TZ = 'Asia/Tokyo';

export const ACTIVE_MEMBER_STATUS = '有効';
export const PAUSE_SCHEDULED_STATUS = '休止予定';
export const PAUSED_MEMBER_STATUS = '休止中';
export const ACTIVE_MEMBER_STATUSES = [ACTIVE_MEMBER_STATUS, PAUSE_SCHEDULED_STATUS, PAUSED_MEMBER_STATUS] as const;

export function normalizeMemberStatus(status?: string | null) {
  if (!status) return ACTIVE_MEMBER_STATUS;
  if (status.startsWith('休止予定:')) return status;
  if (status === '休会中') return PAUSED_MEMBER_STATUS;
  if (status === PAUSE_SCHEDULED_STATUS || status === PAUSED_MEMBER_STATUS || status === ACTIVE_MEMBER_STATUS) return status;

  // 以前の画面にあった「停止中」「未払い」「退会予定」などは現在の運用では使わないため、
  // 予約を止めないように有効扱いへ寄せる。休止したい場合だけ「休止中」を使う。
  return ACTIVE_MEMBER_STATUS;
}

export function getMemberStatusBase(status?: string | null) {
  const normalized = normalizeMemberStatus(status);
  if (normalized.startsWith('休止予定:')) return PAUSE_SCHEDULED_STATUS;
  return normalized;
}

export function getPauseStartDate(status?: string | null) {
  const normalized = normalizeMemberStatus(status);
  if (!normalized.startsWith('休止予定:')) return null;
  const value = normalized.replace('休止予定:', '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function canMemberBookByStatus(status?: string | null, now = new Date()) {
  const normalized = normalizeMemberStatus(status);
  if (normalized === ACTIVE_MEMBER_STATUS) return true;
  const pauseStart = getPauseStartDate(normalized);
  if (pauseStart) return now < pauseStart;
  if (normalized === PAUSE_SCHEDULED_STATUS) return true;
  return false;
}

export function getMemberStatusLabel(status?: string | null) {
  const normalized = normalizeMemberStatus(status);
  const pauseStart = getPauseStartDate(normalized);
  if (pauseStart) {
    const label = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', timeZone: TZ }).format(pauseStart);
    return `休止予定（${label}〜）`;
  }
  return normalized;
}
