import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  const selectedDate = useMemo(() => new Date(`${weekStart}T00:00:00`), [weekStart]);
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

  const weekdayLabels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  const monthLabel = visibleMonth.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric"
  });
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const calendarStart = new Date(firstDay);
  calendarStart.setDate(firstDay.getDate() - startOffset);
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    const dateKey = formatDateKey(date);
    return {
      date,
      dateKey,
      inCurrentMonth: date.getMonth() === visibleMonth.getMonth(),
      isSelectedWeek: formatDateKey(getMonday(date)) === weekStart,
      isToday: dateKey === todayKey
    };
  });

  const shiftWeek = (deltaDays: number) => {
    const next = new Date(`${weekStart}T00:00:00`);
    next.setDate(next.getDate() + deltaDays);
    onChangeWeekStart(formatDateKey(getMonday(next)));
    setCalendarOpen(false);
  };

  const openCalendar = () => {
    setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setCalendarOpen(true);
  };

  const shiftMonth = (delta: number) => {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const modalContent =
    calendarOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 px-4 py-6">
            <div className="w-full max-w-md rounded-[30px] border border-slate-200 bg-white p-6 text-left shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Scegli un giorno
                  </p>
                  <p className="mt-1 text-lg font-semibold capitalize text-ink">{monthLabel}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => shiftMonth(-1)} className="app-btn-xs app-btn-secondary">
                    ←
                  </button>
                  <button type="button" onClick={() => shiftMonth(1)} className="app-btn-xs app-btn-secondary">
                    →
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-2">
                {weekdayLabels.map((label) => (
                  <div key={label} className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {label}
                  </div>
                ))}
                {calendarDays.map((day) => (
                  <button
                    key={day.dateKey}
                    type="button"
                    onClick={() => {
                      onChangeWeekStart(formatDateKey(getMonday(day.date)));
                      setCalendarOpen(false);
                    }}
                    className={`flex aspect-square items-center justify-center rounded-2xl text-sm font-medium transition ${
                      day.isSelectedWeek
                        ? "bg-sage text-white shadow-[0_10px_24px_rgba(85,139,103,0.22)]"
                        : day.inCurrentMonth
                          ? "bg-slate-50 text-ink hover:bg-slate-100"
                          : "bg-white text-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <span className={day.isToday && !day.isSelectedWeek ? "rounded-full border border-sage/40 px-2 py-1 text-sage" : ""}>
                      {day.date.getDate()}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onChangeWeekStart(currentWeekStart);
                    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
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
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={() => shiftWeek(-7)} className="app-btn-xs app-btn-secondary" type="button">
          ← Prec.
        </button>
        <div className="flex-1 text-center">
          <button
            type="button"
            onClick={openCalendar}
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
        </div>
        <button onClick={() => shiftWeek(7)} className="app-btn-xs app-btn-secondary" type="button">
          Succ. →
        </button>
      </div>
      {modalContent}
    </>
  );
}
