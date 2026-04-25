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
        // OS kernel palette — replaces old crimson identity
        void: "#06060a",
        deep: "#0a0a10",
        surface: "#101018",
        elevated: "#16161f",
        hover: "#1c1c28",
        "border-subtle": "#1e1e2a",
        border: "#2a2a3a",
        "text-primary": "#e4e4ed",
        "text-secondary": "#8888a0",
        "text-muted": "#5a5a70",
        // Accent system
        purple: {
          DEFAULT: "#7c3aed",
          dim: "#5b21b6",
        },
        cyan: {
          DEFAULT: "#00FFA7",
          dim: "#00cc86",
        },
        // Semantic
        danger: "#EF4444",
        success: "#10b981",
        warning: "#F59E0B",
      },
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        heading: ["Space Grotesk", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
      },
      boxShadow: {
        "glow-purple": "0 0 20px rgba(124, 58, 237, 0.4)",
        "glow-purple-soft": "0 0 40px rgba(124, 58, 237, 0.15)",
        "glow-cyan": "0 0 20px rgba(0, 255, 167, 0.4)",
      },
      backgroundColor: {
        DEFAULT: "#06060a",
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: true,
  },
};

export default config;
