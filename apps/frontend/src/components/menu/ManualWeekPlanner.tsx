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
    <div className="app-panel overflow-x-auto p-4">
      <div className="min-w-[480px]">
        <div className="mb-2 grid grid-cols-[70px_repeat(7,1fr)] gap-1">
          <div />
          {DAYS.map((day) => (
            <div key={day} className="text-center text-[10px] font-bold text-slate-400">
              {day}
            </div>
          ))}
        </div>

        {SLOTS.map((slot) => (
          <div key={slot} className="mb-1 grid grid-cols-[70px_repeat(7,1fr)] gap-1">
            <div className="flex items-center">
              <span className="text-xs font-semibold text-slate-400">{SLOT_LABELS[slot]}</span>
            </div>
            {DAYS.map((_, dayOfWeek) => {
              const meal = mealsByDayAndSlot.get(`${dayOfWeek}-${slot}`);
              const isSelected = dayOfWeek === selectedDayOfWeek && slot === selectedMealSlot;
              const isFilled = Boolean(meal);
              const isActive = isSelected || isFilled;

              return (
                <button
                  key={`${dayOfWeek}-${slot}`}
                  type="button"
                  onClick={() => onSelect(dayOfWeek, slot)}
                  className={`h-10 rounded-xl text-xs font-semibold transition-colors ${
                    isActive
                      ? "bg-sage text-white"
                      : "bg-slate-50 text-slate-300 hover:bg-sage/20"
                  }`}
                >
                  {isFilled ? "✓" : "+"}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
