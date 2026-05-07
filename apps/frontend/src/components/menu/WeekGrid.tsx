import type { MealSlot, MenuMeal, WeeklyMenu } from "../../types";
import { DAYS, SLOT_LABELS, SLOTS } from "../../types";

interface WeekGridProps {
  menu?: WeeklyMenu | null;
  meals?: MenuMeal[];
  weekStart: string;
  selectedSlots?: Set<string>;
  onCellClick?: (dayOfWeek: number, mealSlot: MealSlot, meal: MenuMeal | null) => void;
}

export function WeekGrid({ menu, meals, weekStart, selectedSlots, onCellClick }: WeekGridProps) {
  const sourceMeals = meals ?? menu?.meals ?? [];
  const mealsByDayAndSlot = new Map<string, MenuMeal>();
  for (const meal of sourceMeals) {
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
              const slotKey = `${dayIndex}-${slot}`;
              const isFilled = Boolean(meal);
              const isSelected = selectedSlots?.has(slotKey) ?? false;
              const cellClasses = isFilled
                ? isSelected
                  ? "border-sage bg-sage text-white shadow-[0_12px_24px_rgba(85,139,103,0.24)]"
                  : "border-sage/30 bg-sage/14 text-sage shadow-[0_8px_18px_rgba(85,139,103,0.12)]"
                : isSelected
                  ? "border-sage bg-sage/18 text-sage"
                  : "border-dashed border-slate-200 bg-slate-50 text-slate-300";

              return (
                <button
                  key={dayIndex}
                  type="button"
                  onClick={() => onCellClick?.(dayIndex, slot, meal ?? null)}
                  className={`min-h-[62px] rounded-2xl border px-2 py-2 text-center text-[10px] font-medium leading-tight transition ${
                    cellClasses
                  } ${onCellClick ? "hover:-translate-y-[1px]" : "cursor-default"}`}
                >
                  {meal ? (
                    <div className="flex h-full flex-col items-center justify-center gap-1">
                      <span className="line-clamp-3 text-[11px] font-semibold leading-tight">
                        {meal.recipe?.name ?? meal.customName ?? "—"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-base leading-none">{isSelected ? "✓" : "+"}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
