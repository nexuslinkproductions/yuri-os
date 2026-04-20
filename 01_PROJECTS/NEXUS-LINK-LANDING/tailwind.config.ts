import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette: dark base, crimson accent
        black: "#000000",
        "dark-bg": "#0A0A0A",
        "dark-surface": "#121212",
        crimson: "#DC143C",
        "crimson-dark": "#8B0000",
      },
      backgroundColor: {
        DEFAULT: "#000000",
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: true,
  },
};

export default config;
