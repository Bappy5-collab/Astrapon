import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Module boundaries (see docs/architecture.md):
 * - src/domain     pure TypeScript: no React, Next, Supabase, Three, or server code.
 * - src/server     server-only provider/database access; never imported by client 3D code.
 * - src/components/scene  client-only 3D; must not import server modules.
 */
const serverImports = {
  group: ["@/server/*", "**/server/*"],
  message: "Server modules (providers, database, secrets) must not be imported here.",
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            serverImports,
            {
              group: ["react", "react-dom", "next", "next/*", "@mui/*", "three", "@react-three/*", "@supabase/*"],
              message: "src/domain must stay pure TypeScript with no framework or I/O dependencies.",
            },
            { group: ["@/components/*", "@/app/*", "@/lib/*"], message: "src/domain must not depend on UI or infrastructure." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/theme/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [serverImports] }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
]);
