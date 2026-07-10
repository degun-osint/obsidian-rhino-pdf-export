import { Plugin, TFile, TFolder, Notice, FileSystemAdapter } from "obsidian";
import type { PdfTheme, PluginSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { ThemedPdfSettingTab } from "./settings";
import { ExportModal } from "./modal";
import { BatchExportModal } from "./batch";
import { BUILTIN_THEMES, createBlankTheme } from "./themes";
import { readDocConfig, resolveBaseTheme, resolveCoverInfoKeys, resolveTheme } from "./frontmatter";
import { AssetCache, exportNoteToPdf, getVaultBasePath } from "./export";
import * as path from "path";

export default class RhinoPdfExport extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "export-themed-pdf",
      name: "Export note as PDF",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) {
          new ExportModal(
            this.app,
            file,
            this.settings,
            () => this.saveSettings(),
            this.manifest.id
          ).open();
        }
        return true;
      },
    });

    this.addCommand({
      id: "export-themed-pdf-quick",
      name: "Export note as PDF with last settings",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.quickExport(file);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) => {
            item
              .setTitle("Export note as PDF")
              .setIcon("file-down")
              .onClick(() => {
                new ExportModal(
                  this.app,
                  file,
                  this.settings,
                  () => this.saveSettings(),
                  this.manifest.id
                ).open();
              });
          });
        }
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle("Export folder as PDF")
              .setIcon("folder-down")
              .onClick(() => {
                new BatchExportModal(
                  this.app,
                  file,
                  this.settings,
                  () => this.saveSettings()
                ).open();
              });
          });
        }
      })
    );

    this.addSettingTab(new ThemedPdfSettingTab(this.app, this));
  }

  /**
   * Export without opening the modal: the theme pinned by the note's
   * `rhino-pdf.theme`, else the last one used. Writes next to the note, or to
   * the last folder an export was sent to, overwriting any file of that name.
   */
  private async quickExport(file: TFile) {
    const allThemes: PdfTheme[] = [...BUILTIN_THEMES, ...this.settings.themes];
    const docConfig = readDocConfig(this.app, file);
    const fallback =
      allThemes.find((t) => t.id === this.settings.lastUsedThemeId) || allThemes[0];
    const base = resolveBaseTheme(allThemes, docConfig, fallback);

    const outputDir =
      this.settings.lastOutputDir ||
      path.join(getVaultBasePath(this.app), file.parent?.path ?? "");
    const outputPath = path.join(outputDir, file.basename + ".pdf");

    const notice = new Notice(`Exporting ${file.basename}…`, 0);
    try {
      const theme = resolveTheme(base, docConfig);
      await exportNoteToPdf({
        app: this.app,
        file,
        theme,
        coverInfoKeys: resolveCoverInfoKeys(base, docConfig),
        outputPath,
        assets: await new AssetCache(this.app).get(theme),
      });
      new Notice(`PDF exported → ${outputPath}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Export error: ${message}`);
    } finally {
      notice.hide();
    }
  }

  private get themesFilePath(): string {
    return `${this.app.vault.configDir}/rhino-pdf-themes.json`;
  }

  getVaultBasePath(): string {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      return adapter.getBasePath();
    }
    return "";
  }

  async loadSettings() {
    const saved = (await this.loadData()) as Partial<PluginSettings> | undefined;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {});

    // Load custom themes from separate file (survives plugin updates)
    const themes = await this.loadThemesFile();
    if (themes.length > 0) {
      this.settings.themes = themes;
    } else if (this.settings.themes.length > 0) {
      // Migrate: themes were in data.json, move them to separate file
      await this.saveThemesFile(this.settings.themes);
    } else {
      // Try migrating from old plugin ID
      await this.migrateFromOldPlugin();
    }

    // Merge each custom theme with defaults so new fields added in updates are present
    if (this.settings.themes.length > 0) {
      const defaults = createBlankTheme();
      this.settings.themes = this.settings.themes.map((t) => ({
        ...defaults,
        ...t,
        margins: { ...defaults.margins, ...t.margins },
        // Guard the collections: a hand-edited or truncated themes file must not
        // crash the settings tab on `.join()` / `.map()`.
        coverInfoFields: Array.isArray(t.coverInfoFields) ? t.coverInfoFields : [],
        customFonts: Array.isArray(t.customFonts) ? t.customFonts : [],
      }));
    }
  }

  private async loadThemesFile(): Promise<PdfTheme[]> {
    try {
      const adapter = this.app.vault.adapter;
      if (await adapter.exists(this.themesFilePath)) {
        const raw = await adapter.read(this.themesFilePath);
        const data = JSON.parse(raw) as unknown;
        if (Array.isArray(data)) return data as PdfTheme[];
      }
    } catch (err: unknown) {
      console.error("[Rhino PDF] Failed to load themes file:", err);
    }
    return [];
  }

  private async saveThemesFile(themes: PdfTheme[]): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      await adapter.write(this.themesFilePath, JSON.stringify(themes, null, 2));
    } catch (err: unknown) {
      console.error("[Rhino PDF] Failed to save themes file:", err);
    }
  }

  private async migrateFromOldPlugin() {
    const OLD_PLUGIN_IDS = ["themed-pdf-export"];
    for (const oldId of OLD_PLUGIN_IDS) {
      try {
        const adapter = this.app.vault.adapter;
        const oldDataPath = `${this.app.vault.configDir}/plugins/${oldId}/data.json`;
        if (await adapter.exists(oldDataPath)) {
          const raw = await adapter.read(oldDataPath);
          const oldData = JSON.parse(raw) as Record<string, unknown>;
          const oldThemes = oldData.themes as PdfTheme[] | undefined;
          if (oldThemes && oldThemes.length > 0) {
            this.settings.themes = oldThemes;
            if (oldData.lastUsedThemeId) {
              this.settings.lastUsedThemeId = oldData.lastUsedThemeId as string;
            }
            await this.saveThemesFile(oldThemes);
            await this.saveData(this.settings);
            new Notice(`Rhino PDF: migrated ${oldThemes.length} theme(s) from previous plugin version.`);
            break;
          }
        }
      } catch (err: unknown) {
        console.error(`[Rhino PDF] Migration error for plugin "${oldId}":`, err);
      }
    }
  }

  async saveSettings() {
    // Themes live in their own file; data.json keeps only the light preferences.
    await this.saveThemesFile(this.settings.themes);
    await this.saveData({
      lastUsedThemeId: this.settings.lastUsedThemeId,
      lastOutputDir: this.settings.lastOutputDir,
    });
  }
}
