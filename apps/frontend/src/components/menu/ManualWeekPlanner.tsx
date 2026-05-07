import type { MenuMeal, MealSlot } from "../../types";
import { DAYS, SLOT_LABELS, SLOTS } from "../../types";

interface ManualWeekPlannerProps {
  meals: MenuMeal[];
  selectedDayOfWeek: number;
  selectedMealSlot: MealSlot;
  onSelect: (dayOfWeek: number, mealSlot: MealSlot) => void;
}

export function ManualWeekPlanner({
  meals,
  selectedDayOfWeek,
  selectedMealSlot,
  onSelect
}: ManualWeekPlannerProps) {
  const mealsByDayAndSlot = new Map<string, MenuMeal>();
  for (const meal of meals) {
    mealsByDayAndSlot.set(`${meal.dayOfWeek}-${meal.mealSlot}`, meal);
  }

  return (
    <div className="overflow-x-auto rounded-[28px] border border-slate-200/80 bg-white/70 p-4">
      <div className="min-w-[560px]">
        <div className="mb-3 grid grid-cols-[80px_repeat(7,1fr)] gap-1">
          <div />
          {DAYS.map((day, dayOfWeek) => (
            <div key={day} className="text-center">
              <span
                className={`text-xs font-bold ${
                  dayOfWeek === selectedDayOfWeek ? "text-sage" : "text-slate-400"
                }`}
              >
                {day}
              </span>
            </div>
          ))}
        </div>

        {SLOTS.map((slot) => (
          <div key={slot} className="mb-1.5 grid grid-cols-[80px_repeat(7,1fr)] gap-1">
            <div className="flex items-center pr-2">
              <span className="text-xs font-semibold text-slate-400">{SLOT_LABELS[slot]}</span>
            </div>
            {DAYS.map((_, dayOfWeek) => {
              const meal = mealsByDayAndSlot.get(`${dayOfWeek}-${slot}`);
              const isSelected = dayOfWeek === selectedDayOfWeek && slot === selectedMealSlot;
              const label = meal ? (meal.recipe?.name ?? meal.customName ?? "—") : "+";

              return (
                <button
                  key={`${dayOfWeek}-${slot}`}
                  type="button"
                  onClick={() => onSelect(dayOfWeek, slot)}
                  className={`min-h-[72px] rounded-2xl border px-2 py-2 text-center text-[11px] font-medium leading-tight transition-colors ${
                    isSelected
                      ? "border-sage bg-sage text-white shadow-sm"
                    : meal
                        ? "border-sage/20 bg-sage/10 text-sage hover:border-sage hover:bg-sage/15"
                        : "border-slate-200 bg-slate-50 text-slate-400 hover:border-sage/40 hover:bg-sage/5 hover:text-ink"
                  }`}
                >
                  <span className={meal ? "block" : "text-lg leading-none"}>{label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
