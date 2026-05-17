import { getCalendarDayLabel, getCalendarDayTone } from '@/lib/jpHolidays';

type Props = {
  dateKey: string;
  dateLabel: string;
  weekdayLabel: string;
  dense?: boolean;
};

function toneClass(dateKey: string) {
  const tone = getCalendarDayTone(dateKey);
  if (tone === 'holiday') return 'bg-red-50 text-red-800 ring-1 ring-red-100';
  if (tone === 'saturday') return 'bg-blue-50 text-blue-800 ring-1 ring-blue-100';
  return 'bg-yellow-100 text-gray-950';
}

export function CalendarDayHeader({ dateKey, dateLabel, weekdayLabel, dense = false }: Props) {
  const label = getCalendarDayLabel(dateKey);
  return (
    <div className={`${dense ? 'rounded-lg p-1' : 'rounded-xl p-2'} text-center shadow-sm ${toneClass(dateKey)}`}>
      <p className={`${dense ? 'text-[11px]' : 'text-sm'} font-black`}>{dateLabel}</p>
      <p className={`${dense ? 'text-[10px]' : 'text-xs'} font-bold`}>{weekdayLabel}</p>
      {label && <p className={`${dense ? 'text-[9px]' : 'text-[11px]'} truncate font-black`}>{label}</p>}
    </div>
  );
}
