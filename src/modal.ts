import { App, Modal, Setting, TFile, Notice } from "obsidian";
import type { DocConfig, PdfTheme, PluginSettings } from "./types";
import { BUILTIN_THEMES, duplicateTheme } from "./themes";
import { buildHtml, makeDocVars, coverInfoRows } from "./render";
import {
  AssetCache,
  exportNoteToPdf,
  extractTitle,
  getVaultBasePath,
  renderNoteHtml,
} from "./export";
import {
  DOC_CONFIG_KEY,
  applyPartial,
  countOverrides,
  diffFromTheme,
  mergeDocConfigBlock,
  readDocConfig,
  resolveBaseTheme,
  resolveCoverInfoKeys,
  resolveTheme,
  validateDocConfig,
} from "./frontmatter";
import { createDocConfigState, renderDocConfigSection, type DocConfigState, type DocField } from "./doc-config-ui";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { ElectronRemote } from "electron";
import electron from "electron";

/** Overrides worth changing right before a single-note export. */
const MODAL_FIELDS: DocField[] = [
  "subtitle",
  "showCover",
  "showToc",
  "watermarkText",
  "classificationText",
];

const PREVIEW_DEBOUNCE_MS = 250;

function getElectronRemote(): ElectronRemote {
  const remote = electron.remote;
  if (remote) return remote;
  return electron as unknown as ElectronRemote;
}

export class ExportModal extends Modal {
  private settings: PluginSettings;
  private file: TFile;
  private saveSettings: () => Promise<void>;
  private selectedTheme: PdfTheme;
  private docConfig: DocConfig;
  private state: DocConfigState = createDocConfigState();
  /** True once the user picks a theme by hand, so "Save to note" pins it. */
  private themePinChanged = false;
  private docConfigEl: HTMLElement | null = null;
  private docConfigOpen = false;
  private previewWebview: HTMLElement | null = null;
  private previewTempFile: string | null = null;
  private previewTimer: number | null = null;
  /** Guards against a slow preview run overwriting a newer one. */
  private previewGen = 0;
  private cachedBodyHtml: string | null = null;
  private cachedTitle: string | null = null;
  private assetCache: AssetCache;
  private cachedFrontmatter: Record<string, unknown> = {};
  private pluginId: string;

  constructor(
    app: App,
    file: TFile,
    settings: PluginSettings,
    saveSettings: () => Promise<void>,
    pluginId: string
  ) {
    super(app);
    this.file = file;
    this.settings = settings;
    this.saveSettings = saveSettings;
    this.pluginId = pluginId;
    this.assetCache = new AssetCache(app);

    // metadataCache is synchronous, so the note's config is available before
    // onOpen() renders the controls seeded from it.
    this.docConfig = readDocConfig(app, file);
    this.selectedTheme = resolveBaseTheme(this.allThemes(), this.docConfig, this.lastUsedTheme());
  }

  private allThemes(): PdfTheme[] {
    return [...BUILTIN_THEMES, ...this.settings.themes];
  }

  private lastUsedTheme(): PdfTheme {
    const all = this.allThemes();
    return all.find((t) => t.id === this.settings.lastUsedThemeId) || all[0];
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("rhino-pdf-export-modal");

    new Setting(contentEl).setName("PDF export").setHeading();

    const allThemes = this.allThemes();
    // The selected theme may have been deleted from the settings tab.
    if (!allThemes.some((t) => t.id === this.selectedTheme.id)) {
      this.selectedTheme = allThemes[0];
    }

    new Setting(contentEl)
      .setName("Theme")
      .setDesc("Select the theme for export")
      .addDropdown((dd) => {
        for (const t of allThemes) dd.addOption(t.id, t.name);
        dd.setValue(this.selectedTheme.id);
        dd.onChange((val) => {
          this.selectedTheme = allThemes.find((t) => t.id === val) || allThemes[0];
          this.themePinChanged = true;
          // Values shown in "This document" resolve against the base theme.
          this.renderDocConfig();
          this.schedulePreview();
        });
      });

    this.buildOverrideBadges(contentEl);

    this.docConfigEl = contentEl.createDiv();
    this.renderDocConfig();

    new Setting(contentEl).addButton((btn) => {
      btn.setButtonText("Edit theme").onClick(() => this.openThemeEditor());
    });

    const previewContainer = contentEl.createDiv("pdf-preview-container");
    previewContainer.createDiv("pdf-preview-loading").textContent = "Loading preview…";

    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText("Export").setCta().onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText("Exporting…");
          try {
            await this.doExport();
            this.close();
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (message !== "cancelled") new Notice(`Export error: ${message}`);
            btn.setDisabled(false);
            btn.setButtonText("Export");
          }
        });
      })
      .addButton((btn) => {
        btn
          .setButtonText("Save to note")
          .setTooltip("Write these settings into the note's frontmatter")
          .onClick(() => void this.saveToNote());
      })
      .addButton((btn) => {
        btn
          .setButtonText("Save as theme default")
          .setTooltip("Make these settings the theme's defaults")
          .onClick(() => void this.saveAsThemeDefault());
      });

    void this.initPreview(previewContainer);
  }

  onClose() {
    this.cleanupPreview();
    this.contentEl.empty();
  }

  /** Rebuild the whole modal in place, keeping the rendered markdown cache. */
  private rerender() {
    this.cleanupPreview();
    this.contentEl.empty();
    this.onOpen();
  }

  /** Re-render only the overrides section, leaving the preview webview alone. */
  private renderDocConfig() {
    if (!this.docConfigEl) return;
    this.docConfigEl.empty();
    renderDocConfigSection({
      container: this.docConfigEl,
      app: this.app,
      file: this.file,
      baseTheme: this.selectedTheme,
      docConfig: this.docConfig,
      state: this.state,
      fields: MODAL_FIELDS,
      showCoverInfo: true,
      open: this.docConfigOpen,
      onToggle: (open) => { this.docConfigOpen = open; },
      onChange: () => this.schedulePreview(),
    });
  }

  /** Tell the user when the note itself is changing the export. */
  private buildOverrideBadges(contentEl: HTMLElement) {
    const count = countOverrides(this.docConfig);
    if (count > 0) {
      const keys = [
        ...Object.keys(this.docConfig.overrides),
        ...(this.docConfig.theme ? ["theme"] : []),
        ...(this.docConfig.coverInfo ? ["coverInfo"] : []),
      ];
      const badge = contentEl.createDiv("rhino-override-badge");
      badge.textContent = `${count} setting${count > 1 ? "s" : ""} overridden by this note`;
      badge.addEventListener("click", () => {
        new Notice(`Overridden by frontmatter:\n${keys.join("\n")}`, 8000);
      });
    }

    const ignored = this.docConfig.ignoredKeys;
    if (ignored.length > 0) {
      const badge = contentEl.createDiv("rhino-override-badge is-warning");
      badge.textContent = `${ignored.length} frontmatter key${ignored.length > 1 ? "s" : ""} ignored`;
      badge.addEventListener("click", () => {
        new Notice(`Ignored (unknown or invalid):\n${ignored.join("\n")}`, 8000);
      });
    }
  }

  /**
   * Open the plugin settings on top of this modal. The settings tab mutates
   * theme objects in place, so refresh once it closes rather than closing this
   * modal and losing the user's in-progress overrides.
   */
  private openThemeEditor() {
    const setting = (this.app as unknown as Record<string, unknown>).setting as
      | { open: () => void; openTabById: (id: string) => void; onClose?: () => void }
      | undefined;

    if (!setting || typeof setting.open !== "function") {
      new Notice("Could not open the settings tab.");
      return;
    }

    try {
      // Own property vs inherited: restoring by assignment would shadow the
      // prototype's onClose with undefined.
      const hadOwnOnClose = Object.getOwnPropertyDescriptor(setting, "onClose") !== undefined;
      const originalOnClose = setting.onClose;
      setting.onClose = () => {
        if (hadOwnOnClose) setting.onClose = originalOnClose;
        else delete setting.onClose;
        originalOnClose?.call(setting);
        this.rerender();
      };
    } catch {
      // Not being able to hook the close event only costs a stale preview.
    }

    setting.open();
    setting.openTabById(this.pluginId);
  }

  private getEffectiveTheme(): PdfTheme {
    return resolveTheme(this.selectedTheme, this.docConfig, this.state.edits);
  }

  private getCoverInfoKeys(): string[] {
    return resolveCoverInfoKeys(this.selectedTheme, this.docConfig, this.state.coverInfo);
  }

  /**
   * Write the current overrides into the note's `rhino-pdf` frontmatter,
   * merging onto what is already there — this block may hold keys the modal
   * does not expose (margins, colors), and they must survive.
   */
  private async saveToNote() {
    const base = this.selectedTheme;
    const diff = diffFromTheme(this.getEffectiveTheme(), base);
    const coverInfo = this.getCoverInfoKeys();
    let written: Record<string, unknown> = {};

    try {
      await this.app.fileManager.processFrontMatter(this.file, (frontmatter: unknown) => {
        const fm = frontmatter as Record<string, unknown>;
        const raw = fm[DOC_CONFIG_KEY];
        const prev: Record<string, unknown> =
          typeof raw === "object" && raw !== null && !Array.isArray(raw)
            ? { ...(raw as Record<string, unknown>) }
            : {};

        const next = mergeDocConfigBlock({
          prev,
          diff,
          previousOverrides: this.docConfig.overrides,
          coverInfo,
          pinThemeId: this.themePinChanged ? base.id : undefined,
        });

        if (Object.keys(next).length > 0) fm[DOC_CONFIG_KEY] = next;
        else delete fm[DOC_CONFIG_KEY];

        written = next;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Could not write frontmatter: ${message}`);
      return;
    }

    // metadataCache updates asynchronously, so rebuild the config from what we
    // just wrote instead of re-reading a stale cache.
    this.docConfig = validateDocConfig(written);
    this.state = createDocConfigState();
    this.themePinChanged = false;
    new Notice("Export settings saved to the note.");
    this.rerender();
  }

  /** Promote the modal's overrides to the theme's defaults. */
  private async saveAsThemeDefault() {
    if (Object.keys(this.state.edits).length === 0 && !this.state.coverInfo) {
      new Notice("Nothing to save: no override set in this modal.");
      return;
    }

    let target = this.selectedTheme;
    if (target.builtin) {
      target = duplicateTheme(target);
      this.settings.themes.push(target);
      new Notice(`Built-in theme duplicated as "${target.name}".`);
    }

    applyPartial(target, this.state.edits);
    if (this.state.coverInfo) target.coverInfoFields = [...this.state.coverInfo];

    this.selectedTheme = target;
    this.settings.lastUsedThemeId = target.id;
    await this.saveSettings();

    // The theme now carries them; keeping them as edits would double-apply on
    // a later "Save to note", writing values identical to the theme.
    this.state = createDocConfigState();
    new Notice(`Saved as defaults of "${target.name}".`);
    this.rerender();
  }

  private async initPreview(container: HTMLElement) {
    await this.prepareContent();
    // createEl has no key for Electron's <webview>; it is an HTMLElement at runtime.
    const webview = createEl("webview" as "div");
    webview.addClass("rhino-webview");
    webview.setAttribute("webpreferences", "javascript=yes");
    this.previewWebview = webview;
    container.empty();
    container.appendChild(webview);
    await this.updatePreview();
  }

  private async prepareContent() {
    if (this.cachedBodyHtml !== null) return;

    const mdContent = await this.app.vault.cachedRead(this.file);
    this.cachedFrontmatter = this.app.metadataCache.getFileCache(this.file)?.frontmatter ?? {};
    this.cachedTitle = extractTitle(mdContent, this.file.basename);
    this.cachedBodyHtml = await renderNoteHtml(this.app, mdContent, this.file.path);
  }

  /** Coalesce keystrokes: each one used to rerun paged.js on a fresh webview. */
  private schedulePreview() {
    if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null;
      void this.updatePreview();
    }, PREVIEW_DEBOUNCE_MS);
  }

  private async updatePreview() {
    if (!this.previewWebview || this.cachedBodyHtml === null || this.cachedTitle === null) return;

    const gen = ++this.previewGen;
    const theme = this.getEffectiveTheme();
    const assets = await this.assetCache.get(theme);
    if (gen !== this.previewGen) return;

    const vars = makeDocVars(this.cachedTitle, this.file.basename, this.cachedFrontmatter);
    const coverInfo = coverInfoRows(this.cachedFrontmatter, this.getCoverInfoKeys());
    const html = buildHtml(this.cachedBodyHtml, this.cachedTitle, theme, assets, vars, coverInfo);

    const tempFile = path.join(os.tmpdir(), `rhino-preview-${gen}-${Date.now()}.html`);
    fs.writeFileSync(tempFile, html, "utf-8");

    // A newer run started while we were writing: drop this one rather than let
    // it clobber the newer preview, and clean up after ourselves.
    if (gen !== this.previewGen) {
      try { fs.unlinkSync(tempFile); } catch { /* cleanup non-critical */ }
      return;
    }

    this.cleanupPreviewFile();
    this.previewTempFile = tempFile;
    this.previewWebview.setAttribute("src", `file://${tempFile}`);
  }

  private cleanupPreviewFile() {
    if (this.previewTempFile) {
      try { fs.unlinkSync(this.previewTempFile); } catch { /* cleanup non-critical */ }
      this.previewTempFile = null;
    }
  }

  private cleanupPreview() {
    if (this.previewTimer !== null) {
      window.clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    this.previewGen++;
    this.cleanupPreviewFile();
    this.previewWebview = null;
  }

  private async doExport() {
    this.settings.lastUsedThemeId = this.selectedTheme.id;

    // Keep proposing the note's own folder; lastOutputDir only feeds the
    // dialog-less quick export command.
    const noteDir = this.file.parent?.path || "";
    const defaultPath = path.join(getVaultBasePath(this.app), noteDir, this.file.basename + ".pdf");

    const result = await getElectronRemote().dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (result.canceled || !result.filePath) throw new Error("cancelled");

    this.settings.lastOutputDir = path.dirname(result.filePath);
    await this.saveSettings();

    const theme = this.getEffectiveTheme();
    await exportNoteToPdf({
      app: this.app,
      file: this.file,
      theme,
      coverInfoKeys: this.getCoverInfoKeys(),
      outputPath: result.filePath,
      assets: await this.assetCache.get(theme),
    });
    new Notice(`PDF exported → ${path.basename(result.filePath)}`);
  }
}
