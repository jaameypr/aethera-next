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
  // Tests: mocks and fixtures legitimately use `any` and partial stubs.
  {
    files: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Standalone Node worker scripts are CommonJS by design (spawned via node).
  {
    files: ["scripts/**/*.{js,cjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // set-state-in-effect is a performance hint, not a correctness rule —
  // keep it as a warning so it does not gate CI.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
