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

  // Footer
  showPagination: boolean;
  footerText: string;

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
}

export interface PluginSettings {
  themes: PdfTheme[];
  lastUsedThemeId: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  themes: [],
  lastUsedThemeId: "minimal",
};
