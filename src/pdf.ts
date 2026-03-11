import { Notice } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { ElectronRemote, WebContents } from "electron";
import electron from "electron";
import { PDFDocument, PDFDict, PDFName, PDFString, PDFArray, PDFNumber } from "pdf-lib";

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
  outputPath: string
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

    // Wait for paged.js to finish
    await waitForPagedJs(win.webContents);

    // Small delay for paint to complete after paged.js signals ready
    await sleep(500);

    // Collect outline data from the DOM
    const outline: OutlineEntry[] = await win.webContents.executeJavaScript(
      "window.__rhinoOutline || []"
    );

    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    });

    let pdfBytes = Buffer.from(pdfData);

    // Add PDF bookmarks if outline data is available
    if (outline.length > 0) {
      pdfBytes = Buffer.from(await addPdfBookmarks(pdfBytes, outline));
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
 * Add bookmarks (outline) to a PDF buffer using pdf-lib.
 */
async function addPdfBookmarks(
  pdfBytes: Buffer,
  outline: OutlineEntry[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
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

  return pdfDoc.save();
}

async function waitForPagedJs(webContents: WebContents, maxMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const title = await webContents.executeJavaScript("document.title");
    if (title === "PAGED_READY") {
      return;
    }
    await sleep(200);
  }
  new Notice("Warning: paged.js timed out — PDF may have pagination issues.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
