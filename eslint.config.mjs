import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
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
        createDiv: "readonly",
        createSpan: "readonly",
        createEl: "readonly",
      },
    },
  },
  {
    ignores: ["src/vendor/**"],
  },
]);
