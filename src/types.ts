export interface PdfTheme {
  id: string;
  name: string;
  builtin?: boolean;

  // Colors
  primaryColor: string;
  accentColor: string;

  // Logo (relative path in vault, or empty)
  logoPath: string;

  // Cover page
  showCover: boolean;
  showToc: boolean;
  tocTitle: string;
  subtitle: string;

  // Header (page 2+)
  showHeaderLogo: boolean;
  headerLogoHeight: string; // CSS value, e.g. "12mm"
  headerText: string; // supports {title}, {date}

  // Footer
  showPagination: boolean;
  footerText: string; // supports {title}, {date}

  // Legal notice
  showLegal: boolean;
  legalTitle: string;
  legalText: string;

  // Typography
  bodyFont: string;
  codeFont: string;
  bodyFontSize: string; // e.g. "10pt"

  // Page
  pageSize: string; // "A4", "Letter"
  orientation: "portrait" | "landscape";
  margins: { top: string; right: string; bottom: string; left: string };

  // Automatic page break before headings
  pageBreakBeforeH1: boolean;
  pageBreakBeforeH2: boolean;
  pageBreakBeforeH3: boolean;

  // Write PDF document properties (title/author/subject/keywords) from frontmatter
  includeMetadata: boolean;

  // Classification banner (centered, repeated on every page incl. cover)
  classificationText: string; // supports {title}, {date}, {author}, {fm.x}, …
  classificationColor: string;

  // Watermark
  watermarkText: string;
  watermarkColor: string;
  watermarkOpacity: number; // 0–1
  watermarkFontSize: string; // e.g. "80pt"
  watermarkRotation: number; // degrees, e.g. -45
}

/**
 * Per-document variables available to header/footer/classification text
 * placeholders ({title}, {filename}, {author}, {date}, {time}, {fm.KEY}).
 */
export interface DocVars {
  title: string;
  filename: string;
  frontmatter: Record<string, unknown>;
}

/**
 * Metadata written into the generated PDF document properties.
 */
export interface PdfMetadata {
  title: string;
  author?: string;
  subject?: string;
  keywords?: string[];
}

/**
 * A single label/value row of the cover info block.
 */
export interface InfoRow {
  label: string;
  value: string;
}

export interface PluginSettings {
  themes: PdfTheme[];
  lastUsedThemeId: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  themes: [],
  lastUsedThemeId: "minimal",
};
