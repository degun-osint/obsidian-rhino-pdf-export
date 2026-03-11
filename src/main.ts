import { Plugin, TFile, TFolder, Notice, FileSystemAdapter } from "obsidian";
import type { PdfTheme, PluginSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { ThemedPdfSettingTab } from "./settings";
import { ExportModal } from "./modal";
import { BatchExportModal } from "./batch";
import { createBlankTheme } from "./themes";

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
                  () => this.saveSettings()
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
    // Save themes to separate file, keep only lastUsedThemeId in data.json
    await this.saveThemesFile(this.settings.themes);
    await this.saveData({
      lastUsedThemeId: this.settings.lastUsedThemeId,
    });
  }
}
