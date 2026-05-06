import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { WeeklyMenu } from "../types";
import { DAYS, SLOT_LABELS, SLOTS } from "../types";

function getMonday(date: Date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatWeekRange(weekStart: string) {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start.getTime() + 6 * 86400000);
  return `${start.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} — ${end.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function MenuPage() {
  const { token, activeFamilyId } = useAuth();
  const [currentWeek, setCurrentWeek] = useState(() => getMonday(new Date()));

  const weekStart = currentWeek.toISOString().split("T")[0];

  const menuQuery = useQuery({
    queryKey: ["menu", activeFamilyId, weekStart],
    queryFn: () =>
      api.get<WeeklyMenu | null>(`/menus/${weekStart}?familyId=${activeFamilyId}`, token!),
    enabled: !!token && !!activeFamilyId
  });

  const prevWeek = () => {
    setCurrentWeek((d) => new Date(d.getTime() - 7 * 86400000));
  };

  const nextWeek = () => {
    setCurrentWeek((d) => new Date(d.getTime() + 7 * 86400000));
  };

  const isCurrentWeek =
    getMonday(new Date()).toISOString().split("T")[0] === weekStart;

  return (
    <div className="flex flex-col gap-5">
      <div className="app-page-header">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-ink">Menu Settimanale</h1>
          <Link to="/menu/generate" className="app-btn-sm app-btn-sage">
            + AI
          </Link>
        </div>

        {/* Week navigator */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={prevWeek}
            className="app-btn-xs app-btn-secondary"
            type="button"
          >
            ← Prec.
          </button>
          <div className="flex-1 text-center">
            <p className="text-sm font-semibold text-ink">{formatWeekRange(weekStart)}</p>
            {isCurrentWeek && (
              <span className="text-xs text-sage font-medium">Settimana corrente</span>
            )}
          </div>
          <button
            onClick={nextWeek}
            className="app-btn-xs app-btn-secondary"
            type="button"
          >
            Succ. →
          </button>
        </div>
      </div>

      {menuQuery.isLoading && (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-sage border-t-transparent" />
        </div>
      )}

      {menuQuery.isSuccess && !menuQuery.data && (
        <div className="app-panel text-center">
          <p className="text-slate-500">Nessun menu per questa settimana.</p>
          <Link to="/menu/generate" className="app-btn app-btn-sage mt-4 inline-flex">
            Genera menu con AI
          </Link>
        </div>
      )}

      {menuQuery.isSuccess && menuQuery.data && (
        <WeekGrid menu={menuQuery.data} weekStart={weekStart} />
      )}
    </div>
  );
}

function WeekGrid({ menu, weekStart }: { menu: WeeklyMenu; weekStart: string }) {
  const mealsByDayAndSlot = new Map<string, (typeof menu.meals)[0]>();
  for (const meal of menu.meals) {
    mealsByDayAndSlot.set(`${meal.dayOfWeek}-${meal.mealSlot}`, meal);
  }

  return (
    <div className="app-panel overflow-x-auto p-4">
      <div className="min-w-[560px]">
        <div className="mb-3 grid grid-cols-[80px_repeat(7,1fr)] gap-1">
          <div />
          {DAYS.map((day, i) => {
            const d = new Date(new Date(weekStart + "T00:00:00").getTime() + i * 86400000);
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <div key={day} className="text-center">
                <span className={`text-xs font-bold ${isToday ? "text-sage" : "text-slate-400"}`}>
                  {day}
                </span>
                {isToday && <div className="mx-auto mt-0.5 h-1.5 w-1.5 rounded-full bg-sage" />}
              </div>
            );
          })}
        </div>

        {SLOTS.map((slot) => (
          <div key={slot} className="mb-1.5 grid grid-cols-[80px_repeat(7,1fr)] gap-1">
            <div className="flex items-center">
              <span className="text-xs font-semibold text-slate-400">{SLOT_LABELS[slot]}</span>
            </div>
            {DAYS.map((_, dayIndex) => {
              const meal = mealsByDayAndSlot.get(`${dayIndex}-${slot}`);
              return (
                <div
                  key={dayIndex}
                  className={`min-h-[52px] rounded-xl p-1.5 text-center text-[10px] font-medium leading-tight ${
                    meal ? "bg-sage/10 text-sage" : "bg-slate-50 text-slate-300"
                  }`}
                >
                  {meal ? (meal.recipe?.name ?? meal.customName ?? "—") : "·"}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
