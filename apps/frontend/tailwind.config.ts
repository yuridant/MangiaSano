import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        sage: "#4a7c59",
        cream: "#fefce8",
        terra: "#c2410c",
        herb: "#16a34a",
        wheat: "#d97706"
      },
      fontFamily: {
        sans: ["'Manrope'", "sans-serif"]
      },
      boxShadow: {
        panel: "0 18px 60px rgba(15, 23, 42, 0.10)"
      }
    }
  },
  plugins: []
} satisfies Config;
