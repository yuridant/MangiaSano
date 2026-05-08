import { useSearchParams } from "react-router-dom";
import { AccountSettingsSection } from "./account-page";
import { FamilySettingsSection } from "./family-page";
import { useTheme } from "../lib/theme";

const SETTINGS_TABS = [
  { id: "account", label: "Account" },
  { id: "family", label: "Famiglia" },
  { id: "appearance", label: "Aspetto" }
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

function isSettingsTab(value: string | null): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

function AppearanceSettingsSection() {
  const { theme, setTheme, themes } = useTheme();

  return (
    <div className="flex flex-col gap-5">
      <div className="app-panel">
        <h2 className="text-lg font-bold text-ink">Palette</h2>
        <p className="app-muted mt-2 text-sm">
          Scegli il tono visivo dell&apos;app. La palette selezionata viene salvata solo per questo browser.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {themes.map((option) => {
            const isActive = option.id === theme;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                className={`rounded-[1.8rem] border p-4 text-left transition ${
                  isActive
                    ? "border-sage bg-sage/10 shadow-panel"
                    : "border-white/80 bg-white/75 hover:bg-white/90"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-base font-bold text-ink">{option.name}</p>
                  <span className={`app-badge ${isActive ? "app-badge-sage" : ""}`}>
                    {isActive ? "Attiva" : "Seleziona"}
                  </span>
                </div>
                <p className="app-muted mt-2 text-sm">{option.description}</p>
                <div className="mt-4 flex gap-2">
                  {option.preview.map((color) => (
                    <span
                      key={color}
                      className="h-10 flex-1 rounded-full border border-white/70 shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = isSettingsTab(searchParams.get("tab")) ? searchParams.get("tab") : "account";

  return (
    <div className="flex flex-col gap-5">
      <div className="app-page-header">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Preferenze</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Impostazioni</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Gestisci account, famiglia e aspetto in un unico spazio piu&apos; ordinato.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {SETTINGS_TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSearchParams({ tab: tab.id })}
                className={`app-btn-xs ${
                  isActive ? "app-btn-sage" : "border border-slate-200 bg-white/80 text-slate-700 hover:bg-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "account" && <AccountSettingsSection />}
      {activeTab === "family" && <FamilySettingsSection />}
      {activeTab === "appearance" && <AppearanceSettingsSection />}
    </div>
  );
}
