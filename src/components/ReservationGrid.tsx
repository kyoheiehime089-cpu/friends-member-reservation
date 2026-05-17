import { ReservationCell } from '@/components/ReservationCell';
import { CalendarDayHeader } from '@/components/CalendarDayHeader';

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
  isBlockedBySameDayBooking?: boolean;
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
  dense?: boolean;
};

export function ReservationGrid({ slots, submittingSlotId, onReserve, dates: providedDates, timeLabels, dense = false }: ReservationGridProps) {
  const dates = (providedDates && providedDates.length > 0
    ? providedDates
    : Array.from(new Map(slots.map((slot) => [slot.dateKey, slot])).values()))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const times = (timeLabels && timeLabels.length > 0 ? timeLabels : Array.from(new Set(slots.map((slot) => slot.timeLabel))))
    .sort((a, b) => a.localeCompare(b));
  const slotMap = new Map(slots.map((slot) => [`${slot.dateKey}-${slot.timeLabel}`, slot]));

  if (dates.length === 0 || times.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-sm font-bold text-gray-600">
        表示できる予約枠がありません。
      </div>
    );
  }

  const timeColumn = dense ? '44px' : '62px';
  const minDateColumn = dense ? (dates.length > 3 ? '54px' : '84px') : '104px';
  const gap = dense ? '4px' : '8px';

  return (
    <div className="w-full overflow-x-auto pb-1">
      <div className={`${dense ? 'rounded-2xl p-1.5' : 'rounded-3xl p-2 sm:p-3'} min-w-full border border-gray-200 bg-white shadow-sm`}>
        <div className="grid" style={{ gap, gridTemplateColumns: `${timeColumn} repeat(${dates.length}, minmax(${minDateColumn}, 1fr))` }}>
          <div className={`${dense ? 'rounded-lg p-1 text-[11px]' : 'rounded-xl p-2 text-xs'} sticky left-0 z-20 bg-white text-center font-black text-gray-500 shadow-sm`}>時間</div>
          {dates.map((date) => <CalendarDayHeader key={date.dateKey} dateKey={date.dateKey} dateLabel={date.dateLabel} weekdayLabel={date.weekdayLabel} dense={dense} />)}
          {times.map((time) => (
            <div key={time} className="contents">
              <div className={`${dense ? 'min-h-[44px] rounded-lg p-1 text-[11px]' : 'min-h-[68px] rounded-xl p-2 text-xs'} sticky left-0 z-10 flex items-center justify-center bg-white text-center font-black text-gray-950 shadow-sm ring-1 ring-gray-100`}>{time}</div>
              {dates.map((date) => {
                const slot = slotMap.get(`${date.dateKey}-${time}`) ?? null;
                return <ReservationCell key={`${date.dateKey}-${time}`} slot={slot} dense={dense} isSubmitting={Boolean(slot && submittingSlotId === slot.id)} onReserve={onReserve} />;
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
