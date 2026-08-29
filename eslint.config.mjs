import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // A `_` prefix already means "required by a signature, deliberately
      // unused" throughout this codebase — Server Actions must accept
      // (prevState, formData) whether or not they read either. The default
      // `after-used` setting only flagged them when BOTH trailing params went
      // unused, which made the warning arbitrary rather than informative.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Build output, wherever it lands. The bare ".next/**" below only matches
    // the one at the repo root — a git worktree under .claude/worktrees/ has
    // its own, and linting that stale generated bundle produced thousands of
    // errors in files nobody wrote, which the pre-commit hook then refused
    // every commit over.
    "**/.next/**",
    ".claude/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
