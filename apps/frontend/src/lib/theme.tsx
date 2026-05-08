import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeId = "mercato-fresco" | "mediterraneo-solare" | "serra-notturna" | "frutteto-pop";

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
    description: "Naturale ma deciso, ispirato a ortofrutta, erbe fresche e luce del mercato.",
    preview: ["#1F2A24", "#5E8B63", "#D9A35F"]
  },
  {
    id: "mediterraneo-solare",
    name: "Mediterraneo Solare",
    description: "Piu' caldo e luminoso, tra tavola estiva, terracotta e grano dorato.",
    preview: ["#22313F", "#C7653C", "#E0B84F"]
  },
  {
    id: "serra-notturna",
    name: "Serra Elettrica",
    description: "Blu profondo, teal e acqua per un'identita' piu' audace e luminosa.",
    preview: ["#1B2747", "#0F9FB7", "#7AE7C7"]
  },
  {
    id: "frutteto-pop",
    name: "Frutteto Pop",
    description: "Prugna, corallo e lime per un carattere piu' giocoso e memorabile.",
    preview: ["#4B2142", "#F25F5C", "#9BC53D"]
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

function normalizeStoredTheme(value: string | null): ThemeId | null {
  if (value === "mediterranea") return "mediterraneo-solare";
  if (value === "serra-moderna") return "serra-notturna";
  return isThemeId(value) ? value : null;
}

export function getInitialTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return normalizeStoredTheme(stored) ?? DEFAULT_THEME;
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
