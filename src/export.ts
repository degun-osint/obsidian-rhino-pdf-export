import { App, Component, FileSystemAdapter, MarkdownRenderer, TFile } from "obsidian";
import type { PdfTheme } from "./types";
import {
  applyPageBreaks,
  buildHtml,
  coverInfoRows,
  makeDocVars,
  makePdfMetadata,
  resolveImagePaths,
} from "./render";
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

/** Run the note through Obsidian's renderer, then absolutize image paths. */
export async function renderNoteHtml(
  app: App,
  mdContent: string,
  sourcePath: string
): Promise<string> {
  const tempDiv = createDiv();
  const component = new Component();
  component.load();
  await MarkdownRenderer.render(app, applyPageBreaks(mdContent), tempDiv, sourcePath, component);
  const html = resolveImagePaths(tempDiv.innerHTML, getVaultBasePath(app));
  component.unload();
  return html;
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

export interface ExportRequest {
  app: App;
  file: TFile;
  /** Already resolved against the note's frontmatter and any modal edits. */
  theme: PdfTheme;
  coverInfoKeys: string[];
  outputPath: string;
}

/**
 * Render one note to a PDF file. Shared by the export modal and the
 * dialog-less quick-export command, so both produce identical output.
 */
export async function exportNoteToPdf(req: ExportRequest): Promise<void> {
  const { app, file, theme, coverInfoKeys, outputPath } = req;

  const mdContent = await app.vault.cachedRead(file);
  const title = extractTitle(mdContent, file.basename);
  const bodyHtml = await renderNoteHtml(app, mdContent, file.path);
  const logoDataUri = await loadLogoDataUri(app, theme.logoPath);

  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const vars = makeDocVars(title, file.basename, fm);
  const coverInfo = coverInfoRows(fm, coverInfoKeys);
  const html = buildHtml(bodyHtml, title, theme, logoDataUri, vars, coverInfo);

  const meta = theme.includeMetadata ? makePdfMetadata(title, fm) : undefined;
  await generatePdf(html, outputPath, meta);
}
