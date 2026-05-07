import type { WeeklyMenu } from "../../types";
import { DAYS, SLOT_LABELS, SLOTS } from "../../types";

interface WeekGridProps {
  menu: WeeklyMenu;
  weekStart: string;
}

export function WeekGrid({ menu, weekStart }: WeekGridProps) {
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
            <div className="flex items-center pr-2">
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
