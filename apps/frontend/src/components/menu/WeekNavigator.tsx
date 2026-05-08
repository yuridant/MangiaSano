import { useMemo, useState } from "react";
import { formatDateKey, formatWeekRange, getMonday } from "../../lib/week";

interface WeekNavigatorProps {
  weekStart: string;
  onChangeWeekStart: (weekStart: string) => void;
  showCurrentLabel?: boolean;
  includeYear?: boolean;
}

export function WeekNavigator({
  weekStart,
  onChangeWeekStart,
  showCurrentLabel = true,
  includeYear = true
}: WeekNavigatorProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const currentWeekStart = useMemo(() => formatDateKey(getMonday(new Date())), []);
  const isCurrentWeek = currentWeekStart === weekStart;

  const shiftWeek = (deltaDays: number) => {
    const next = new Date(`${weekStart}T00:00:00`);
    next.setDate(next.getDate() + deltaDays);
    onChangeWeekStart(formatDateKey(getMonday(next)));
    setCalendarOpen(false);
  };

  return (
    <div className="mt-4 flex items-center gap-3">
      <button onClick={() => shiftWeek(-7)} className="app-btn-xs app-btn-secondary" type="button">
        ← Prec.
      </button>
      <div className="relative flex-1 text-center">
        <button
          type="button"
          onClick={() => setCalendarOpen((prev) => !prev)}
          className="inline-flex flex-col items-center rounded-2xl px-3 py-2 transition hover:bg-slate-50"
        >
          <p className="text-sm font-semibold text-ink underline decoration-slate-200 underline-offset-4">
            {formatWeekRange(weekStart, includeYear)}
          </p>
          {showCurrentLabel && isCurrentWeek && (
            <span className="text-xs font-medium text-sage">Settimana corrente</span>
          )}
          {!isCurrentWeek && <span className="text-[11px] text-slate-400">Apri calendario</span>}
        </button>

        {calendarOpen && (
          <div className="absolute left-1/2 top-full z-20 mt-2 w-[260px] -translate-x-1/2 rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Scegli un giorno per aprire la sua settimana
            </p>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => {
                if (!e.target.value) return;
                onChangeWeekStart(formatDateKey(getMonday(new Date(`${e.target.value}T00:00:00`))));
                setCalendarOpen(false);
              }}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-ink focus:border-sage focus:outline-none"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onChangeWeekStart(currentWeekStart);
                  setCalendarOpen(false);
                }}
                className="app-btn-xs app-btn-sage"
              >
                Oggi
              </button>
              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                className="app-btn-xs app-btn-secondary"
              >
                Chiudi
              </button>
            </div>
          </div>
        )}
      </div>
      <button onClick={() => shiftWeek(7)} className="app-btn-xs app-btn-secondary" type="button">
        Succ. →
      </button>
    </div>
  );
}
