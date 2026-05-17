const TZ = 'Asia/Tokyo';

export function getMemberStatusBase(status?: string | null) {
  if (status?.startsWith('休止予定:')) return '休止予定';
  return status || '有効';
}

export function getPauseStartDate(status?: string | null) {
  if (!status?.startsWith('休止予定:')) return null;
  const value = status.replace('休止予定:', '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function canMemberBookByStatus(status?: string | null, now = new Date()) {
  if (!status || status === '有効') return true;
  const pauseStart = getPauseStartDate(status);
  if (pauseStart) return now < pauseStart;
  if (status === '休止予定') return true;
  return false;
}

export function getMemberStatusLabel(status?: string | null) {
  const pauseStart = getPauseStartDate(status);
  if (pauseStart) {
    const label = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', timeZone: TZ }).format(pauseStart);
    return `休止予定（${label}〜）`;
  }
  return status || '有効';
}
