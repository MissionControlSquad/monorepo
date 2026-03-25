/**
 * AgentCenter Tailwind v3 preset — used by apps/mobile.
 *
 * Usage in tailwind.config.js:
 *   module.exports = {
 *     content: [...],
 *     presets: [require("@agentcenter/tailwind-config/native")],
 *   };
 */
const { brand, app, status, fontFamily } = require("./src/tokens.js");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        brand,
        app,
        status,
      },
      fontFamily,
    },
  },
  plugins: [],
};
