export function isSemipersonalName(name?: string | null) {
  const value = (name ?? '').replace(/\s+/g, '');
  return value.includes('セミパーソナル') || value.includes('セミパ');
}

export function effectiveCapacity(menuName: string | null | undefined, rawCapacity: number | null | undefined) {
  if (isSemipersonalName(menuName)) return 5;
  const n = Number(rawCapacity ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function effectiveDefaultCapacity(menuName: string | null | undefined, rawCapacity: number | null | undefined) {
  if (isSemipersonalName(menuName)) return 5;
  const n = Number(rawCapacity ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}
