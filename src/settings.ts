import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type RhinoPdfExport from "./main";
import type { PdfTheme } from "./types";
import { BUILTIN_THEMES, createBlankTheme } from "./themes";

export class ThemedPdfSettingTab extends PluginSettingTab {
  plugin: RhinoPdfExport;

  constructor(app: App, plugin: RhinoPdfExport) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("PDF export").setHeading();

    // --- Built-in themes ---
    new Setting(containerEl).setName("Built-in themes").setHeading();
    for (const theme of BUILTIN_THEMES) {
      this.renderThemeRow(containerEl, theme, true);
    }

    // --- Custom themes ---
    new Setting(containerEl).setName("Custom themes").setHeading();

    if (this.plugin.settings.themes.length === 0) {
      containerEl.createEl("p", {
        text: "No custom themes yet.",
        cls: "setting-item-description",
      });
    }

    for (const theme of this.plugin.settings.themes) {
      this.renderThemeRow(containerEl, theme, false);
    }

    new Setting(containerEl)
      .addButton((btn) => {
        btn.setButtonText("New theme").onClick(async () => {
          const newTheme = createBlankTheme();
          this.plugin.settings.themes.push(newTheme);
          await this.plugin.saveSettings();
          this.display();
        });
      })
      .addButton((btn) => {
        btn.setButtonText("Import JSON").onClick(() => {
          this.importThemeFromJson();
        });
      });
  }

  private renderThemeRow(
    containerEl: HTMLElement,
    theme: PdfTheme,
    isBuiltin: boolean
  ) {
    const row = new Setting(containerEl)
      .setName(theme.name)
      .setDesc(
        `${theme.primaryColor} / ${theme.accentColor}` +
          (theme.showCover ? " · cover" : "") +
          (theme.showLegal ? " · legal notice" : "")
      );

    const colorPreview = createSpan({ cls: "theme-colors-preview" });
    const swatch1 = colorPreview.createSpan({ cls: "rhino-color-swatch" });
    swatch1.setCssStyles({ backgroundColor: theme.primaryColor });
    const swatch2 = colorPreview.createSpan({ cls: "rhino-color-swatch" });
    swatch2.setCssStyles({ backgroundColor: theme.accentColor });
    row.nameEl.prepend(colorPreview);

    row.addButton((btn) => {
      btn.setIcon("download").setTooltip("Export as JSON").onClick(() => {
        this.exportThemeToJson(theme);
      });
    });

    if (!isBuiltin) {
      row.addButton((btn) => {
        btn.setButtonText("Edit").onClick(() => {
          this.openThemeEditor(theme);
        });
      });
      row.addButton((btn) => {
        btn.setIcon("trash").setWarning().onClick(async () => {
          this.plugin.settings.themes = this.plugin.settings.themes.filter(
            (t) => t.id !== theme.id
          );
          await this.plugin.saveSettings();
          this.display();
        });
      });
    }
  }

  private openThemeEditor(theme: PdfTheme) {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName(`Edit: ${theme.name}`).setHeading();

    new Setting(containerEl).addButton((btn) => {
      btn.setButtonText("Back").onClick(() => this.display());
    });

    new Setting(containerEl)
      .setName("Theme name")
      .addText((t) => {
        t.setValue(theme.name).onChange(async (v) => {
          theme.name = v;
          await this.plugin.saveSettings();
        });
      });

    // Colors
    new Setting(containerEl)
      .setName("Primary color")
      .addText((t) => {
        t.inputEl.type = "color";
        t.setValue(theme.primaryColor).onChange(async (v) => {
          theme.primaryColor = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Accent color")
      .addText((t) => {
        t.inputEl.type = "color";
        t.setValue(theme.accentColor).onChange(async (v) => {
          theme.accentColor = v;
          await this.plugin.saveSettings();
        });
      });

    // Logo
    new Setting(containerEl)
      .setName("Logo")
      .setDesc("Relative path in vault (e.g. assets/logo.png)")
      .addText((t) => {
        t.setPlaceholder("assets/logo.png")
          .setValue(theme.logoPath)
          .onChange(async (v) => {
            theme.logoPath = v.trim();
            await this.plugin.saveSettings();
          });
      });

    // Cover page
    new Setting(containerEl)
      .setName("Cover page")
      .addToggle((t) => {
        t.setValue(theme.showCover).onChange(async (v) => {
          theme.showCover = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Table of contents")
      .setDesc("Auto-generated from h2/h3 headings, after the cover page")
      .addToggle((t) => {
        t.setValue(theme.showToc).onChange(async (v) => {
          theme.showToc = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Table of contents title")
      .setDesc("Heading displayed above the table of contents")
      .addText((t) => {
        t.setValue(theme.tocTitle).onChange(async (v) => {
          theme.tocTitle = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Subtitle")
      .addText((t) => {
        t.setValue(theme.subtitle).onChange(async (v) => {
          theme.subtitle = v;
          await this.plugin.saveSettings();
        });
      });

    // Header
    new Setting(containerEl)
      .setName("Header logo (page 2+)")
      .addToggle((t) => {
        t.setValue(theme.showHeaderLogo).onChange(async (v) => {
          theme.showHeaderLogo = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Header logo height")
      .addText((t) => {
        t.setValue(theme.headerLogoHeight).onChange(async (v) => {
          theme.headerLogoHeight = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Header text")
      .setDesc("Variables: {title}, {filename}, {author}, {date}, {time}, {fm.key}")
      .addText((t) => {
        t.setPlaceholder("{title}")
          .setValue(theme.headerText)
          .onChange(async (v) => {
            theme.headerText = v;
            await this.plugin.saveSettings();
          });
      });

    // Footer
    new Setting(containerEl)
      .setName("Pagination")
      .addToggle((t) => {
        t.setValue(theme.showPagination).onChange(async (v) => {
          theme.showPagination = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Footer text")
      .setDesc("Variables: {title}, {filename}, {author}, {date}, {time}, {fm.key}")
      .addText((t) => {
        t.setValue(theme.footerText).onChange(async (v) => {
          theme.footerText = v;
          await this.plugin.saveSettings();
        });
      });

    // Legal notice
    new Setting(containerEl)
      .setName("Legal notice")
      .addToggle((t) => {
        t.setValue(theme.showLegal).onChange(async (v) => {
          theme.showLegal = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Legal notice title")
      .addText((t) => {
        t.setValue(theme.legalTitle).onChange(async (v) => {
          theme.legalTitle = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Legal notice text")
      .setClass("rhino-textarea-wide")
      .addTextArea((t) => {
        t.setValue(theme.legalText).onChange(async (v) => {
          theme.legalText = v;
          await this.plugin.saveSettings();
        });
        t.inputEl.rows = 6;
      });

    new Setting(containerEl)
      .setName("PDF metadata")
      .setDesc("Write title/author/subject/keywords into the PDF properties (from frontmatter)")
      .addToggle((t) => {
        t.setValue(theme.includeMetadata).onChange(async (v) => {
          theme.includeMetadata = v;
          await this.plugin.saveSettings();
        });
      });

    // Classification banner
    new Setting(containerEl).setName("Classification banner").setHeading();

    new Setting(containerEl)
      .setName("Classification text")
      .setDesc("Centered on every page (incl. cover). Leave empty to disable. Variables: {title}, {filename}, {author}, {date}, {time}, {fm.key}.")
      .addText((t) => {
        t.setPlaceholder("RESTRICTED")
          .setValue(theme.classificationText)
          .onChange(async (v) => {
            theme.classificationText = v;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Classification color")
      .addText((t) => {
        t.inputEl.type = "color";
        t.setValue(theme.classificationColor).onChange(async (v) => {
          theme.classificationColor = v;
          await this.plugin.saveSettings();
        });
      });

    // Watermark
    new Setting(containerEl).setName("Watermark").setHeading();

    new Setting(containerEl)
      .setName("Watermark text")
      .setDesc("Leave empty to disable")
      .addText((t) => {
        t.setPlaceholder("DRAFT")
          .setValue(theme.watermarkText)
          .onChange(async (v) => {
            theme.watermarkText = v;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Watermark color")
      .addText((t) => {
        t.inputEl.type = "color";
        t.setValue(theme.watermarkColor).onChange(async (v) => {
          theme.watermarkColor = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Watermark opacity")
      .setDesc("0 = invisible, 1 = fully opaque")
      .addText((t) => {
        t.setValue(String(theme.watermarkOpacity)).onChange(async (v) => {
          const n = parseFloat(v);
          if (!isNaN(n) && n >= 0 && n <= 1) {
            theme.watermarkOpacity = n;
            await this.plugin.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName("Watermark font size")
      .addText((t) => {
        t.setValue(theme.watermarkFontSize).onChange(async (v) => {
          theme.watermarkFontSize = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Watermark rotation")
      .setDesc("In degrees, e.g. -45")
      .addText((t) => {
        t.setValue(String(theme.watermarkRotation)).onChange(async (v) => {
          const n = parseFloat(v);
          if (!isNaN(n)) {
            theme.watermarkRotation = n;
            await this.plugin.saveSettings();
          }
        });
      });

    // Typography
    new Setting(containerEl).setName("Typography").setHeading();

    new Setting(containerEl)
      .setName("Body font")
      .addText((t) => {
        t.setValue(theme.bodyFont).onChange(async (v) => {
          theme.bodyFont = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Code font")
      .addText((t) => {
        t.setValue(theme.codeFont).onChange(async (v) => {
          theme.codeFont = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Font size")
      .addText((t) => {
        t.setValue(theme.bodyFontSize).onChange(async (v) => {
          theme.bodyFontSize = v;
          await this.plugin.saveSettings();
        });
      });

    // Page layout
    new Setting(containerEl).setName("Page layout").setHeading();

    new Setting(containerEl)
      .setName("Page size")
      .addDropdown((dd) => {
        dd.addOption("A4", "A4");
        dd.addOption("Letter", "Letter");
        dd.addOption("Legal", "Legal");
        dd.setValue(theme.pageSize).onChange(async (v) => {
          theme.pageSize = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Orientation")
      .addDropdown((dd) => {
        dd.addOption("portrait", "Portrait");
        dd.addOption("landscape", "Landscape");
        dd.setValue(theme.orientation || "portrait").onChange(async (v) => {
          theme.orientation = v as "portrait" | "landscape";
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Margins (top, right, bottom, left)")
      .setDesc("CSS values, e.g. 25mm")
      .setClass("rhino-margin-input")
      .addText((t) => {
        t.setValue(
          `${theme.margins.top}, ${theme.margins.right}, ${theme.margins.bottom}, ${theme.margins.left}`
        ).onChange(async (v) => {
          const parts = v.split(",").map((s) => s.trim());
          if (parts.length === 4) {
            theme.margins = {
              top: parts[0],
              right: parts[1],
              bottom: parts[2],
              left: parts[3],
            };
            await this.plugin.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName("Page break before headings")
      .setDesc("Start a new page before each heading of the selected level(s)");

    new Setting(containerEl)
      .setName("Before heading 1")
      .addToggle((t) => {
        t.setValue(theme.pageBreakBeforeH1).onChange(async (v) => {
          theme.pageBreakBeforeH1 = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Before heading 2")
      .addToggle((t) => {
        t.setValue(theme.pageBreakBeforeH2).onChange(async (v) => {
          theme.pageBreakBeforeH2 = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Before heading 3")
      .addToggle((t) => {
        t.setValue(theme.pageBreakBeforeH3).onChange(async (v) => {
          theme.pageBreakBeforeH3 = v;
          await this.plugin.saveSettings();
        });
      });
  }

  private exportThemeToJson(theme: PdfTheme) {
    const exportData: Record<string, unknown> = { ...theme };
    delete exportData.builtin;

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = activeDocument.createElement("a");
    a.href = url;
    a.download = `${theme.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private importThemeFromJson() {
    const input = activeDocument.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;

      void file.text().then((text) => {
        try {
          const data = JSON.parse(text) as Record<string, unknown>;

          if (!data.name || !data.primaryColor) {
            new Notice("Invalid theme JSON: missing name or primary color.");
            return;
          }

          const blank = createBlankTheme();
          const imported: PdfTheme = {
            ...blank,
            ...(data as Partial<PdfTheme>),
            id: "custom-" + Date.now(),
            margins: { ...blank.margins, ...((data.margins as Record<string, string>) || {}) },
          };
          delete (imported as unknown as Record<string, unknown>).builtin;

          this.plugin.settings.themes.push(imported);
          void this.plugin.saveSettings().then(() => {
            this.display();
            new Notice(`Theme "${imported.name}" imported.`);
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          new Notice(`Import error: ${message}`);
        }
      });
    });
    input.click();
  }
}
