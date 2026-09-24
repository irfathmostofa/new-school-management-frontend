/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#12161c",
          900: "#1a2332",
          800: "#243044",
          700: "#3a4a62",
          500: "#6b7c93",
          400: "#8b9bb0",
        },
        paper: {
          50: "#fbf8f1",
          100: "#f4efe6",
          200: "#e8dfd0",
          300: "#d4c6b0",
        },
        brass: {
          400: "#c9a227",
          500: "#b08a1a",
        },
        terracotta: {
          500: "#c45c26",
          600: "#a84b1d",
        },
        pine: {
          500: "#1d6a6a",
          600: "#165555",
          700: "#0f3f3f",
        },
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"Figtree"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(26,35,50,0.04), 0 12px 32px -16px rgba(26,35,50,0.18)",
      },
    },
  },
  plugins: [],
};
