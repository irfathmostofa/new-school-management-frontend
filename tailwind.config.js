/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f4f7f4",
          100: "#e4ece4",
          200: "#c9d8c9",
          700: "#2f4a3a",
          800: "#1f3328",
          900: "#14211a",
        },
        gold: {
          400: "#c9a227",
          500: "#b08a1c",
        },
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui"],
        serif: ["Fraunces", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
