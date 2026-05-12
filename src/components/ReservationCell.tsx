import type { ReservationGridSlot } from '@/components/ReservationGrid';

type ReservationCellStatus = 'available' | 'booked' | 'full' | 'past' | 'closed' | 'empty';

type ReservationCellProps = {
  slot: ReservationGridSlot | null;
  isSubmitting: boolean;
  onReserve: (slotId: string) => void;
};

function getCellStatus(slot: ReservationGridSlot | null): ReservationCellStatus {
  if (!slot) {
    return 'empty';
  }

  if (slot.isPast) {
    return 'past';
  }

  if (!slot.isOpen) {
    return 'closed';
  }

  if (slot.isBookedByCurrentUser) {
    return 'booked';
  }

  if (slot.remainingSeats <= 0) {
    return 'full';
  }

  return 'available';
}

export function ReservationCell({ slot, isSubmitting, onReserve }: ReservationCellProps) {
  const status = getCellStatus(slot);

  if (!slot) {
    return (
      <div className="flex min-h-[92px] min-w-[132px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-2 text-center text-sm font-bold text-gray-400">
        休み
      </div>
    );
  }

  const capacityLabel = `残り${Math.max(slot.remainingSeats, 0)} / ${slot.capacity}`;

  if (status === 'available') {
    return (
      <div className="min-h-[92px] min-w-[132px] rounded-2xl border border-yellow-200 bg-yellow-50 p-2 text-center shadow-sm">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => onReserve(slot.id)}
          className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-yellow-400 px-3 py-3 text-sm font-black text-gray-950 shadow-sm transition hover:bg-yellow-300 disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting ? '予約中...' : '予約する'}
        </button>
        <p className="mt-2 text-xs font-bold text-yellow-900">{capacityLabel}</p>
      </div>
    );
  }

  const statusStyles: Record<Exclude<ReservationCellStatus, 'available'>, string> = {
    booked: 'border-green-200 bg-green-50 text-green-800',
    full: 'border-red-100 bg-red-50 text-red-700',
    past: 'border-gray-200 bg-gray-100 text-gray-500',
    closed: 'border-gray-200 bg-gray-50 text-gray-500',
    empty: 'border-gray-200 bg-gray-50 text-gray-400'
  };

  const statusLabel: Record<Exclude<ReservationCellStatus, 'available'>, string> = {
    booked: '予約済み',
    full: '満席',
    past: '受付終了',
    closed: '受付なし',
    empty: '休み'
  };

  return (
    <div className={`flex min-h-[92px] min-w-[132px] flex-col items-center justify-center rounded-2xl border p-2 text-center ${statusStyles[status]}`}>
      <p className="text-sm font-black">{statusLabel[status]}</p>
      <p className="mt-2 text-xs font-bold">{capacityLabel}</p>
    </div>
  );
}
