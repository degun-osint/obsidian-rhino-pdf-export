import {
  App,
  Modal,
  Setting,
  MarkdownRenderer,
  TFile,
  TFolder,
  Notice,
  Component,
} from "obsidian";
import type { PdfTheme, PluginSettings } from "./types";
import { BUILTIN_THEMES } from "./themes";
import { buildHtml, buildMergedHtml, resolveImagePaths } from "./render";
import { generatePdf } from "./pdf";
import { parseThemeOverrides, applyThemeOverrides } from "./frontmatter";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function getElectronRemote(): any {
  const electron = require("electron");
  return electron.remote || (require("@electron/remote") ?? electron);
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

    contentEl.createEl("h2", { text: "Rhino PDF: Batch Export" });
    contentEl.createEl("p", {
      text: `${mdFiles.length} note${mdFiles.length > 1 ? "s" : ""} in "${this.folder.path || "/"}"`,
      cls: "setting-item-description",
    });

    const allThemes = [...BUILTIN_THEMES, ...this.settings.themes];

    new Setting(contentEl)
      .setName("Theme")
      .addDropdown((dd) => {
        allThemes.forEach((t) => dd.addOption(t.id, t.name));
        dd.setValue(this.selectedTheme.id);
        dd.onChange(async (val) => {
          this.selectedTheme = allThemes.find((t) => t.id === val) || allThemes[0];
          await this.updatePreview(mdFiles);
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
        toggle.onChange(async (val) => {
          this.recursive = val;
          const files = this.getMdFiles();
          // Update file count
          const desc = contentEl.querySelector(".setting-item-description");
          if (desc) {
            desc.textContent = `${files.length} note${files.length > 1 ? "s" : ""} in "${this.folder.path || "/"}"`;
          }
          await this.updatePreview(files);
        });
      });

    new Setting(contentEl)
      .setName("Subtitle override")
      .setDesc("Leave empty to use theme default")
      .addText((t) => {
        t.setPlaceholder(this.selectedTheme.subtitle || "(theme default)")
          .setValue(this.overrideSubtitle)
          .onChange(async (v) => {
            this.overrideSubtitle = v;
            await this.updatePreview(mdFiles);
          });
      });

    new Setting(contentEl)
      .setName("Footer text override")
      .setDesc("Leave empty to use theme default")
      .addText((t) => {
        t.setPlaceholder(this.selectedTheme.footerText || "(theme default)")
          .setValue(this.overrideFooterText)
          .onChange(async (v) => {
            this.overrideFooterText = v;
            await this.updatePreview(mdFiles);
          });
      });

    // Preview container
    const previewContainer = contentEl.createDiv("pdf-preview-container");
    previewContainer.style.cssText =
      "width:100%;height:300px;border:1px solid var(--background-modifier-border);border-radius:8px;overflow:hidden;margin:12px 0;background:var(--background-secondary);position:relative;";

    const loadingEl = previewContainer.createDiv("pdf-preview-loading");
    loadingEl.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px;";
    loadingEl.textContent = "Loading preview (1st note)…";

    // Progress bar
    const progressEl = contentEl.createDiv("batch-progress");
    progressEl.style.cssText = "margin:12px 0;display:none;";
    const progressBar = progressEl.createEl("progress");
    progressBar.style.cssText = "width:100%;height:6px;";
    const progressText = progressEl.createDiv();
    progressText.style.cssText = "font-size:12px;color:var(--text-muted);margin-top:4px;";

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
    this.initPreview(previewContainer, mdFiles);
  }

  onClose() {
    this.cleanupPreview();
    this.contentEl.empty();
  }

  private async initPreview(container: HTMLElement, mdFiles: TFile[]) {
    if (mdFiles.length === 0) return;

    const webview = document.createElement("webview") as any;
    webview.setAttribute("style", "width:100%;height:100%;border:none;");
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
    await MarkdownRenderer.render(this.app, mdContent, tempDiv, firstFile.path, component);
    const vaultBasePath = (this.app.vault.adapter as any).getBasePath();
    const bodyHtml = resolveImagePaths(tempDiv.innerHTML, vaultBasePath);
    component.unload();

    const logoDataUri = await this.loadLogoDataUri(theme.logoPath);
    const html = buildHtml(bodyHtml, title, theme, logoDataUri);

    this.cleanupPreviewFile();
    const tempFile = path.join(os.tmpdir(), `rhino-batch-preview-${Date.now()}.html`);
    fs.writeFileSync(tempFile, html, "utf-8");
    this.previewTempFile = tempFile;

    (this.previewWebview as any).setAttribute("src", `file://${tempFile}`);
  }

  private cleanupPreviewFile() {
    if (this.previewTempFile) {
      try { fs.unlinkSync(this.previewTempFile); } catch (_) {}
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
      defaultPath: (this.app.vault.adapter as any).getBasePath(),
      properties: ["openDirectory", "createDirectory"],
      title: "Choose output folder for PDFs",
    });
    if (result.canceled || !result.filePaths.length) return;
    const outputDir = result.filePaths[0];

    progressEl.style.display = "block";
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
      } catch (err: any) {
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
      (this.app.vault.adapter as any).getBasePath(),
      `${folderName}.pdf`
    );
    const result = await getElectronRemote().dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePath) return;

    progressEl.style.display = "block";
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
        await MarkdownRenderer.render(this.app, mdContent, tempDiv, file.path, component);
        const vaultBase = (this.app.vault.adapter as any).getBasePath();
        const bodyHtml = resolveImagePaths(tempDiv.innerHTML, vaultBase);
        component.unload();

        sections.push({ title, bodyHtml });
      } catch (err: any) {
        console.error(`Rhino PDF: render error ${file.path}:`, err);
      }
    }

    progressText.textContent = "Generating merged PDF…";

    const mergedTitle = folderName;
    const html = buildMergedHtml(sections, mergedTitle, theme, logoDataUri);
    await generatePdf(html, result.filePath);

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

    const effective = this.getEffectiveTheme();
    const overrides = parseThemeOverrides(mdContent);
    const theme = overrides
      ? applyThemeOverrides(effective, overrides)
      : effective;

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
    await MarkdownRenderer.render(this.app, mdContent, tempDiv, file.path, component);
    const vaultBase2 = (this.app.vault.adapter as any).getBasePath();
    const bodyHtml = resolveImagePaths(tempDiv.innerHTML, vaultBase2);
    component.unload();

    let logoDataUri = "";
    if (theme.logoPath) {
      logoDataUri = await this.loadLogoDataUri(theme.logoPath);
    }

    const html = buildHtml(bodyHtml, title, theme, logoDataUri);
    const pdfName = file.basename + ".pdf";
    const fullPath = path.join(outputDir, pdfName);

    await generatePdf(html, fullPath);
  }
}
