import { App, DropdownComponent, Notice, PluginSettingTab, Setting, TextComponent, TFile, TFolder } from "obsidian";
import type RhinoPdfExport from "./main";
import type { CustomFont, PdfTheme } from "./types";
import { BUILTIN_THEMES, createBlankTheme, duplicateTheme } from "./themes";
import { isCssLength, isFontFamily, isFontWeight } from "./frontmatter";
import { readFontMetadata } from "./font-meta";
import { FontFileSuggest, FontFolderModal, fontFilesIn, readFontFiles } from "./font-picker";

const PAGE_SIZES = ["A3", "A4", "A5", "Letter", "Legal", "Tabloid"];
const MARGIN_SIDES = ["top", "right", "bottom", "left"] as const;

type Getter<T> = () => T;
type Setter<T> = (value: T) => void;

export class ThemedPdfSettingTab extends PluginSettingTab {
  plugin: RhinoPdfExport;

  constructor(app: App, plugin: RhinoPdfExport) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // --- Setting builders -----------------------------------------------------
  // The editor holds ~30 fields; without these each one is an eight-line block.

  private save(): void {
    void this.plugin.saveSettings();
  }

  private addText(
    c: HTMLElement,
    name: string,
    get: Getter<string>,
    set: Setter<string>,
    opts: { desc?: string; placeholder?: string; cls?: string } = {}
  ): Setting {
    const setting = new Setting(c).setName(name);
    if (opts.desc) setting.setDesc(opts.desc);
    if (opts.cls) setting.setClass(opts.cls);
    setting.addText((t) => {
      if (opts.placeholder) t.setPlaceholder(opts.placeholder);
      t.setValue(get()).onChange((v) => {
        set(v);
        this.save();
      });
    });
    return setting;
  }

  /** A CSS length input that flags an unusable value instead of dropping it. */
  private addLength(
    c: HTMLElement,
    name: string,
    get: Getter<string>,
    set: Setter<string>,
    opts: { desc?: string } = {}
  ): Setting {
    const setting = new Setting(c).setName(name);
    if (opts.desc) setting.setDesc(opts.desc);
    setting.addText((t) => {
      t.setPlaceholder("12mm");
      t.setValue(get()).onChange((v) => {
        const valid = isCssLength(v);
        t.inputEl.toggleClass("rhino-invalid", !valid);
        if (!valid) return;
        set(v.trim());
        this.save();
      });
    });
    return setting;
  }

  private addTextArea(
    c: HTMLElement,
    name: string,
    get: Getter<string>,
    set: Setter<string>,
    opts: { desc?: string; rows?: number } = {}
  ): Setting {
    const setting = new Setting(c).setName(name).setClass("rhino-textarea-wide");
    if (opts.desc) setting.setDesc(opts.desc);
    setting.addTextArea((t) => {
      t.setValue(get()).onChange((v) => {
        set(v);
        this.save();
      });
      t.inputEl.rows = opts.rows ?? 6;
    });
    return setting;
  }

  private addColor(
    c: HTMLElement,
    name: string,
    get: Getter<string>,
    set: Setter<string>,
    opts: { desc?: string } = {}
  ): Setting {
    const setting = new Setting(c).setName(name);
    if (opts.desc) setting.setDesc(opts.desc);
    setting.addText((t: TextComponent) => {
      t.inputEl.type = "color";
      t.setValue(get()).onChange((v) => {
        set(v);
        this.save();
      });
    });
    return setting;
  }

  private addToggle(
    c: HTMLElement,
    name: string,
    get: Getter<boolean>,
    set: Setter<boolean>,
    opts: { desc?: string } = {}
  ): Setting {
    const setting = new Setting(c).setName(name);
    if (opts.desc) setting.setDesc(opts.desc);
    setting.addToggle((t) => {
      t.setValue(get()).onChange((v) => {
        set(v);
        this.save();
      });
    });
    return setting;
  }

  private addSlider(
    c: HTMLElement,
    name: string,
    get: Getter<number>,
    set: Setter<number>,
    limits: { min: number; max: number; step: number },
    opts: { desc?: string } = {}
  ): Setting {
    const setting = new Setting(c).setName(name);
    if (opts.desc) setting.setDesc(opts.desc);
    setting.addSlider((s) => {
      s.setLimits(limits.min, limits.max, limits.step)
        .setValue(get())
        .setDynamicTooltip()
        .onChange((v) => {
          set(v);
          this.save();
        });
    });
    return setting;
  }

  private addDropdown(
    c: HTMLElement,
    name: string,
    choices: [string, string][],
    get: Getter<string>,
    set: Setter<string>,
    opts: { desc?: string } = {}
  ): Setting {
    const setting = new Setting(c).setName(name);
    if (opts.desc) setting.setDesc(opts.desc);
    setting.addDropdown((dd) => {
      for (const [value, label] of choices) dd.addOption(value, label);
      dd.setValue(get()).onChange((v) => {
        set(v);
        this.save();
      });
    });
    return setting;
  }

  // --- Theme list -----------------------------------------------------------

  /** Re-render the tab after a theme is added, duplicated, deleted or imported. */
  private refresh(): void {
    this.display();
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("PDF export").setHeading();

    new Setting(containerEl).setName("Built-in themes").setHeading();
    for (const theme of BUILTIN_THEMES) {
      this.renderThemeRow(containerEl, theme, true);
    }

    new Setting(containerEl).setName("Custom themes").setHeading();

    if (this.plugin.settings.themes.length === 0) {
      containerEl.createEl("p", {
        text: "No custom themes yet. Duplicate a built-in theme to start from it.",
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
          this.refresh();
        });
      })
      .addButton((btn) => {
        btn.setButtonText("Import JSON").onClick(() => {
          this.importThemeFromJson();
        });
      });
  }

  private renderThemeRow(containerEl: HTMLElement, theme: PdfTheme, isBuiltin: boolean) {
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

    // Available on built-ins too: starting from one used to mean retyping it.
    row.addButton((btn) => {
      btn.setIcon("copy").setTooltip("Duplicate").onClick(async () => {
        const copy = duplicateTheme(theme);
        this.plugin.settings.themes.push(copy);
        await this.plugin.saveSettings();
        new Notice(`Theme duplicated as "${copy.name}".`);
        this.refresh();
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
          this.refresh();
        });
      });
    }
  }

  // --- Theme editor ---------------------------------------------------------
  // Sections follow the order things appear in the document.

  private openThemeEditor(theme: PdfTheme) {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName(`Edit: ${theme.name}`).setHeading();
    new Setting(containerEl).addButton((btn) => {
      btn.setButtonText("Back").onClick(() => this.refresh());
    });

    this.addText(containerEl, "Theme name", () => theme.name, (v) => { theme.name = v; });
    this.addColor(containerEl, "Primary color", () => theme.primaryColor, (v) => { theme.primaryColor = v; });
    this.addColor(containerEl, "Accent color", () => theme.accentColor, (v) => { theme.accentColor = v; });
    this.addText(containerEl, "Logo", () => theme.logoPath, (v) => { theme.logoPath = v.trim(); }, {
      desc: "Relative path in vault (e.g. assets/logo.png)",
      placeholder: "assets/logo.png",
    });

    this.renderPageSection(containerEl, theme);
    this.renderTypographySection(containerEl, theme);
    this.renderCoverSection(containerEl, theme);
    this.renderHeaderFooterSection(containerEl, theme);
    this.renderWatermarkSection(containerEl, theme);
    this.renderClassificationSection(containerEl, theme);
    this.renderLegalSection(containerEl, theme);
    this.renderMetadataSection(containerEl, theme);
  }

  private renderPageSection(c: HTMLElement, theme: PdfTheme) {
    new Setting(c).setName("Page layout").setHeading();

    this.addDropdown(c, "Page size", PAGE_SIZES.map((s) => [s, s]), () => theme.pageSize, (v) => { theme.pageSize = v; });
    this.addDropdown(
      c,
      "Orientation",
      [["portrait", "Portrait"], ["landscape", "Landscape"]],
      () => theme.orientation || "portrait",
      (v) => { theme.orientation = v as PdfTheme["orientation"]; }
    );

    // One input per side: a single comma-separated field silently discarded
    // anything that did not split into exactly four parts.
    const margins = new Setting(c)
      .setName("Margins")
      .setDesc("Top, right, bottom, left. CSS lengths, e.g. 25mm")
      .setClass("rhino-margins-row");
    for (const side of MARGIN_SIDES) {
      margins.addText((t) => {
        t.setPlaceholder(side);
        t.setValue(theme.margins[side]).onChange((v) => {
          const valid = isCssLength(v);
          t.inputEl.toggleClass("rhino-invalid", !valid);
          if (!valid) return;
          theme.margins[side] = v.trim();
          this.save();
        });
      });
    }

    new Setting(c).setName("Page breaks").setHeading();
    c.createEl("p", {
      text: "Start a new page before each heading of the selected level(s). The cover and table of contents are never affected.",
      cls: "setting-item-description",
    });
    this.addToggle(c, "Before heading 1", () => theme.pageBreakBeforeH1, (v) => { theme.pageBreakBeforeH1 = v; });
    this.addToggle(c, "Before heading 2", () => theme.pageBreakBeforeH2, (v) => { theme.pageBreakBeforeH2 = v; });
    this.addToggle(c, "Before heading 3", () => theme.pageBreakBeforeH3, (v) => { theme.pageBreakBeforeH3 = v; });
  }

  private renderTypographySection(c: HTMLElement, theme: PdfTheme) {
    new Setting(c).setName("Typography").setHeading();
    this.addText(c, "Body font", () => theme.bodyFont, (v) => { theme.bodyFont = v; }, {
      desc: "CSS font stack, e.g. 'Inter', sans-serif. Inter and JetBrains Mono are bundled.",
    });
    this.addText(c, "Code font", () => theme.codeFont, (v) => { theme.codeFont = v; });
    this.addLength(c, "Font size", () => theme.bodyFontSize, (v) => { theme.bodyFontSize = v; });

    this.renderCustomFonts(c, theme);
  }

  /**
   * Font files embedded from the vault. Without them a font must be installed on
   * whichever machine runs the export, and a missing one falls back silently.
   */
  private renderCustomFonts(c: HTMLElement, theme: PdfTheme) {
    new Setting(c).setName("Embedded fonts").setHeading();
    c.createEl("p", {
      text:
        "Embed font files stored in your vault (woff2, woff, ttf, otf), so exports look the " +
        "same everywhere and work offline. Pick a file and its family, weight and style are " +
        "read from it. Add one row per weight: without a real bold file, the renderer fakes " +
        "one. Then use the family name in the font fields above.",
      cls: "setting-item-description",
    });

    theme.customFonts.forEach((font, index) => {
      const row = new Setting(c).setClass("rhino-font-row");

      let familyInput: TextComponent;
      let weightInput: TextComponent;
      let styleDropdown: DropdownComponent;

      row.addText((t) => {
        familyInput = t;
        t.setPlaceholder("Family").setValue(font.family).onChange((v) => {
          t.inputEl.toggleClass("rhino-invalid", v.trim() !== "" && !isFontFamily(v));
          font.family = v.trim();
          this.save();
        });
      });

      row.addText((t) => {
        t.setPlaceholder("Font file path")
          .setValue(font.path)
          .onChange((v) => {
            font.path = v.trim();
            this.save();
          });
        t.inputEl.addClass("rhino-font-path");

        new FontFileSuggest(this.app, t.inputEl, (file) => {
          void this.fillFromFontFile(file, font, familyInput, weightInput, styleDropdown);
        });
      });

      row.addText((t) => {
        weightInput = t;
        t.setPlaceholder("400").setValue(font.weight).onChange((v) => {
          t.inputEl.toggleClass("rhino-invalid", v.trim() !== "" && !isFontWeight(v));
          font.weight = v.trim();
          this.save();
        });
        t.inputEl.addClass("rhino-font-weight");
      });

      row.addDropdown((dd) => {
        styleDropdown = dd;
        dd.addOption("normal", "Normal");
        dd.addOption("italic", "Italic");
        dd.setValue(font.style).onChange((v) => {
          font.style = v as CustomFont["style"];
          this.save();
        });
      });

      row.addExtraButton((btn) => {
        btn.setIcon("trash").setTooltip("Remove").onClick(async () => {
          theme.customFonts.splice(index, 1);
          await this.plugin.saveSettings();
          this.openThemeEditor(theme);
        });
      });
    });

    new Setting(c)
      .addButton((btn) => {
        btn.setButtonText("Add font file").onClick(async () => {
          theme.customFonts.push({ family: "", path: "", weight: "400", style: "normal" });
          await this.plugin.saveSettings();
          this.openThemeEditor(theme);
        });
      })
      .addButton((btn) => {
        btn.setButtonText("Import from folder").onClick(() => {
          new FontFolderModal(this.app, (folder) => {
            void this.importFontsFromFolder(folder, theme);
          }).open();
        });
      });
  }

  /** Fill in family/weight/style from the chosen file's own metadata. */
  private async fillFromFontFile(
    file: TFile,
    font: CustomFont,
    familyInput: TextComponent,
    weightInput: TextComponent,
    styleDropdown: DropdownComponent
  ) {
    font.path = file.path;
    const metadata = readFontMetadata(await this.app.vault.readBinary(file));
    if (!metadata) {
      new Notice(`Could not read font metadata from ${file.name}. Fill the fields manually.`);
      await this.plugin.saveSettings();
      return;
    }

    font.family = metadata.family;
    font.weight = metadata.weight;
    font.style = metadata.style;

    familyInput.setValue(metadata.family);
    familyInput.inputEl.toggleClass("rhino-invalid", !isFontFamily(metadata.family));
    weightInput.setValue(metadata.weight);
    weightInput.inputEl.toggleClass("rhino-invalid", !isFontWeight(metadata.weight));
    styleDropdown.setValue(metadata.style);

    await this.plugin.saveSettings();
  }

  /** Add one row per readable font file in the folder, skipping known paths. */
  private async importFontsFromFolder(folder: TFolder, theme: PdfTheme) {
    const files = fontFilesIn(folder);
    const known = new Set(theme.customFonts.map((f) => f.path));
    const results = await readFontFiles(this.app, files.filter((f) => !known.has(f.path)));

    const added: CustomFont[] = [];
    const skipped: string[] = [];
    for (const { file, metadata } of results) {
      if (!metadata || !isFontFamily(metadata.family) || !isFontWeight(metadata.weight)) {
        skipped.push(file.name);
        continue;
      }
      added.push({
        family: metadata.family,
        path: file.path,
        weight: metadata.weight,
        style: metadata.style,
      });
    }

    if (added.length === 0 && skipped.length === 0) {
      new Notice("No new font files in that folder.");
      return;
    }

    added.sort(
      (a, b) =>
        a.family.localeCompare(b.family) ||
        parseInt(a.weight) - parseInt(b.weight) ||
        a.style.localeCompare(b.style)
    );
    theme.customFonts.push(...added);
    await this.plugin.saveSettings();

    const parts = [`${added.length} font${added.length > 1 ? "s" : ""} added`];
    if (skipped.length > 0) parts.push(`${skipped.length} skipped: ${skipped.join(", ")}`);
    new Notice(parts.join(" — "));
    this.openThemeEditor(theme);
  }

  private renderCoverSection(c: HTMLElement, theme: PdfTheme) {
    new Setting(c).setName("Cover and contents").setHeading();

    this.addToggle(c, "Cover page", () => theme.showCover, (v) => { theme.showCover = v; });
    this.addText(c, "Subtitle", () => theme.subtitle, (v) => { theme.subtitle = v; });
    this.addText(
      c,
      "Cover info block",
      () => theme.coverInfoFields.join(", "),
      (v) => {
        theme.coverInfoFields = v.split(",").map((s) => s.trim()).filter(Boolean);
      },
      {
        desc: "Frontmatter keys listed on the cover by default, comma-separated (e.g. author, date)",
        placeholder: "author, date",
      }
    );
    this.addToggle(c, "Table of contents", () => theme.showToc, (v) => { theme.showToc = v; }, {
      desc: "Auto-generated from h2/h3 headings, after the cover page",
    });
    this.addText(c, "Table of contents title", () => theme.tocTitle, (v) => { theme.tocTitle = v; });
    this.addToggle(c, "Number headings", () => theme.numberHeadings, (v) => { theme.numberHeadings = v; }, {
      desc: "Automatically number H2/H3 headings (1, 1.1, …), synced with the table of contents",
    });
  }

  private renderHeaderFooterSection(c: HTMLElement, theme: PdfTheme) {
    new Setting(c).setName("Header and footer").setHeading();

    const vars = "Variables: {title}, {filename}, {author}, {date}, {time}, {fm.key}";

    this.addToggle(c, "Header logo (page 2+)", () => theme.showHeaderLogo, (v) => { theme.showHeaderLogo = v; });
    this.addLength(c, "Header logo height", () => theme.headerLogoHeight, (v) => { theme.headerLogoHeight = v; });
    this.addText(c, "Header text", () => theme.headerText, (v) => { theme.headerText = v; }, {
      desc: vars,
      placeholder: "{title}",
    });
    this.addToggle(c, "Pagination", () => theme.showPagination, (v) => { theme.showPagination = v; });
    this.addText(c, "Pagination format", () => theme.paginationFormat, (v) => { theme.paginationFormat = v; }, {
      desc: 'Use {page} and {pages}, e.g. "{page} / {pages}" or "Page {page} of {pages}"',
    });
    this.addText(c, "Footer text", () => theme.footerText, (v) => { theme.footerText = v; }, { desc: vars });
    this.addDropdown(
      c,
      "External links",
      [["off", "Keep as links"], ["inline", "Show inline"], ["footnote", "As footnote"]],
      () => theme.urlDisplay,
      (v) => { theme.urlDisplay = v as PdfTheme["urlDisplay"]; },
      { desc: "How to display the address of external links in the PDF" }
    );
  }

  private renderWatermarkSection(c: HTMLElement, theme: PdfTheme) {
    new Setting(c).setName("Watermark").setHeading();

    this.addText(c, "Watermark text", () => theme.watermarkText, (v) => { theme.watermarkText = v; }, {
      desc: "Leave empty to disable",
      placeholder: "DRAFT",
    });
    this.addColor(c, "Watermark color", () => theme.watermarkColor, (v) => { theme.watermarkColor = v; });
    this.addSlider(
      c,
      "Watermark opacity",
      () => theme.watermarkOpacity,
      (v) => { theme.watermarkOpacity = v; },
      { min: 0, max: 1, step: 0.01 }
    );
    this.addLength(c, "Watermark font size", () => theme.watermarkFontSize, (v) => { theme.watermarkFontSize = v; });
    this.addSlider(
      c,
      "Watermark rotation",
      () => theme.watermarkRotation,
      (v) => { theme.watermarkRotation = v; },
      { min: -90, max: 90, step: 1 },
      { desc: "In degrees" }
    );
  }

  private renderClassificationSection(c: HTMLElement, theme: PdfTheme) {
    new Setting(c).setName("Classification banner").setHeading();

    this.addText(c, "Classification text", () => theme.classificationText, (v) => { theme.classificationText = v; }, {
      desc: "Centered on every page (incl. cover). Leave empty to disable. Variables: {title}, {filename}, {author}, {date}, {time}, {fm.key}.",
      placeholder: "RESTRICTED",
    });
    this.addColor(c, "Classification color", () => theme.classificationColor, (v) => { theme.classificationColor = v; });
  }

  private renderLegalSection(c: HTMLElement, theme: PdfTheme) {
    new Setting(c).setName("Legal notice").setHeading();

    this.addToggle(c, "Legal notice", () => theme.showLegal, (v) => { theme.showLegal = v; });
    this.addText(c, "Legal notice title", () => theme.legalTitle, (v) => { theme.legalTitle = v; });
    this.addTextArea(c, "Legal notice text", () => theme.legalText, (v) => { theme.legalText = v; });
  }

  private renderMetadataSection(c: HTMLElement, theme: PdfTheme) {
    new Setting(c).setName("Document properties").setHeading();

    this.addToggle(c, "PDF metadata", () => theme.includeMetadata, (v) => { theme.includeMetadata = v; }, {
      desc: "Write title/author/subject/keywords into the PDF properties (from frontmatter)",
    });
  }

  // --- Import / export ------------------------------------------------------

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
            coverInfoFields: Array.isArray(data.coverInfoFields)
              ? (data.coverInfoFields as unknown[]).map(String)
              : [],
            customFonts: Array.isArray(data.customFonts)
              ? (data.customFonts as CustomFont[])
              : [],
          };
          delete (imported as unknown as Record<string, unknown>).builtin;

          this.plugin.settings.themes.push(imported);
          void this.plugin.saveSettings().then(() => {
            this.refresh();
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
