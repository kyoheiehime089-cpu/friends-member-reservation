import { fixedUnavailableBlocksForDate } from '@/lib/yogaSchedule';
import type { ReservationGridDate } from '@/components/ReservationGrid';

type UnavailableBlocksSummaryProps = {
  dates: ReservationGridDate[];
  dense?: boolean;
};

export function UnavailableBlocksSummary({ dates, dense = false }: UnavailableBlocksSummaryProps) {
  if (dates.length === 0) return null;

  return (
    <section className={`rounded-3xl border border-gray-200 bg-white shadow-sm ${dense ? 'p-3' : 'p-4 sm:p-5'}`}>
      <h2 className={`${dense ? 'text-base' : 'text-lg'} font-black`}>その日の予約不可ブロック</h2>
      <p className={`${dense ? 'mt-1 text-[11px]' : 'mt-1 text-sm'} font-semibold text-gray-500`}>セミパーソナル・通常ヨガはレッスン前後30分を含めて表示しています。既存予約とは別ラベルです。</p>
      <div className={`mt-3 grid gap-2 ${dense ? '' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
        {dates.map((date) => {
          const blocks = fixedUnavailableBlocksForDate(date.dateKey);
          return (
            <div key={date.dateKey} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
              <p className="font-black text-gray-950">{date.dateLabel}（{date.weekdayLabel}）</p>
              {blocks.length === 0 ? (
                <p className="mt-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-gray-500">固定の予約不可ブロックなし</p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {blocks.map((block) => (
                    <div key={`${date.dateKey}-${block.source}-${block.start}-${block.end}`} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold">
                      <span className={block.source === 'yoga' ? 'text-purple-700' : 'text-blue-800'}>{block.label}</span>
                      <span className="font-black text-gray-950">{block.start}〜{block.end}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
