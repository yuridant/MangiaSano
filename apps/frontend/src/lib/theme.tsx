import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeId = "mercato-fresco" | "mediterranea" | "serra-moderna";

export type ThemeDefinition = {
  id: ThemeId;
  name: string;
  description: string;
  preview: [string, string, string];
};

const STORAGE_KEY = "mangiasano.theme";
const DEFAULT_THEME: ThemeId = "mercato-fresco";

export const THEMES: ThemeDefinition[] = [
  {
    id: "mercato-fresco",
    name: "Mercato Fresco",
    description: "Verdure di stagione, luce morbida e un tono naturale piu' distintivo.",
    preview: ["#1F2A24", "#5E8B63", "#D9A35F"]
  },
  {
    id: "mediterranea",
    name: "Mediterranea",
    description: "Piu' calda e italiana, tra basilico, terracotta e tavola di casa.",
    preview: ["#24313A", "#627A3A", "#C86C4C"]
  },
  {
    id: "serra-moderna",
    name: "Serra Moderna",
    description: "Piacevolmente piu' tech, pulita e adatta a un wellness contemporaneo.",
    preview: ["#1D2830", "#4E8A78", "#D48D63"]
  }
];

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  themes: ThemeDefinition[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function getInitialTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isThemeId(stored) ? stored : DEFAULT_THEME;
}

function applyTheme(theme: ThemeId) {
  if (typeof document === "undefined") return;
  if (theme === DEFAULT_THEME) {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      themes: THEMES
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
