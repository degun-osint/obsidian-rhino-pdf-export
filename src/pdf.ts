import { Notice } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { ElectronRemote, WebContents } from "electron";
import electron from "electron";
import { PDFDocument, PDFDict, PDFName, PDFString, PDFArray, PDFNumber } from "pdf-lib";
import type { PdfMetadata } from "./types";

function getElectronRemote(): ElectronRemote {
  const remote = electron.remote;
  if (remote) return remote;
  return electron as unknown as ElectronRemote;
}

interface OutlineEntry {
  title: string;
  level: number;
  page: number;
}

// pdf-lib internal types not fully exported
type PDFRef = ReturnType<PDFDocument["context"]["nextRef"]>;

/**
 * Generate a PDF from HTML using an Electron BrowserWindow + paged.js.
 * The HTML must include paged.js and signal render completion via document.title = "PAGED_READY".
 */
export async function generatePdf(
  html: string,
  outputPath: string,
  meta?: PdfMetadata
): Promise<void> {
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `rhino-pdf-export-${Date.now()}.html`);
  fs.writeFileSync(tempFile, html, "utf-8");

  const remote = getElectronRemote();
  const win = new remote.BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      javascript: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    await win.loadFile(tempFile);

    // Wait for paged.js to finish and report its state (status + page count).
    const state = await waitForPagedJs(win.webContents);
    if (state.status !== "done") {
      new Notice(
        `Rhino PDF: paged.js n'a pas terminé proprement (${state.status}). Le PDF peut être incomplet.`
      );
    }

    // Short safety margin only — the heavy paint wait (fonts + two animation
    // frames) already happened in-page before PAGED_READY was signalled.
    await sleep(150);

    // Collect outline data from the DOM
    const outline = await win.webContents.executeJavaScript<OutlineEntry[]>(
      "window.__rhinoOutline || []"
    );

    const expectedPages = state.pages || 0;

    // Render to PDF. If the captured page count comes back short of what
    // paged.js laid out, the paint wasn't complete — retry once with a longer
    // wait before giving up (truncation guard).
    let pdfBytes = await printPdf(win.webContents);
    let pdfDoc = await PDFDocument.load(pdfBytes);
    if (expectedPages > 0 && pdfDoc.getPageCount() < expectedPages) {
      await sleep(1500);
      pdfBytes = await printPdf(win.webContents);
      pdfDoc = await PDFDocument.load(pdfBytes);
    }

    const actualPages = pdfDoc.getPageCount();
    if (expectedPages > 0 && actualPages < expectedPages) {
      new Notice(
        `Rhino PDF: ${actualPages}/${expectedPages} pages exportées — le document semble tronqué.`
      );
    }

    // Add bookmarks and/or document metadata (re-serializes the doc).
    let modified = false;
    if (outline.length > 0) {
      applyPdfBookmarks(pdfDoc, outline);
      modified = true;
    }
    if (meta) {
      applyPdfMetadata(pdfDoc, meta);
      modified = true;
    }
    if (modified) {
      pdfBytes = Buffer.from(await pdfDoc.save());
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, pdfBytes);
  } finally {
    win.destroy();
    try { fs.unlinkSync(tempFile); } catch { /* cleanup non-critical */ }
  }
}

/**
 * Render the current page to a PDF buffer via Electron's printToPDF.
 */
async function printPdf(webContents: WebContents): Promise<Buffer> {
  const data = await webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
  });
  return Buffer.from(data);
}

/**
 * Write document properties (title/author/subject/keywords + producer) into the PDF.
 */
function applyPdfMetadata(pdfDoc: PDFDocument, meta: PdfMetadata): void {
  if (meta.title) pdfDoc.setTitle(meta.title);
  if (meta.author) pdfDoc.setAuthor(meta.author);
  if (meta.subject) pdfDoc.setSubject(meta.subject);
  if (meta.keywords && meta.keywords.length > 0) pdfDoc.setKeywords(meta.keywords);
  pdfDoc.setProducer("Rhino PDF Export for Obsidian");
  pdfDoc.setCreator("Rhino PDF Export for Obsidian");
}

/**
 * Add bookmarks (outline) to an already-loaded PDF document in place using pdf-lib.
 */
function applyPdfBookmarks(
  pdfDoc: PDFDocument,
  outline: OutlineEntry[]
): void {
  const pageCount = pdfDoc.getPageCount();
  const context = pdfDoc.context;

  // Build a tree structure from flat heading list
  type BookmarkNode = { entry: OutlineEntry; children: BookmarkNode[] };
  const roots: BookmarkNode[] = [];
  const stack: BookmarkNode[] = [];

  for (const e of outline) {
    const node: BookmarkNode = { entry: e, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].entry.level >= e.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }

  function countAll(nodes: BookmarkNode[]): number {
    let n = 0;
    for (const node of nodes) {
      n += 1 + countAll(node.children);
    }
    return n;
  }

  type OutlineResult = { ref: PDFRef; dict: PDFDict };

  function createOutlineItem(node: BookmarkNode, parentRef: PDFRef): OutlineResult {
    const ref = context.nextRef();
    const dict = context.obj({});

    dict.set(PDFName.of("Title"), PDFString.of(node.entry.title));
    dict.set(PDFName.of("Parent"), parentRef);

    // Destination: page + fit
    const pageIndex = Math.max(0, Math.min(node.entry.page - 1, pageCount - 1));
    const page = pdfDoc.getPage(pageIndex);
    const destArray = PDFArray.withContext(context);
    destArray.push(page.ref);
    destArray.push(PDFName.of("Fit"));
    dict.set(PDFName.of("Dest"), destArray);

    if (node.children.length > 0) {
      const childResults: OutlineResult[] = [];
      for (const child of node.children) {
        childResults.push(createOutlineItem(child, ref));
      }

      for (let i = 0; i < childResults.length; i++) {
        if (i > 0) childResults[i].dict.set(PDFName.of("Prev"), childResults[i - 1].ref);
        if (i < childResults.length - 1) childResults[i].dict.set(PDFName.of("Next"), childResults[i + 1].ref);
      }

      dict.set(PDFName.of("First"), childResults[0].ref);
      dict.set(PDFName.of("Last"), childResults[childResults.length - 1].ref);
      dict.set(PDFName.of("Count"), PDFNumber.of(countAll(node.children)));

      for (const cr of childResults) {
        context.assign(cr.ref, cr.dict);
      }
    }

    return { ref, dict };
  }

  // Create root outline dictionary
  const outlineRef = context.nextRef();
  const outlineDict = context.obj({});

  const rootItems: OutlineResult[] = [];
  for (const root of roots) {
    rootItems.push(createOutlineItem(root, outlineRef));
  }

  for (let i = 0; i < rootItems.length; i++) {
    if (i > 0) rootItems[i].dict.set(PDFName.of("Prev"), rootItems[i - 1].ref);
    if (i < rootItems.length - 1) rootItems[i].dict.set(PDFName.of("Next"), rootItems[i + 1].ref);
  }

  outlineDict.set(PDFName.of("Type"), PDFName.of("Outlines"));
  outlineDict.set(PDFName.of("First"), rootItems[0].ref);
  outlineDict.set(PDFName.of("Last"), rootItems[rootItems.length - 1].ref);
  outlineDict.set(PDFName.of("Count"), PDFNumber.of(countAll(roots)));

  context.assign(outlineRef, outlineDict);
  for (const ri of rootItems) {
    context.assign(ri.ref, ri.dict);
  }

  // Set outline on catalog
  pdfDoc.catalog.set(PDFName.of("Outlines"), outlineRef);
}

interface PagedState {
  status: "done" | "timeout" | "error" | "timeout-node";
  pages: number;
}

/**
 * Poll the render window until paged.js reports its state on window.__rhinoState.
 * The state distinguishes a clean finish ("done") from a fallback timeout, so the
 * caller can warn instead of silently shipping a truncated PDF.
 *
 * maxMs (180s) sits above the in-page fallback (150s) so that, on a genuine hang,
 * paged.js's own fallback fires first and still reports a page count.
 */
async function waitForPagedJs(webContents: WebContents, maxMs = 180000): Promise<PagedState> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const state = await webContents.executeJavaScript<PagedState | null>(
      "window.__rhinoState || null"
    );
    if (state) {
      return state;
    }
    await sleep(150);
  }
  return { status: "timeout-node", pages: 0 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}
