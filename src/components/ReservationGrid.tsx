import { ReservationCell } from '@/components/ReservationCell';

export type ReservationGridSlot = {
  id: string;
  dateKey: string;
  dateLabel: string;
  weekdayLabel: string;
  timeLabel: string;
  capacity: number;
  bookedCount: number;
  remainingSeats: number;
  isOpen: boolean;
  isPast: boolean;
  isBookedByCurrentUser: boolean;
};

export type ReservationGridDate = {
  dateKey: string;
  dateLabel: string;
  weekdayLabel: string;
};

type ReservationGridProps = {
  slots: ReservationGridSlot[];
  submittingSlotId: string | null;
  onReserve: (slotId: string) => void;
  dates?: ReservationGridDate[];
  timeLabels?: string[];
};

export function ReservationGrid({ slots, submittingSlotId, onReserve, dates: providedDates, timeLabels }: ReservationGridProps) {
  const dates = (providedDates && providedDates.length > 0
    ? providedDates
    : Array.from(new Map(slots.map((slot) => [slot.dateKey, slot])).values()))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const times = (timeLabels && timeLabels.length > 0 ? timeLabels : Array.from(new Set(slots.map((slot) => slot.timeLabel))))
    .sort((a, b) => a.localeCompare(b));
  const slotMap = new Map(slots.map((slot) => [`${slot.dateKey}-${slot.timeLabel}`, slot]));

  if (dates.length === 0 || times.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center font-bold text-gray-600">
        表示できる予約枠がありません。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-max rounded-3xl border border-gray-200 bg-white p-2 shadow-sm sm:p-3">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `80px repeat(${dates.length}, minmax(124px, 1fr))` }}
        >
          <div className="sticky left-0 z-20 rounded-2xl bg-white p-3 text-center text-sm font-black text-gray-500 shadow-sm">
            時間
          </div>
          {dates.map((date) => (
            <div key={date.dateKey} className="rounded-2xl bg-yellow-100 p-3 text-center shadow-sm">
              <p className="text-sm font-black text-gray-950">{date.dateLabel}</p>
              <p className="text-xs font-bold text-yellow-800">{date.weekdayLabel}</p>
            </div>
          ))}

          {times.map((time) => (
            <div key={time} className="contents">
              <div className="sticky left-0 z-10 flex min-h-[92px] items-center justify-center rounded-2xl bg-white p-2 text-center text-sm font-black text-gray-950 shadow-sm ring-1 ring-gray-100">
                {time}
              </div>
              {dates.map((date) => {
                const slot = slotMap.get(`${date.dateKey}-${time}`) ?? null;
                return (
                  <ReservationCell
                    key={`${date.dateKey}-${time}`}
                    slot={slot}
                    isSubmitting={Boolean(slot && submittingSlotId === slot.id)}
                    onReserve={onReserve}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
