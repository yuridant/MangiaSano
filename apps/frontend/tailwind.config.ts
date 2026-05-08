import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        sage: "rgb(var(--color-sage) / <alpha-value>)",
        cream: "rgb(var(--color-cream) / <alpha-value>)",
        terra: "rgb(var(--color-terra) / <alpha-value>)",
        herb: "rgb(var(--color-herb) / <alpha-value>)",
        wheat: "rgb(var(--color-wheat) / <alpha-value>)"
      },
      fontFamily: {
        sans: ["'Manrope'", "sans-serif"]
      },
      boxShadow: {
        panel: "var(--panel-shadow)"
      }
    }
  },
  plugins: []
} satisfies Config;
