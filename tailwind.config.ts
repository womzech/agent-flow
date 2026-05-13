import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tokens used across the app, themed for an "industrial workbench" feel.
        ink: {
          50: "#f5f7fa",
          100: "#e4e9f0",
          200: "#c7d0dd",
          300: "#9aa7bb",
          400: "#6b7a92",
          500: "#4a5872",
          600: "#37425a",
          700: "#2a3147",
          800: "#1c2236",
          900: "#0f1424",
        },
        accent: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
        },
        forge: {
          DEFAULT: "#0c1325",
          panel: "#141b30",
          line: "#26304a",
          muted: "#7e8aa8",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 28px -16px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
};

export default config;
