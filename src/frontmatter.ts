import type { PdfTheme } from "./types";

/**
 * Parse the YAML frontmatter of a markdown string and return
 * theme overrides found under the `rhino-pdf` key.
 *
 * Returns a partial PdfTheme (only overridden fields).
 * Returns null if no frontmatter or no rhino-pdf key.
 */
export function parseThemeOverrides(mdContent: string): Partial<PdfTheme> | null {
  const match = mdContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const yaml = match[1];
  const overrides = parseRhinoPdfBlock(yaml);
  if (!overrides || Object.keys(overrides).length === 0) return null;

  return overrides;
}

/**
 * Apply frontmatter overrides to a theme.
 * Returns a new theme (does not mutate the original).
 */
export function applyThemeOverrides(theme: PdfTheme, overrides: Partial<PdfTheme>): PdfTheme {
  const result: Record<string, unknown> = { ...theme };

  for (const [key, value] of Object.entries(overrides)) {
    if (key === "margins" && typeof value === "object" && value !== null) {
      result.margins = { ...theme.margins, ...(value as Record<string, string>) };
    } else if (key in result) {
      result[key] = value;
    }
  }

  return result as unknown as PdfTheme;
}

// --- Minimal YAML parser for the rhino-pdf key ---

type YamlValue = string | number | boolean;

function parseRhinoPdfBlock(yaml: string): Partial<PdfTheme> | null {
  const lines = yaml.split("\n");
  const result: Record<string, YamlValue | Record<string, string>> = {};
  let inBlock = false;
  let inMargins = false;
  const margins: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (/^rhino-pdf\s*:/.test(trimmed)) {
      inBlock = true;
      inMargins = false;
      continue;
    }

    if (inBlock) {
      // Non-indented line = end of block
      if (trimmed.length > 0 && !trimmed.startsWith(" ") && !trimmed.startsWith("\t")) {
        break;
      }

      if (trimmed.trim() === "" || trimmed.trim().startsWith("#")) continue;

      // Margins sub-block
      if (/^\s+margins\s*:/.test(trimmed)) {
        inMargins = true;
        continue;
      }

      if (inMargins) {
        const marginMatch = trimmed.match(/^\s{4,}(\w+)\s*:\s*(.+)/);
        if (marginMatch) {
          margins[marginMatch[1]] = String(parseYamlValue(marginMatch[2]));
          continue;
        } else if (/^\s{2,3}\S/.test(trimmed)) {
          inMargins = false;
        } else {
          continue;
        }
      }

      const propMatch = trimmed.match(/^\s+(\w+)\s*:\s*(.+)/);
      if (propMatch) {
        result[propMatch[1]] = parseYamlValue(propMatch[2]);
      }
    }
  }

  if (Object.keys(margins).length > 0) {
    result.margins = margins;
  }

  return Object.keys(result).length > 0 ? (result as unknown as Partial<PdfTheme>) : null;
}

function parseYamlValue(raw: string): YamlValue {
  const trimmed = raw.trim();

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}
