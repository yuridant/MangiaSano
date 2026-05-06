import { useQuery } from "@tanstack/react-query";
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

export function DashboardPage() {
  const { token, activeFamilyId, families } = useAuth();
  const today = new Date();
  const weekStart = getMonday(today).toISOString().split("T")[0];

  const menuQuery = useQuery({
    queryKey: ["menu", activeFamilyId, weekStart],
    queryFn: () =>
      api.get<WeeklyMenu | null>(`/menus/${weekStart}?familyId=${activeFamilyId}`, token!),
    enabled: !!token && !!activeFamilyId
  });

  const activeFamily = families.find((f) => f.id === activeFamilyId);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="app-page-header">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              {activeFamily?.name ?? "MangiaSano"}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-ink">
              Settimana corrente
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {new Date(weekStart + "T00:00:00").toLocaleDateString("it-IT", {
                day: "numeric",
                month: "long"
              })}{" "}
              — {new Date(new Date(weekStart + "T00:00:00").getTime() + 6 * 86400000).toLocaleDateString("it-IT", {
                day: "numeric",
                month: "long",
                year: "numeric"
              })}
            </p>
          </div>
          <Link
            to="/menu/generate"
            className="app-btn-sm app-btn-sage shrink-0"
          >
            + AI
          </Link>
        </div>
      </div>

      {/* No family */}
      {!activeFamilyId && (
        <div className="app-panel text-center">
          <p className="text-slate-500">
            Non sei ancora membro di una famiglia.{" "}
            <Link to="/family" className="font-semibold text-sage hover:underline">
              Crea o unisciti a una famiglia
            </Link>
          </p>
        </div>
      )}

      {/* Menu grid */}
      {activeFamilyId && (
        <>
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

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { to: "/shopping", label: "Lista spesa", icon: "🛒" },
              { to: "/menu", label: "Tutti i menu", icon: "📅" },
              { to: "/recipes", label: "Ricette", icon: "📖" },
              { to: "/analytics", label: "Statistiche", icon: "📊" }
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="app-panel flex flex-col items-center gap-2 py-5 text-center hover:bg-white/90"
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-sm font-semibold text-ink">{item.label}</span>
              </Link>
            ))}
          </div>
        </>
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
        {/* Header row */}
        <div className="mb-2 grid grid-cols-[80px_repeat(7,1fr)] gap-1">
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

        {/* Rows per slot */}
        {SLOTS.map((slot) => (
          <div key={slot} className="mb-1 grid grid-cols-[80px_repeat(7,1fr)] gap-1">
            <div className="flex items-center pr-2">
              <span className="text-xs font-semibold text-slate-400">{SLOT_LABELS[slot]}</span>
            </div>
            {DAYS.map((_, dayIndex) => {
              const meal = mealsByDayAndSlot.get(`${dayIndex}-${slot}`);
              return (
                <div
                  key={dayIndex}
                  className={`min-h-[48px] rounded-xl p-1.5 text-center text-[10px] font-medium leading-tight ${
                    meal
                      ? "bg-sage/10 text-sage"
                      : "bg-slate-50 text-slate-300"
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
