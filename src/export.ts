import { App, Component, FileSystemAdapter, MarkdownRenderer, Notice, TFile } from "obsidian";
import type { PdfTheme } from "./types";
import {
  applyPageBreaks,
  buildHtml,
  coverInfoRows,
  makeDocVars,
  makePdfMetadata,
  printableHeightCss,
  printableWidthCss,
  resolveImagePaths,
  type RenderAssets,
} from "./render";
import { isFontFamily, isFontWeight } from "./frontmatter";
import { generatePdf } from "./pdf";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  gif: "image/gif",
  webp: "image/webp",
};

export function getVaultBasePath(app: App): string {
  const adapter = app.vault.adapter;
  if (adapter instanceof FileSystemAdapter) return adapter.getBasePath();
  return "";
}

/** The first `# H1` of a note, falling back to its filename. */
export function extractTitle(mdContent: string, fallback: string): string {
  for (const line of mdContent.split("\n")) {
    if (line.startsWith("# ")) return line.replace(/^#+\s*/, "").trim();
  }
  return fallback;
}

/**
 * An attached but off-screen host for Obsidian's renderer.
 *
 * Obsidian renders a mermaid block only once its element `isShown()` — that is,
 * has an `offsetParent`. A detached container never has one, so the render is
 * deferred to an `onNodeInserted` callback that never fires and the diagram
 * stays a raw ```mermaid code block in the PDF. Rendering into a host that is
 * in the document, just parked outside the viewport, gets the diagrams back and
 * hands them the width the page will offer instead of the window's.
 */
function createRenderHost(widthCss: string, heightCss: string): HTMLElement {
  // .rhino-render-host parks it off-screen without display:none, which would
  // zero offsetParent again — the whole point of attaching it.
  const host = createDiv("rhino-render-host");
  host.setCssProps({ "--rhino-render-width": widthCss, "--rhino-render-height": heightCss });
  document.body.appendChild(host);
  return host;
}

/**
 * The printable box in px, measured rather than computed: the theme states its
 * page size and margins in whatever CSS unit it likes, and the browser is the
 * only thing that reliably resolves those.
 */
function measurePrintableBox(host: HTMLElement): { w: number; h: number } {
  const probe = host.createDiv("rhino-render-probe");
  const box = { w: host.clientWidth, h: probe.offsetHeight };
  probe.detach();
  return box;
}

/** Run the note through Obsidian's renderer, then absolutize image paths. */
export async function renderNoteHtml(
  app: App,
  mdContent: string,
  sourcePath: string,
  theme?: PdfTheme
): Promise<string> {
  const host = createRenderHost(
    theme ? printableWidthCss(theme) : "170mm",
    theme ? printableHeightCss(theme) : "247mm"
  );
  const component = new Component();
  component.load();
  try {
    await MarkdownRenderer.render(app, applyPageBreaks(mdContent), host, sourcePath, component);
    const diagrams = host.querySelectorAll<HTMLElement>(".mermaid");
    if (diagrams.length > 0) {
      pinMermaidFont(diagrams);
      fitMermaidDiagrams(diagrams, measurePrintableBox(host));
    }
    return resolveImagePaths(host.innerHTML, getVaultBasePath(app));
  } finally {
    component.unload();
    host.detach();
  }
}

/**
 * Pin the font each diagram was measured with onto the diagram itself.
 *
 * mermaid lays a label out at render time and bakes the result into the SVG as
 * fixed <foreignObject> boxes. Obsidian measures with `--font-mermaid`, which
 * resolves to the reader's editor font; rendering the PDF with the theme's body
 * font instead reflows that text inside boxes sized for another family, and the
 * labels spill out of their shapes. Carrying the measured family along keeps
 * the geometry the SVG was built for.
 */
function pinMermaidFont(diagrams: NodeListOf<HTMLElement>): void {
  const family = getComputedStyle(document.body).getPropertyValue("--font-mermaid").trim();
  if (!family) return;
  // Set through the DOM, never string-concatenated: the value comes from the
  // reader's Obsidian theme and is serialized into a style attribute.
  for (const el of Array.from(diagrams)) el.setCssProps({ "--font-mermaid": family });
}

/**
 * Shrink any diagram that does not fit the page, in the markup.
 *
 * An SVG is atomic: paged.js cannot split one, so a diagram taller than the
 * text box can never be placed. It keeps looking for a break that does not
 * exist, never signals PAGED_READY, and everything after the diagram is missing
 * from the PDF. Capping it in CSS instead (`max-height` next to `height: auto`)
 * leaves paged.js resolving the same constraint over and over and hangs it just
 * as thoroughly — so the fitted size is resolved once, here, and written into
 * the width/height attributes mermaid already uses. The viewBox does the rest.
 */
function fitMermaidDiagrams(diagrams: NodeListOf<HTMLElement>, box: { w: number; h: number }): void {
  if (!(box.w > 0 && box.h > 0)) return;

  for (const el of Array.from(diagrams)) {
    const svg = el.querySelector("svg");
    // [, width, height] of "0 0 W H": mermaid always emits one, and it is the
    // only size that survives whatever the width attribute happens to say.
    const vb = svg?.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
    if (!svg || !vb || vb.length !== 4 || !(vb[2] > 0) || !(vb[3] > 0)) continue;

    // A percentage width (the diagram types Obsidian lets fill their container)
    // means the natural size is the viewBox's.
    const attrW = Number.parseFloat(svg.getAttribute("width") ?? "");
    const naturalW = Number.isFinite(attrW) ? attrW : vb[2];
    const w = Math.min(naturalW, box.w);
    const h = (w * vb[3]) / vb[2];
    if (h <= box.h) continue;

    const scale = box.h / h;
    svg.setAttribute("width", String(Math.floor(w * scale)));
    svg.setAttribute("height", String(Math.floor(h * scale)));
  }
}

/** woff2 first: it is the only format worth shipping in a vault. */
const FONT_FORMATS: Record<string, { mime: string; format: string }> = {
  woff2: { mime: "font/woff2", format: "woff2" },
  woff: { mime: "font/woff", format: "woff" },
  ttf: { mime: "font/ttf", format: "truetype" },
  otf: { mime: "font/otf", format: "opentype" },
};

export interface CustomFontCss {
  css: string;
  /** Entries that could not be embedded, for a single grouped warning. */
  skipped: string[];
}

/**
 * Embed the theme's vault font files as @font-face rules.
 *
 * Emitted after the bundled families, so a custom font declared with the same
 * name deliberately wins. A bad entry is skipped rather than allowed to corrupt
 * the stylesheet: family and weight are whitelisted, never escaped.
 */
export async function buildCustomFontCss(app: App, theme: PdfTheme): Promise<CustomFontCss> {
  const rules: string[] = [];
  const skipped: string[] = [];

  for (const font of theme.customFonts ?? []) {
    const family = font.family?.trim() ?? "";
    const path = font.path?.trim() ?? "";
    if (!family && !path) continue;

    const weight = font.weight?.trim() || "400";
    const style = font.style === "italic" ? "italic" : "normal";
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const spec = FONT_FORMATS[ext];
    const file = app.vault.getAbstractFileByPath(path);

    if (!isFontFamily(family)) skipped.push(`${path || family}: invalid family name`);
    else if (!isFontWeight(weight)) skipped.push(`${family}: invalid weight "${weight}"`);
    else if (!spec) skipped.push(`${path}: unsupported format (use woff2, woff, ttf or otf)`);
    else if (!(file instanceof TFile)) skipped.push(`${path}: file not found in vault`);
    else {
      const b64 = Buffer.from(await app.vault.readBinary(file)).toString("base64");
      rules.push(
        `@font-face {\n` +
          `  font-family: '${family}';\n` +
          `  font-style: ${style};\n` +
          `  font-weight: ${weight};\n` +
          `  font-display: swap;\n` +
          `  src: url(data:${spec.mime};base64,${b64}) format('${spec.format}');\n}`
      );
    }
  }

  return { css: rules.join("\n"), skipped };
}

export async function loadLogoDataUri(app: App, logoPath: string): Promise<string> {
  if (!logoPath) return "";
  const file = app.vault.getAbstractFileByPath(logoPath);
  if (!file || !(file instanceof TFile)) return "";

  const data = await app.vault.readBinary(file);
  const ext = logoPath.split(".").pop()?.toLowerCase() || "png";
  const b64 = Buffer.from(data).toString("base64");
  return `data:${MIME_BY_EXT[ext] || "image/png"};base64,${b64}`;
}

/**
 * Loads a theme's vault assets once per distinct logo + font configuration.
 *
 * Both the preview (on every keystroke) and a batch export (once per note) would
 * otherwise re-read and re-encode the same font files, and warn about the same
 * missing one over and over.
 */
export class AssetCache {
  private cache = new Map<string, RenderAssets>();

  constructor(private app: App) {}

  async get(theme: PdfTheme, notify = true): Promise<RenderAssets> {
    // One key for both inputs, with no separator to collide with a path.
    const key = JSON.stringify([theme.logoPath, theme.customFonts ?? []]);
    const hit = this.cache.get(key);
    if (hit) return hit;

    const [logoDataUri, fonts] = await Promise.all([
      loadLogoDataUri(this.app, theme.logoPath),
      buildCustomFontCss(this.app, theme),
    ]);
    // Only on a cache miss: a silently missing font falls back to a system one,
    // and that is easy to miss in a 40-page PDF.
    if (notify && fonts.skipped.length > 0) {
      new Notice(`Rhino PDF — font not embedded:\n${fonts.skipped.join("\n")}`, 8000);
    }

    const assets: RenderAssets = { logoDataUri, fontFaceCss: fonts.css };
    this.cache.set(key, assets);
    return assets;
  }
}

export interface ExportRequest {
  app: App;
  file: TFile;
  /** Already resolved against the note's frontmatter and any modal edits. */
  theme: PdfTheme;
  coverInfoKeys: string[];
  outputPath: string;
  assets: RenderAssets;
}

/**
 * Render one note to a PDF file. Shared by the export modal and the
 * dialog-less quick-export command, so both produce identical output.
 */
export async function exportNoteToPdf(req: ExportRequest): Promise<void> {
  const { app, file, theme, coverInfoKeys, outputPath, assets } = req;

  const mdContent = await app.vault.cachedRead(file);
  const title = extractTitle(mdContent, file.basename);
  const bodyHtml = await renderNoteHtml(app, mdContent, file.path, theme);

  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const vars = makeDocVars(title, file.basename, fm);
  const coverInfo = coverInfoRows(fm, coverInfoKeys);
  const html = buildHtml(bodyHtml, title, theme, assets, vars, coverInfo);

  const meta = theme.includeMetadata ? makePdfMetadata(title, fm) : undefined;
  await generatePdf(html, outputPath, meta);
}
