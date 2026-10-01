import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Posters, backdrops, profile shots and the team photos are all rendered
      // through plain <img> on purpose. `next/image` would need every TMDB and
      // YouTube host allow-listed plus a known width/height for each tile, and
      // the cards here size themselves from whatever TMDB returns — so the
      // optimizer would add layout-shift guards without being able to size a
      // single one of them up front.
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
