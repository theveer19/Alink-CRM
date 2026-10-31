import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // theme-able brand palette (Settings → Theme / top-bar palette button)
        brand: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((k) => [k, `rgb(var(--brand-${k}) / <alpha-value>)`])),
        side: { DEFAULT: "rgb(var(--side-bg) / <alpha-value>)", fg: "rgb(var(--side-fg) / <alpha-value>)", muted: "rgb(var(--side-muted) / <alpha-value>)", hover: "rgb(var(--side-hover) / <alpha-value>)" },
        gold: { 400: "#f5c84c", 500: "#e8b931", 600: "#c99a17" },
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.06)" },
    },
  },
  plugins: [],
};
export default config;
