import { App, Setting, TFile } from "obsidian";
import type { DocConfig, PdfTheme } from "./types";
import { DOC_CONFIG_KEY, resolveCoverInfoKeys, resolveTheme } from "./frontmatter";
import { frontmatterToString } from "./render";

/** Theme fields the export modals let you override for a single document. */
export type DocField =
  | "subtitle"
  | "showCover"
  | "showToc"
  | "headerText"
  | "footerText"
  | "watermarkText"
  | "classificationText";

interface FieldUI {
  name: string;
  desc?: string;
  type: "text" | "toggle";
}

const FIELD_UI: Record<DocField, FieldUI> = {
  subtitle: { name: "Subtitle", type: "text", desc: "Shown under the title on the cover" },
  showCover: { name: "Cover page", type: "toggle" },
  showToc: { name: "Table of contents", type: "toggle" },
  headerText: { name: "Header text", type: "text", desc: "Variables: {title}, {filename}, {author}, {date}, {time}, {fm.key}" },
  footerText: { name: "Footer text", type: "text", desc: "Variables: {title}, {filename}, {author}, {date}, {time}, {fm.key}" },
  watermarkText: { name: "Watermark", type: "text", desc: "Leave empty to disable" },
  classificationText: { name: "Classification banner", type: "text", desc: "Centered on every page. Leave empty to disable." },
};

/**
 * Per-export overrides being edited in a modal.
 *
 * `edits` uses key presence, not truthiness: `{subtitle: ""}` deliberately
 * clears a subtitle the theme defines. `coverInfo` left undefined means
 * "inherit from frontmatter, then from the theme".
 */
export interface DocConfigState {
  edits: Partial<PdfTheme>;
  coverInfo?: string[];
}

export function createDocConfigState(): DocConfigState {
  return { edits: {} };
}

/** Frontmatter keys a note can offer to the cover info block. */
export function infoBlockCandidates(app: App, file: TFile): string[] {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  return Object.keys(fm).filter(
    (k) => k !== DOC_CONFIG_KEY && frontmatterToString(fm[k]) !== ""
  );
}

interface RenderOpts {
  container: HTMLElement;
  app: App;
  /** Null in batch mode: there is no single note to read frontmatter from. */
  file: TFile | null;
  baseTheme: PdfTheme;
  docConfig: DocConfig;
  state: DocConfigState;
  fields: DocField[];
  onChange: () => void;
  /** Show the cover info block checkboxes (single-note export only). */
  showCoverInfo?: boolean;
  /** Initial expanded state, so a re-render does not collapse the section. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
}

/**
 * Render the collapsible "This document" section: the settings you want to
 * change right before exporting, without touching the theme.
 *
 * Each control displays the *resolved* value (theme, then frontmatter) and
 * writes into `state.edits` on change.
 */
export function renderDocConfigSection(opts: RenderOpts): void {
  const { container, app, file, baseTheme, docConfig, state, fields, onChange } = opts;

  const details = container.createEl("details", { cls: "rhino-doc-config" });
  details.open = opts.open ?? false;
  details.createEl("summary", { text: "This document" });
  const body = details.createDiv("rhino-doc-config-body");
  if (opts.onToggle) {
    details.addEventListener("toggle", () => opts.onToggle?.(details.open));
  }

  const resolved = resolveTheme(baseTheme, docConfig, state.edits);

  for (const field of fields) {
    const ui = FIELD_UI[field];
    const setting = new Setting(body).setName(ui.name);
    if (ui.desc) setting.setDesc(ui.desc);

    if (ui.type === "toggle") {
      setting.addToggle((t) => {
        t.setValue(resolved[field] as boolean).onChange((v) => {
          (state.edits as Record<string, unknown>)[field] = v;
          onChange();
        });
      });
    } else {
      setting.addText((t) => {
        t.setValue((resolved[field] as string) ?? "").onChange((v) => {
          // Assign unconditionally: an empty string is a valid override that
          // clears a value inherited from the theme.
          (state.edits as Record<string, unknown>)[field] = v;
          onChange();
        });
      });
    }
  }

  if (opts.showCoverInfo && file) {
    renderCoverInfo(body, app, file, baseTheme, docConfig, state, onChange);
  }
}

/** One checkbox per frontmatter field that can go into the cover info table. */
function renderCoverInfo(
  body: HTMLElement,
  app: App,
  file: TFile,
  baseTheme: PdfTheme,
  docConfig: DocConfig,
  state: DocConfigState,
  onChange: () => void
): void {
  const candidates = infoBlockCandidates(app, file);
  if (candidates.length === 0) return;

  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const selected = new Set(resolveCoverInfoKeys(baseTheme, docConfig, state.coverInfo));

  new Setting(body)
    .setName("Cover info block")
    .setDesc("Frontmatter fields to list in a table on the cover page")
    .setHeading();

  for (const key of candidates) {
    new Setting(body)
      .setName(key)
      .setDesc(frontmatterToString(fm[key]))
      .addToggle((t) => {
        t.setValue(selected.has(key)).onChange((v) => {
          if (v) selected.add(key);
          else selected.delete(key);
          // Keep frontmatter order, and stay explicit once touched.
          state.coverInfo = candidates.filter((k) => selected.has(k));
          onChange();
        });
      });
  }
}
