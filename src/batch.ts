import {
  App,
  Modal,
  Setting,
  MarkdownRenderer,
  TFile,
  TFolder,
  Notice,
  Component,
  FileSystemAdapter,
} from "obsidian";
import type { PdfTheme, PluginSettings } from "./types";
import { BUILTIN_THEMES } from "./themes";
import { buildHtml, buildMergedHtml, resolveImagePaths, makeDocVars, makePdfMetadata, applyPageBreaks } from "./render";
import { generatePdf } from "./pdf";
import { readDocConfig, resolveTheme } from "./frontmatter";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { ElectronRemote } from "electron";
import electron from "electron";

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
  private mergeMode = false;
  private overrideSubtitle = "";
  private overrideFooterText = "";
  private previewWebview: HTMLElement | null = null;
  private previewTempFile: string | null = null;
  private previewReady = false;
  private recursive = false;

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

    const allThemes = [...BUILTIN_THEMES, ...this.settings.themes];
    this.selectedTheme =
      allThemes.find((t) => t.id === this.settings.lastUsedThemeId) ||
      allThemes[0];
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("rhino-pdf-export-modal");

    const mdFiles = this.getMdFiles();

    new Setting(contentEl).setName("Batch export").setHeading();

    const descEl = contentEl.createEl("p", {
      text: `${mdFiles.length} note${mdFiles.length > 1 ? "s" : ""} in "${this.folder.path || "/"}"`,
      cls: "setting-item-description",
    });

    const allThemes = [...BUILTIN_THEMES, ...this.settings.themes];

    new Setting(contentEl)
      .setName("Theme")
      .addDropdown((dd) => {
        for (const t of allThemes) dd.addOption(t.id, t.name);
        dd.setValue(this.selectedTheme.id);
        dd.onChange((val) => {
          this.selectedTheme = allThemes.find((t) => t.id === val) || allThemes[0];
          void this.updatePreview(mdFiles);
        });
      });

    new Setting(contentEl)
      .setName("Merge into single PDF")
      .setDesc("Combine all notes into one PDF instead of one per note")
      .addToggle((toggle) => {
        toggle.setValue(this.mergeMode);
        toggle.onChange((val) => {
          this.mergeMode = val;
        });
      });

    new Setting(contentEl)
      .setName("Include subfolders")
      .setDesc("Recursively include notes from subfolders")
      .addToggle((toggle) => {
        toggle.setValue(this.recursive);
        toggle.onChange((val) => {
          this.recursive = val;
          const files = this.getMdFiles();
          descEl.textContent = `${files.length} note${files.length > 1 ? "s" : ""} in "${this.folder.path || "/"}"`;
          void this.updatePreview(files);
        });
      });

    new Setting(contentEl)
      .setName("Subtitle override")
      .setDesc("Leave empty to use theme default")
      .addText((t) => {
        t.setPlaceholder(this.selectedTheme.subtitle || "(theme default)")
          .setValue(this.overrideSubtitle)
          .onChange((v) => {
            this.overrideSubtitle = v;
            void this.updatePreview(mdFiles);
          });
      });

    new Setting(contentEl)
      .setName("Footer text override")
      .setDesc("Leave empty to use theme default")
      .addText((t) => {
        t.setPlaceholder(this.selectedTheme.footerText || "(theme default)")
          .setValue(this.overrideFooterText)
          .onChange((v) => {
            this.overrideFooterText = v;
            void this.updatePreview(mdFiles);
          });
      });

    // Preview container
    const previewContainer = contentEl.createDiv("pdf-preview-container");
    previewContainer.addClass("is-short");
    previewContainer.createDiv("pdf-preview-loading").textContent = "Loading preview (1st note)…";

    // Progress bar
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

    // Init preview with first file
    void this.initPreview(previewContainer, mdFiles);
  }

  onClose() {
    this.cleanupPreview();
    this.contentEl.empty();
  }

  private getVaultBasePath(): string {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      return adapter.getBasePath();
    }
    return "";
  }

  private async initPreview(container: HTMLElement, mdFiles: TFile[]) {
    if (mdFiles.length === 0) return;

    const webview = activeDocument.createElement("webview");
    webview.addClass("rhino-webview");
    webview.setAttribute("webpreferences", "javascript=yes");
    this.previewWebview = webview;
    container.empty();
    container.appendChild(webview);
    this.previewReady = true;
    await this.updatePreview(mdFiles);
  }

  private async updatePreview(mdFiles?: TFile[]) {
    if (!this.previewWebview || !this.previewReady) return;
    const files = mdFiles || this.getMdFiles();
    if (files.length === 0) return;

    const firstFile = files[0];
    const theme = this.getEffectiveTheme();

    const mdContent = await this.app.vault.cachedRead(firstFile);
    let title = firstFile.basename;
    for (const line of mdContent.split("\n")) {
      if (line.startsWith("# ")) {
        title = line.replace(/^#+\s*/, "").trim();
        break;
      }
    }

    const tempDiv = createDiv();
    const component = new Component();
    component.load();
    await MarkdownRenderer.render(this.app, applyPageBreaks(mdContent), tempDiv, firstFile.path, component);
    const vaultBasePath = this.getVaultBasePath();
    const bodyHtml = resolveImagePaths(tempDiv.innerHTML, vaultBasePath);
    component.unload();

    const logoDataUri = await this.loadLogoDataUri(theme.logoPath);
    const fm = this.app.metadataCache.getFileCache(firstFile)?.frontmatter ?? {};
    const vars = makeDocVars(title, firstFile.basename, fm);
    const html = buildHtml(bodyHtml, title, theme, logoDataUri, vars);

    this.cleanupPreviewFile();
    const tempFile = path.join(os.tmpdir(), `rhino-batch-preview-${Date.now()}.html`);
    fs.writeFileSync(tempFile, html, "utf-8");
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
    this.cleanupPreviewFile();
    this.previewWebview = null;
    this.previewReady = false;
  }

  private getEffectiveTheme(): PdfTheme {
    const theme = { ...this.selectedTheme };
    if (this.overrideSubtitle) theme.subtitle = this.overrideSubtitle;
    if (this.overrideFooterText) theme.footerText = this.overrideFooterText;
    return theme;
  }

  private async exportSeparate(
    mdFiles: TFile[],
    progressEl: HTMLElement,
    progressBar: HTMLProgressElement,
    progressText: HTMLElement
  ) {
    const result = await getElectronRemote().dialog.showOpenDialog({
      defaultPath: this.getVaultBasePath(),
      properties: ["openDirectory", "createDirectory"],
      title: "Choose output folder for PDFs",
    });
    if (result.canceled || !result.filePaths.length) return;
    const outputDir = result.filePaths[0];

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
      this.getVaultBasePath(),
      `${folderName}.pdf`
    );
    const result = await getElectronRemote().dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePath) return;

    progressEl.addClass("is-active");
    progressBar.max = mdFiles.length;

    const theme = this.getEffectiveTheme();
    const logoDataUri = await this.loadLogoDataUri(theme.logoPath);

    const sections: { title: string; bodyHtml: string }[] = [];

    for (let i = 0; i < mdFiles.length; i++) {
      const file = mdFiles[i];
      progressBar.value = i;
      progressText.textContent = `${i + 1}/${mdFiles.length} — ${file.basename}`;

      try {
        const mdContent = await this.app.vault.cachedRead(file);

        let title = file.basename;
        for (const line of mdContent.split("\n")) {
          if (line.startsWith("# ")) {
            title = line.replace(/^#+\s*/, "").trim();
            break;
          }
        }

        const tempDiv = createDiv();
        const component = new Component();
        component.load();
        await MarkdownRenderer.render(this.app, applyPageBreaks(mdContent), tempDiv, file.path, component);
        const vaultBase = this.getVaultBasePath();
        const bodyHtml = resolveImagePaths(tempDiv.innerHTML, vaultBase);
        component.unload();

        sections.push({ title, bodyHtml });
      } catch (err: unknown) {
        console.error(`Rhino PDF: render error ${file.path}:`, err);
      }
    }

    progressText.textContent = "Generating merged PDF…";

    const mergedTitle = folderName;
    const vars = makeDocVars(mergedTitle, folderName, {});
    const html = buildMergedHtml(sections, mergedTitle, theme, logoDataUri, vars);
    const meta = theme.includeMetadata ? makePdfMetadata(mergedTitle, {}) : undefined;
    await generatePdf(html, result.filePath, meta);

    progressBar.value = mdFiles.length;
    new Notice(`Merged PDF exported → ${path.basename(result.filePath)} (${sections.length} notes)`);
  }

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
    return files.sort((a, b) => a.basename.localeCompare(b.basename));
  }

  private async loadLogoDataUri(logoPath: string): Promise<string> {
    if (!logoPath) return "";
    const logoFile = this.app.vault.getAbstractFileByPath(logoPath);
    if (!logoFile || !(logoFile instanceof TFile)) return "";
    const data = await this.app.vault.readBinary(logoFile);
    const ext = logoPath.split(".").pop()?.toLowerCase() || "png";
    const mimeMap: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
      svg: "image/svg+xml", gif: "image/gif", webp: "image/webp",
    };
    const b64 = Buffer.from(data).toString("base64");
    return `data:${mimeMap[ext] || "image/png"};base64,${b64}`;
  }

  private async exportFile(file: TFile, outputDir: string) {
    const mdContent = await this.app.vault.cachedRead(file);

    const docConfig = readDocConfig(this.app, file);
    const theme = resolveTheme(this.getEffectiveTheme(), docConfig);

    let title = file.basename;
    for (const line of mdContent.split("\n")) {
      if (line.startsWith("# ")) {
        title = line.replace(/^#+\s*/, "").trim();
        break;
      }
    }

    const tempDiv = createDiv();
    const component = new Component();
    component.load();
    await MarkdownRenderer.render(this.app, applyPageBreaks(mdContent), tempDiv, file.path, component);
    const vaultBase = this.getVaultBasePath();
    const bodyHtml = resolveImagePaths(tempDiv.innerHTML, vaultBase);
    component.unload();

    let logoDataUri = "";
    if (theme.logoPath) {
      logoDataUri = await this.loadLogoDataUri(theme.logoPath);
    }

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const vars = makeDocVars(title, file.basename, fm);
    const html = buildHtml(bodyHtml, title, theme, logoDataUri, vars);
    const pdfName = file.basename + ".pdf";
    const fullPath = path.join(outputDir, pdfName);

    const meta = theme.includeMetadata ? makePdfMetadata(title, fm) : undefined;
    await generatePdf(html, fullPath, meta);
  }
}
