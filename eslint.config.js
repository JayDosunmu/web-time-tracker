import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import wxtAutoImports from "./.wxt/eslint-auto-imports.mjs";

export default [
  eslint.configs.recommended,
  wxtAutoImports,
  {
    ignores: ["**/*.test.ts", "**/*.spec.ts", "tests/**"],
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "types/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        browser: "readonly",
        chrome: "readonly",
        console: "readonly",
        performance: "readonly",
        Date: "readonly",
        document: "readonly",
        window: "readonly",
        history: "readonly",
        HTMLElement: "readonly",
        ShadowRoot: "readonly",
        Event: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
];
