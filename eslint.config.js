import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      "scripts/**/*.ts",
      "tests/**/*.ts",
      "spec/**/*.ts",
      "src/**/*.ts",
      "src/**/*.tsx",
      "middleware.ts",
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: ["node_modules/", "dist/", ".next/", "public/", "docs/generated/"],
  },
);