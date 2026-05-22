export type ReservationStateRow = {
  id: string;
  reservation_slot_id: string | null;
  member_id: string | null;
  status: string | null;
  created_at: string | null;
};

export function reservationStateKey(slotId?: string | null, memberId?: string | null) {
  if (!slotId || !memberId) return '';
  return `${slotId}:${memberId}`;
}

function timeValue(value?: string | null) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function isNewer(a: ReservationStateRow, b: ReservationStateRow) {
  const at = timeValue(a.created_at);
  const bt = timeValue(b.created_at);
  if (at !== bt) return at > bt;
  return String(a.id) > String(b.id);
}

export function latestReservationsBySlotMember(rows: ReservationStateRow[]) {
  const latest = new Map<string, ReservationStateRow>();
  for (const row of rows) {
    const key = reservationStateKey(row.reservation_slot_id, row.member_id);
    if (!key) continue;
    const current = latest.get(key);
    if (!current || isNewer(row, current)) latest.set(key, row);
  }
  return latest;
}

export function effectiveBookedReservations(rows: ReservationStateRow[]) {
  return Array.from(latestReservationsBySlotMember(rows).values()).filter((row) => row.status === 'booked');
}

export function effectiveBookedForMember(rows: ReservationStateRow[], memberId: string) {
  return rows.filter((row) => row.member_id === memberId && row.status === 'booked');
}

export function effectiveBookedCountForSlot(rows: ReservationStateRow[], slotId: string) {
  return rows.filter((row) => row.reservation_slot_id === slotId && row.status === 'booked').length;
}

export function effectiveStatusFor(rows: ReservationStateRow[], slotId?: string | null, memberId?: string | null) {
  const key = reservationStateKey(slotId, memberId);
  if (!key) return null;
  return latestReservationsBySlotMember(rows).get(key)?.status ?? null;
}
