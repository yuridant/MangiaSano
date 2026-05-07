import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { DAYS, SLOT_LABELS, SLOTS } from "../../types";
export function WeekGrid({ menu, weekStart }) {
    const mealsByDayAndSlot = new Map();
    for (const meal of menu.meals) {
        mealsByDayAndSlot.set(`${meal.dayOfWeek}-${meal.mealSlot}`, meal);
    }
    return (_jsx("div", { className: "app-panel overflow-x-auto p-4", children: _jsxs("div", { className: "min-w-[560px]", children: [_jsxs("div", { className: "mb-3 grid grid-cols-[80px_repeat(7,1fr)] gap-1", children: [_jsx("div", {}), DAYS.map((day, i) => {
                            const d = new Date(new Date(weekStart + "T00:00:00").getTime() + i * 86400000);
                            const isToday = d.toDateString() === new Date().toDateString();
                            return (_jsxs("div", { className: "text-center", children: [_jsx("span", { className: `text-xs font-bold ${isToday ? "text-sage" : "text-slate-400"}`, children: day }), isToday && _jsx("div", { className: "mx-auto mt-0.5 h-1.5 w-1.5 rounded-full bg-sage" })] }, day));
                        })] }), SLOTS.map((slot) => (_jsxs("div", { className: "mb-1.5 grid grid-cols-[80px_repeat(7,1fr)] gap-1", children: [_jsx("div", { className: "flex items-center pr-2", children: _jsx("span", { className: "text-xs font-semibold text-slate-400", children: SLOT_LABELS[slot] }) }), DAYS.map((_, dayIndex) => {
                            const meal = mealsByDayAndSlot.get(`${dayIndex}-${slot}`);
                            return (_jsx("div", { className: `min-h-[52px] rounded-xl p-1.5 text-center text-[10px] font-medium leading-tight ${meal ? "bg-sage/10 text-sage" : "bg-slate-50 text-slate-300"}`, children: meal ? (meal.recipe?.name ?? meal.customName ?? "—") : "·" }, dayIndex));
                        })] }, slot)))] }) }));
}
