import type { ReservationGridSlot } from '@/components/ReservationGrid';

type ReservationCellStatus = 'available' | 'booked' | 'sameDayBlocked' | 'full' | 'past' | 'closed' | 'empty';

type ReservationCellProps = {
  slot: ReservationGridSlot | null;
  isSubmitting: boolean;
  onReserve: (slotId: string) => void;
  dense?: boolean;
};

function getCellStatus(slot: ReservationGridSlot | null): ReservationCellStatus {
  if (!slot) return 'empty';
  if (slot.isPast) return 'past';
  if (!slot.isOpen) return 'closed';
  if (slot.isBookedByCurrentUser) return 'booked';
  if (slot.isBlockedBySameDayBooking) return 'sameDayBlocked';
  if (slot.remainingSeats <= 0) return 'full';
  return 'available';
}

export function ReservationCell({ slot, isSubmitting, onReserve, dense = false }: ReservationCellProps) {
  const status = getCellStatus(slot);

  if (!slot) {
    return (
      <div className={`${dense ? 'min-h-[44px] rounded-lg' : 'min-h-[68px] rounded-xl'} border border-dashed border-gray-200 bg-gray-50`} />
    );
  }

  const remaining = Math.max(slot.remainingSeats, 0);
  const capacityLabel = dense ? `${remaining}/${slot.capacity}` : `残り${remaining} / ${slot.capacity}`;

  if (status === 'available') {
    return (
      <div className={`${dense ? 'min-h-[44px] rounded-lg p-1' : 'min-h-[68px] rounded-xl p-1.5'} border border-yellow-200 bg-yellow-50 text-center shadow-sm`}>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => onReserve(slot.id)}
          className={`${dense ? 'min-h-[28px] rounded-md px-1 text-[11px]' : 'min-h-[38px] rounded-lg px-2 text-xs'} flex w-full items-center justify-center bg-yellow-400 font-black text-gray-950 shadow-sm transition hover:bg-yellow-300 disabled:cursor-wait disabled:opacity-60`}
        >
          {isSubmitting ? '…' : dense ? '予約' : '予約する'}
        </button>
        <p className={`${dense ? 'mt-0.5 text-[10px]' : 'mt-1 text-[11px]'} font-bold text-yellow-900`}>{capacityLabel}</p>
      </div>
    );
  }

  const statusStyles: Record<Exclude<ReservationCellStatus, 'available'>, string> = {
    booked: 'border-green-200 bg-green-50 text-green-800',
    sameDayBlocked: 'border-gray-200 bg-gray-50 text-gray-500',
    full: 'border-red-100 bg-red-50 text-red-700',
    past: 'border-gray-200 bg-gray-100 text-gray-500',
    closed: 'border-gray-200 bg-gray-50 text-gray-400',
    empty: 'border-gray-200 bg-gray-50 text-gray-400'
  };

  const statusLabel: Record<Exclude<ReservationCellStatus, 'available'>, string> = dense
    ? {
        booked: '済',
        sameDayBlocked: '同日',
        full: '満',
        past: '終',
        closed: '',
        empty: ''
      }
    : {
        booked: '予約済み',
        sameDayBlocked: '同日予約済み',
        full: '満席',
        past: '受付終了',
        closed: '',
        empty: ''
      };

  return (
    <div className={`${dense ? 'min-h-[44px] rounded-lg p-1' : 'min-h-[68px] rounded-xl p-1.5'} flex flex-col items-center justify-center border text-center ${statusStyles[status]}`}>
      <p className={`${dense ? 'text-[11px]' : 'text-xs'} font-black`}>{statusLabel[status]}</p>
      {status !== 'empty' && status !== 'closed' && <p className={`${dense ? 'mt-0.5 text-[10px]' : 'mt-1 text-[11px]'} font-bold`}>{capacityLabel}</p>}
    </div>
  );
}
