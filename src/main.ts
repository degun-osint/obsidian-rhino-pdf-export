import { Plugin, MarkdownView, TFile, TFolder, Notice } from "obsidian";
import type { PdfTheme, PluginSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { ThemedPdfSettingTab } from "./settings";
import { ExportModal } from "./modal";
import { BatchExportModal } from "./batch";
import { createBlankTheme } from "./themes";

const THEMES_FILE = ".obsidian/rhino-pdf-themes.json";

export default class RhinoPdfExport extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "export-themed-pdf",
      name: "Rhino PDF: Export note",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) {
          new ExportModal(
            this.app,
            file,
            this.settings,
            () => this.saveSettings()
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
              .setTitle("Rhino PDF: Export note")
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
              .setTitle("Rhino PDF: Export folder")
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

  async loadSettings() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);

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
      const adapter = this.app.vault.adapter as any;
      if (await adapter.exists(THEMES_FILE)) {
        const raw = await adapter.read(THEMES_FILE);
        const data = JSON.parse(raw);
        if (Array.isArray(data)) return data;
      }
    } catch (err) {
      console.error("[Rhino PDF] Failed to load themes file:", err);
    }
    return [];
  }

  private async saveThemesFile(themes: PdfTheme[]): Promise<void> {
    try {
      const adapter = this.app.vault.adapter as any;
      await adapter.write(THEMES_FILE, JSON.stringify(themes, null, 2));
    } catch (err) {
      console.error("[Rhino PDF] Failed to save themes file:", err);
    }
  }

  private async migrateFromOldPlugin() {
    const OLD_PLUGIN_IDS = ["themed-pdf-export"];
    for (const oldId of OLD_PLUGIN_IDS) {
      try {
        const adapter = this.app.vault.adapter as any;
        const oldDataPath = `.obsidian/plugins/${oldId}/data.json`;
        if (await adapter.exists(oldDataPath)) {
          const raw = await adapter.read(oldDataPath);
          const oldData = JSON.parse(raw);
          if (oldData.themes && oldData.themes.length > 0) {
            this.settings.themes = oldData.themes;
            if (oldData.lastUsedThemeId) {
              this.settings.lastUsedThemeId = oldData.lastUsedThemeId;
            }
            await this.saveThemesFile(oldData.themes);
            await this.saveData(this.settings);
            new Notice(`Rhino PDF: migrated ${oldData.themes.length} theme(s) from previous plugin version.`);
            break;
          }
        }
      } catch (err) {
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
