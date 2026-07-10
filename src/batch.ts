import {
  App,
  Modal,
  Setting,
  TFile,
  TFolder,
  Notice,
} from "obsidian";
import type { DocConfig, PdfTheme, PluginSettings } from "./types";
import { BUILTIN_THEMES } from "./themes";
import {
  buildHtml,
  buildMergedHtml,
  makeDocVars,
  makePdfMetadata,
  coverInfoRows,
  type MergedSection,
} from "./render";
import { generatePdf } from "./pdf";
import { readDocConfig, resolveBaseTheme, resolveCoverInfoKeys, resolveTheme } from "./frontmatter";
import {
  AssetCache,
  exportNoteToPdf,
  extractTitle,
  getVaultBasePath,
  renderNoteHtml,
} from "./export";
import { createDocConfigState, renderDocConfigSection, type DocConfigState, type DocField } from "./doc-config-ui";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { ElectronRemote } from "electron";
import electron from "electron";

/**
 * Same overrides as the single-note modal, minus the cover info block: there is
 * no single note to read frontmatter keys from.
 */
const BATCH_FIELDS: DocField[] = [
  "subtitle",
  "showCover",
  "showToc",
  "headerText",
  "footerText",
  "watermarkText",
  "classificationText",
];

const EMPTY_DOC_CONFIG: DocConfig = { overrides: {}, ignoredKeys: [] };
const PREVIEW_DEBOUNCE_MS = 250;

function getElectronRemote(): ElectronRemote {
  const remote = electron.remote;
  if (remote) return remote;
  return electron as unknown as ElectronRemote;
}

export class BatchExportModal extends Modal {
  private settings: PluginSettings;
  private folder: TFolder;
  private saveSettings: () => Promise<void>;
  private selectedTheme: PdfTheme;
  private state: DocConfigState = createDocConfigState();
  private mergeMode = false;
  private recursive = false;
  private docConfigEl: HTMLElement | null = null;
  private docConfigOpen = false;
  private previewWebview: HTMLElement | null = null;
  private previewTempFile: string | null = null;
  private previewTimer: number | null = null;
  private previewGen = 0;
  private assetCache: AssetCache;

  constructor(
    app: App,
    folder: TFolder,
    settings: PluginSettings,
    saveSettings: () => Promise<void>
  ) {
    super(app);
    this.folder = folder;
    this.settings = settings;
    this.saveSettings = saveSettings;
    this.assetCache = new AssetCache(app);

    const allThemes = this.allThemes();
    this.selectedTheme =
      allThemes.find((t) => t.id === this.settings.lastUsedThemeId) || allThemes[0];
  }

  private allThemes(): PdfTheme[] {
    return [...BUILTIN_THEMES, ...this.settings.themes];
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("rhino-pdf-export-modal");

    const mdFiles = this.getMdFiles();

    new Setting(contentEl).setName("Batch export").setHeading();

    const descEl = contentEl.createEl("p", {
      text: this.fileCountLabel(mdFiles.length),
      cls: "setting-item-description",
    });

    const allThemes = this.allThemes();

    new Setting(contentEl)
      .setName("Theme")
      .addDropdown((dd) => {
        for (const t of allThemes) dd.addOption(t.id, t.name);
        dd.setValue(this.selectedTheme.id);
        dd.onChange((val) => {
          this.selectedTheme = allThemes.find((t) => t.id === val) || allThemes[0];
          this.renderDocConfig();
          this.schedulePreview();
        });
      });

    new Setting(contentEl)
      .setName("Merge into single PDF")
      .setDesc("Combine all notes into one PDF instead of one per note")
      .addToggle((toggle) => {
        toggle.setValue(this.mergeMode).onChange((val) => {
          this.mergeMode = val;
        });
      });

    new Setting(contentEl)
      .setName("Include subfolders")
      .setDesc("Recursively include notes from subfolders")
      .addToggle((toggle) => {
        toggle.setValue(this.recursive).onChange((val) => {
          this.recursive = val;
          descEl.textContent = this.fileCountLabel(this.getMdFiles().length);
          this.schedulePreview();
        });
      });

    this.docConfigEl = contentEl.createDiv();
    this.renderDocConfig();

    const previewContainer = contentEl.createDiv("pdf-preview-container");
    previewContainer.addClass("is-short");
    previewContainer.createDiv("pdf-preview-loading").textContent = "Loading preview (1st note)…";

    const progressEl = contentEl.createDiv("batch-progress");
    const progressBar = progressEl.createEl("progress");
    const progressText = progressEl.createDiv("batch-progress-text");

    new Setting(contentEl).addButton((btn) => {
      btn.setButtonText(`Export ${mdFiles.length} notes`).setCta().onClick(async () => {
        const currentFiles = this.getMdFiles();
        if (currentFiles.length === 0) {
          new Notice("No .md files in this folder.");
          return;
        }

        btn.setDisabled(true);
        this.settings.lastUsedThemeId = this.selectedTheme.id;
        await this.saveSettings();

        if (this.mergeMode) {
          await this.exportMerged(currentFiles, progressEl, progressBar, progressText);
        } else {
          await this.exportSeparate(currentFiles, progressEl, progressBar, progressText);
        }

        this.close();
      });
    });

    void this.initPreview(previewContainer);
  }

  onClose() {
    this.cleanupPreview();
    this.contentEl.empty();
  }

  private fileCountLabel(count: number): string {
    return `${count} note${count > 1 ? "s" : ""} in "${this.folder.path || "/"}"`;
  }

  private renderDocConfig() {
    if (!this.docConfigEl) return;
    this.docConfigEl.empty();
    renderDocConfigSection({
      container: this.docConfigEl,
      app: this.app,
      file: null,
      baseTheme: this.selectedTheme,
      docConfig: EMPTY_DOC_CONFIG,
      state: this.state,
      fields: BATCH_FIELDS,
      open: this.docConfigOpen,
      onToggle: (open) => { this.docConfigOpen = open; },
      onChange: () => this.schedulePreview(),
    });
  }

  /** Theme used for the shared stylesheet and for notes without frontmatter. */
  private getEffectiveTheme(): PdfTheme {
    return resolveTheme(this.selectedTheme, EMPTY_DOC_CONFIG, this.state.edits);
  }

  /**
   * Resolve one note against the batch overrides. Precedence matches the
   * single-note modal: what you typed in this dialog wins over the note's
   * frontmatter, which wins over the theme.
   */
  private resolveForFile(file: TFile): { theme: PdfTheme; docConfig: DocConfig } {
    const docConfig = readDocConfig(this.app, file);
    const base = resolveBaseTheme(this.allThemes(), docConfig, this.selectedTheme);
    return { theme: resolveTheme(base, docConfig, this.state.edits), docConfig };
  }

  private async initPreview(container: HTMLElement) {
    const mdFiles = this.getMdFiles();
    if (mdFiles.length === 0) return;

    // createEl has no key for Electron's <webview>; it is an HTMLElement at runtime.
    const webview = createEl("webview" as "div");
    webview.addClass("rhino-webview");
    webview.setAttribute("webpreferences", "javascript=yes");
    this.previewWebview = webview;
    container.empty();
    container.appendChild(webview);
    await this.updatePreview();
  }

  private schedulePreview() {
    if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null;
      void this.updatePreview();
    }, PREVIEW_DEBOUNCE_MS);
  }

  private async updatePreview() {
    if (!this.previewWebview) return;
    const files = this.getMdFiles();
    if (files.length === 0) return;

    const gen = ++this.previewGen;
    const firstFile = files[0];
    const { theme, docConfig } = this.resolveForFile(firstFile);

    const mdContent = await this.app.vault.cachedRead(firstFile);
    if (gen !== this.previewGen) return;

    const title = extractTitle(mdContent, firstFile.basename);
    const bodyHtml = await renderNoteHtml(this.app, mdContent, firstFile.path);
    const assets = await this.assetCache.get(theme, false);
    if (gen !== this.previewGen) return;

    const fm = this.app.metadataCache.getFileCache(firstFile)?.frontmatter ?? {};
    const vars = makeDocVars(title, firstFile.basename, fm);
    const coverInfo = coverInfoRows(fm, resolveCoverInfoKeys(theme, docConfig));
    const html = buildHtml(bodyHtml, title, theme, assets, vars, coverInfo);

    const tempFile = path.join(os.tmpdir(), `rhino-batch-preview-${gen}-${Date.now()}.html`);
    fs.writeFileSync(tempFile, html, "utf-8");

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

  private async exportSeparate(
    mdFiles: TFile[],
    progressEl: HTMLElement,
    progressBar: HTMLProgressElement,
    progressText: HTMLElement
  ) {
    const result = await getElectronRemote().dialog.showOpenDialog({
      defaultPath: this.settings.lastOutputDir || getVaultBasePath(this.app),
      properties: ["openDirectory", "createDirectory"],
      title: "Choose output folder for PDFs",
    });
    if (result.canceled || !result.filePaths.length) return;
    const outputDir = result.filePaths[0];

    this.settings.lastOutputDir = outputDir;
    await this.saveSettings();

    progressEl.addClass("is-active");
    progressBar.max = mdFiles.length;

    let success = 0;
    let errors = 0;

    for (let i = 0; i < mdFiles.length; i++) {
      const file = mdFiles[i];
      progressBar.value = i;
      progressText.textContent = `${i + 1}/${mdFiles.length} — ${file.basename}`;

      try {
        await this.exportFile(file, outputDir);
        success++;
      } catch (err: unknown) {
        errors++;
        console.error(`Rhino PDF: export error ${file.path}:`, err);
      }
    }

    progressBar.value = mdFiles.length;
    new Notice(
      `Batch export done: ${success} PDF${success > 1 ? "s" : ""} generated` +
      (errors > 0 ? `, ${errors} error${errors > 1 ? "s" : ""}` : "")
    );
  }

  private async exportMerged(
    mdFiles: TFile[],
    progressEl: HTMLElement,
    progressBar: HTMLProgressElement,
    progressText: HTMLElement
  ) {
    const folderName = this.folder.name || "vault";
    const defaultPath = path.join(
      this.settings.lastOutputDir || getVaultBasePath(this.app),
      `${folderName}.pdf`
    );
    const result = await getElectronRemote().dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePath) return;

    this.settings.lastOutputDir = path.dirname(result.filePath);
    await this.saveSettings();

    progressEl.addClass("is-active");
    progressBar.max = mdFiles.length;

    const theme = this.getEffectiveTheme();
    const assets = await this.assetCache.get(theme);

    const sections: MergedSection[] = [];

    for (let i = 0; i < mdFiles.length; i++) {
      const file = mdFiles[i];
      progressBar.value = i;
      progressText.textContent = `${i + 1}/${mdFiles.length} — ${file.basename}`;

      try {
        const mdContent = await this.app.vault.cachedRead(file);
        const title = extractTitle(mdContent, file.basename);
        const bodyHtml = await renderNoteHtml(this.app, mdContent, file.path);

        // A merged PDF has one stylesheet, so only the per-note page breaks can
        // vary; colors, fonts and margins come from the batch theme.
        const noteTheme = resolveTheme(theme, readDocConfig(this.app, file));
        sections.push({
          title,
          bodyHtml,
          pageBreaks: {
            h1: noteTheme.pageBreakBeforeH1,
            h2: noteTheme.pageBreakBeforeH2,
            h3: noteTheme.pageBreakBeforeH3,
          },
        });
      } catch (err: unknown) {
        console.error(`Rhino PDF: render error ${file.path}:`, err);
      }
    }

    progressText.textContent = "Generating merged PDF…";

    const mergedTitle = folderName;
    const vars = makeDocVars(mergedTitle, folderName, {});
    const html = buildMergedHtml(sections, mergedTitle, theme, assets, vars);
    const meta = theme.includeMetadata ? makePdfMetadata(mergedTitle, {}) : undefined;
    await generatePdf(html, result.filePath, meta);

    progressBar.value = mdFiles.length;
    new Notice(`Merged PDF exported → ${path.basename(result.filePath)} (${sections.length} notes)`);
  }

  /**
   * Notes sort by their `rhino-pdf.order` frontmatter key, then alphabetically.
   * Without one they come last, preserving the previous behaviour.
   */
  private getMdFiles(): TFile[] {
    const files: TFile[] = [];
    const collect = (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFile && child.extension === "md") {
          files.push(child);
        } else if (this.recursive && child instanceof TFolder) {
          collect(child);
        }
      }
    };
    collect(this.folder);

    const orders = new Map<string, number>();
    for (const f of files) {
      orders.set(f.path, readDocConfig(this.app, f).order ?? Number.POSITIVE_INFINITY);
    }

    return files.sort((a, b) => {
      const oa = orders.get(a.path)!;
      const ob = orders.get(b.path)!;
      if (oa !== ob) return oa < ob ? -1 : 1;
      return a.basename.localeCompare(b.basename);
    });
  }

  private async exportFile(file: TFile, outputDir: string) {
    const { theme, docConfig } = this.resolveForFile(file);
    await exportNoteToPdf({
      app: this.app,
      file,
      theme,
      coverInfoKeys: resolveCoverInfoKeys(theme, docConfig),
      outputPath: path.join(outputDir, file.basename + ".pdf"),
      // Cached per logo+font configuration, so a folder of notes sharing a
      // theme reads each font file once and warns at most once.
      assets: await this.assetCache.get(theme),
    });
  }
}
