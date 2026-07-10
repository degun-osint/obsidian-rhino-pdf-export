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
  // Frontmatter keys listed by default in the cover info block
  coverInfoFields: string[];

  // Header (page 2+)
  showHeaderLogo: boolean;
  headerLogoHeight: string; // CSS value, e.g. "12mm"
  headerText: string; // supports {title}, {date}

  // Footer
  showPagination: boolean;
  paginationFormat: string; // e.g. "{page} / {pages}", "Page {page} of {pages}"
  footerText: string; // supports {title}, {date}

  // External links: how to render the URL in the PDF
  urlDisplay: "off" | "inline" | "footnote";

  // Automatic heading numbering (H2/H3, synced with the table of contents)
  numberHeadings: boolean;

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
 * Document-level configuration, read from the `rhino-pdf` frontmatter key.
 *
 * `overrides` is kept separate from `theme`/`coverInfo`/`order` so those three
 * can never leak into a resolved PdfTheme.
 */
export interface DocConfig {
  /** Validated PdfTheme fields to override for this document. */
  overrides: Partial<PdfTheme>;
  /** Pin a base theme by id, falling back to name (case-insensitive). */
  theme?: string;
  /** Frontmatter keys to list in the cover info block (replaces the theme's). */
  coverInfo?: string[];
  /** Sort key for merged batch export; documents without one come last. */
  order?: number;
  /** Keys rejected by validation. Diagnostic only, never written back. */
  ignoredKeys: string[];
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
  /** Last folder a PDF was written to, reused by the quick-export command. */
  lastOutputDir: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  themes: [],
  lastUsedThemeId: "minimal",
  lastOutputDir: "",
};
