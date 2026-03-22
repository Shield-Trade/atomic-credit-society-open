import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: "#F59E0B",
        cta: "#8B5CF6",
        base: "#0B1020"
      },
      boxShadow: {
        glow: "0 10px 30px rgba(139, 92, 246, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
