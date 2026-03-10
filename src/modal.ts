import {
  App,
  Modal,
  Setting,
  MarkdownRenderer,
  TFile,
  Notice,
  Component,
} from "obsidian";
import type { PdfTheme, PluginSettings } from "./types";
import { BUILTIN_THEMES } from "./themes";
import { buildHtml, resolveImagePaths } from "./render";
import { generatePdf } from "./pdf";
import { parseThemeOverrides, applyThemeOverrides } from "./frontmatter";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function getElectronRemote(): any {
  const electron = require("electron");
  return electron.remote || (require("@electron/remote") ?? electron);
}

export class ExportModal extends Modal {
  private settings: PluginSettings;
  private file: TFile;
  private saveSettings: () => Promise<void>;
  private selectedTheme: PdfTheme;
  private overrideSubtitle = "";
  private overrideFooterText = "";
  private previewWebview: HTMLElement | null = null;
  private previewTempFile: string | null = null;
  private cachedBodyHtml: string | null = null;
  private cachedTitle: string | null = null;
  private cachedLogoDataUris: Map<string, string> = new Map();
  private themeOverrides: Partial<PdfTheme> | null = null;

  constructor(
    app: App,
    file: TFile,
    settings: PluginSettings,
    saveSettings: () => Promise<void>
  ) {
    super(app);
    this.file = file;
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
    contentEl.createEl("h2", { text: "PDF Export" });

    const allThemes = [...BUILTIN_THEMES, ...this.settings.themes];

    new Setting(contentEl)
      .setName("Theme")
      .setDesc("Select the theme for export")
      .addDropdown((dd) => {
        allThemes.forEach((t) => dd.addOption(t.id, t.name));
        dd.setValue(this.selectedTheme.id);
        dd.onChange(async (val) => {
          this.selectedTheme = allThemes.find((t) => t.id === val) || allThemes[0];
          await this.updatePreview();
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
            await this.updatePreview();
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
            await this.updatePreview();
          });
      });

    // PDF preview container
    const previewContainer = contentEl.createDiv("pdf-preview-container");
    previewContainer.style.cssText =
      "width:100%;height:400px;border:1px solid var(--background-modifier-border);border-radius:8px;overflow:hidden;margin:12px 0;background:var(--background-secondary);position:relative;";

    const loadingEl = previewContainer.createDiv("pdf-preview-loading");
    loadingEl.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px;";
    loadingEl.textContent = "Loading preview…";

    new Setting(contentEl).addButton((btn) => {
      btn.setButtonText("Export").setCta().onClick(async () => {
        btn.setDisabled(true);
        btn.setButtonText("Exporting…");
        try {
          await this.doExport();
          this.close();
        } catch (err: any) {
          if (err.message !== "cancelled") {
            new Notice(`Export error: ${err.message}`);
          }
          btn.setDisabled(false);
          btn.setButtonText("Export");
        }
      });
    });

    this.initPreview(previewContainer);
  }

  onClose() {
    this.cleanupPreview();
    this.contentEl.empty();
  }

  private async initPreview(container: HTMLElement) {
    await this.prepareContent();
    const webview = document.createElement("webview") as any;
    webview.setAttribute("style", "width:100%;height:100%;border:none;");
    webview.setAttribute("webpreferences", "javascript=yes");
    this.previewWebview = webview;
    container.empty();
    container.appendChild(webview);
    await this.updatePreview();
  }

  private async prepareContent() {
    if (this.cachedBodyHtml !== null) return;

    const mdContent = await this.app.vault.cachedRead(this.file);

    this.themeOverrides = parseThemeOverrides(mdContent);

    let title = this.file.basename;
    for (const line of mdContent.split("\n")) {
      if (line.startsWith("# ")) {
        title = line.replace(/^#+\s*/, "").trim();
        break;
      }
    }
    this.cachedTitle = title;

    const tempDiv = createDiv();
    const component = new Component();
    component.load();
    await MarkdownRenderer.render(
      this.app,
      mdContent,
      tempDiv,
      this.file.path,
      component
    );
    const vaultBasePath = (this.app.vault.adapter as any).getBasePath();
    this.cachedBodyHtml = resolveImagePaths(tempDiv.innerHTML, vaultBasePath);
    component.unload();
  }

  private async getLogoDataUri(logoPath: string): Promise<string> {
    if (!logoPath) return "";
    if (this.cachedLogoDataUris.has(logoPath)) {
      return this.cachedLogoDataUris.get(logoPath)!;
    }
    const uri = await this.loadLogoAsDataUri(logoPath);
    this.cachedLogoDataUris.set(logoPath, uri);
    return uri;
  }

  private getEffectiveTheme(): PdfTheme {
    let theme = this.selectedTheme;
    if (this.themeOverrides) {
      theme = applyThemeOverrides(theme, this.themeOverrides);
    }
    // Apply modal-level overrides
    if (this.overrideSubtitle || this.overrideFooterText) {
      theme = { ...theme };
      if (this.overrideSubtitle) theme.subtitle = this.overrideSubtitle;
      if (this.overrideFooterText) theme.footerText = this.overrideFooterText;
    }
    return theme;
  }

  private async updatePreview() {
    if (!this.previewWebview || this.cachedBodyHtml === null) return;

    const theme = this.getEffectiveTheme();
    const logoDataUri = await this.getLogoDataUri(theme.logoPath);
    const html = buildHtml(this.cachedBodyHtml!, this.cachedTitle!, theme, logoDataUri);

    this.cleanupPreviewFile();
    const tempFile = path.join(os.tmpdir(), `rhino-preview-${Date.now()}.html`);
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
  }

  private async doExport() {
    this.settings.lastUsedThemeId = this.selectedTheme.id;
    await this.saveSettings();

    await this.prepareContent();

    // Native save dialog
    const vaultBasePath = (this.app.vault.adapter as any).getBasePath();
    const noteDir = this.file.parent?.path || "";
    const defaultPath = path.join(vaultBasePath, noteDir, this.file.basename + ".pdf");

    const result = await getElectronRemote().dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (result.canceled || !result.filePath) {
      throw new Error("cancelled");
    }

    const theme = this.getEffectiveTheme();
    const logoDataUri = await this.getLogoDataUri(theme.logoPath);
    const html = buildHtml(this.cachedBodyHtml!, this.cachedTitle!, theme, logoDataUri);

    await generatePdf(html, result.filePath);
    new Notice(`PDF exported → ${path.basename(result.filePath)}`);
  }

  private async loadLogoAsDataUri(logoPath: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(logoPath);
    if (!file || !(file instanceof TFile)) return "";

    const data = await this.app.vault.readBinary(file);
    const ext = logoPath.split(".").pop()?.toLowerCase() || "png";
    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      svg: "image/svg+xml",
      gif: "image/gif",
      webp: "image/webp",
    };
    const mime = mimeMap[ext] || "image/png";
    const b64 = Buffer.from(data).toString("base64");
    return `data:${mime};base64,${b64}`;
  }
}
