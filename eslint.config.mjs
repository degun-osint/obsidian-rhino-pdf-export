import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

// Mirror the Obsidian community-plugin review lint, so a local `npx eslint src/`
// catches what the reviewers catch instead of a laxer subset. The type-checked
// config is what surfaces no-unsupported-api and the no-unsafe-* family.
export default defineConfig([
  ...obsidianmd.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
      globals: {
        // Node.js globals (Electron environment)
        Buffer: "readonly",
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        require: "readonly",
        module: "readonly",
        // Browser/Electron globals
        window: "readonly",
        document: "readonly",
        URL: "readonly",
        Blob: "readonly",
        HTMLElement: "readonly",
        // Obsidian globals
        activeDocument: "readonly",
        activeWindow: "readonly",
        createDiv: "readonly",
        createSpan: "readonly",
        createEl: "readonly",
      },
    },
  },
  {
    ignores: ["src/vendor/**", "*.mjs", "scripts/**"],
  },
]);
