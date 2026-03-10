import { Notice } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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

  // Use Electron BrowserWindow instead of <webview> tag for reliable printToPDF
  const electron = require("electron");
  const remote = electron.remote || (require("@electron/remote") ?? electron);
  const BrowserWindow = remote.BrowserWindow;

  const win = new BrowserWindow({
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

    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    });

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, Buffer.from(pdfData));
  } finally {
    win.destroy();
    try { fs.unlinkSync(tempFile); } catch (_) {}
  }
}

async function waitForPagedJs(webContents: any, maxMs = 20000): Promise<void> {
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
