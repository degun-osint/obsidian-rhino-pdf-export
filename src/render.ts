import type { PdfTheme } from "./types";

/**
 * Build the CSS for PDF rendering from a theme.
 */
function buildCss(theme: PdfTheme): string {
  const p = theme.primaryColor;
  const a = theme.accentColor;
  const m = theme.margins;

  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

@page {
  size: ${theme.pageSize}${theme.orientation === "landscape" ? " landscape" : ""};
  margin: ${m.top} ${m.right} ${m.bottom} ${m.left};
  @top-left {
    content: element(headertext);
  }
  @top-right {
    content: element(headerlogo);
  }
  @bottom-center {
    content: element(footerblock);
  }
}

@page :first {
  margin-top: 15mm;
  @top-left { content: none; }
  @top-right { content: none; }
  @bottom-center { content: none; }
}

* { box-sizing: border-box; }

body {
  font-family: ${theme.bodyFont};
  font-size: ${theme.bodyFontSize};
  line-height: 1.6;
  color: #2c2c2c;
  background: #ffffff;
}

/* --- Running header: text (left) --- */
.running-header-text {
  position: running(headertext);
  font-family: ${theme.bodyFont};
  font-size: 9px;
  color: #999;
}

/* --- Running header: logo (right) --- */
.running-header-logo {
  position: running(headerlogo);
}
.running-header-logo img {
  height: ${theme.headerLogoHeight};
  opacity: 0.8;
}

/* --- Running footer: pagination --- */
.running-footer {
  position: running(footerblock);
  font-family: ${theme.bodyFont};
  font-size: 9px;
  color: #999;
  text-align: center;
}
.running-footer .page-num::after {
  content: counter(page);
}
.running-footer .page-total::after {
  content: counter(pages);
}

/* --- Cover page --- */
.cover {
  text-align: center;
  padding: 20mm 0 10mm 0;
  margin-bottom: 8mm;
  border-bottom: 3px solid ${p};
}
.cover img {
  width: 60mm;
  margin-bottom: 8mm;
}
.cover h1 {
  font-size: 22pt;
  font-weight: 700;
  color: ${p};
  margin: 0;
  padding: 0;
}
.cover .subtitle {
  font-size: 11pt;
  color: ${a};
  font-weight: 600;
  margin-top: 3mm;
}

/* --- Headings --- */
h2 {
  font-size: 14pt;
  font-weight: 700;
  color: ${p};
  border-bottom: 2px solid ${a};
  padding-bottom: 3mm;
  margin-top: 10mm;
  margin-bottom: 5mm;
  page-break-after: avoid;
}
h3 {
  font-size: 11pt;
  font-weight: 600;
  color: ${a};
  margin-top: 7mm;
  margin-bottom: 3mm;
  page-break-after: avoid;
}

p { margin: 2mm 0; text-align: justify; }
ul, ol { margin: 2mm 0 2mm 5mm; padding-left: 5mm; }
li { margin-bottom: 1.5mm; }

blockquote {
  background: linear-gradient(135deg, #f0f4fa 0%, #e8f4f0 100%);
  border-left: 4px solid ${a};
  margin: 4mm 0;
  padding: 3mm 5mm;
  border-radius: 0 4px 4px 0;
  font-size: 9.5pt;
  color: #333;
}
blockquote strong { color: ${p}; }

code {
  font-family: ${theme.codeFont};
  background: #f0f4fa;
  color: ${p};
  padding: 0.5mm 1.5mm;
  border-radius: 3px;
  font-size: 8.5pt;
  font-weight: 500;
}

pre {
  background: #1e2433;
  color: #e0e6f0;
  padding: 4mm 5mm;
  border-radius: 5px;
  font-size: 8.5pt;
  line-height: 1.7;
  margin: 3mm 0 5mm 0;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  border-left: 4px solid ${a};
  page-break-inside: avoid;
}
pre code {
  background: none;
  color: #e0e6f0;
  padding: 0;
  font-size: 8.5pt;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 4mm 0;
  font-size: 9pt;
  page-break-inside: avoid;
}
thead { background: ${p}; color: white; }
th { padding: 2.5mm 3mm; text-align: left; font-weight: 600; font-size: 9pt; }
td { padding: 2mm 3mm; border-bottom: 1px solid #e0e0e0; }
tr:nth-child(even) { background: #f7f9fc; }

hr {
  border: none;
  height: 1px;
  background: linear-gradient(to right, ${p}, ${a});
  margin: 8mm 0;
  opacity: 0.4;
}

strong { font-weight: 700; color: #1a1a1a; }

/* --- Callouts (Obsidian built-in + Callout Manager) --- */
.callout {
  margin: 4mm 0;
  padding: 0;
  border-radius: 4px;
  border: none;
  border-left: 4px solid var(--callout-color, ${a});
  background: var(--callout-bg, #f0f4fa);
  font-size: 9.5pt;
  page-break-inside: avoid;
  overflow: hidden;
}
.callout-title {
  display: flex;
  align-items: center;
  gap: 2mm;
  padding: 2.5mm 4mm;
  font-weight: 600;
  font-size: 9.5pt;
  color: var(--callout-color, ${p});
  background: var(--callout-title-bg, rgba(0,0,0,0.03));
}
.callout-title-inner { flex: 1; }
.callout-icon { display: flex; align-items: center; width: 16px; height: 16px; flex-shrink: 0; }
.callout-icon svg { display: none; }
.callout-icon::before {
  content: "";
  display: block;
  width: 16px;
  height: 16px;
  background-size: 16px 16px;
  background-repeat: no-repeat;
  background-position: center;
  flex-shrink: 0;
}

/* Callout icons (Lucide SVG inlined) */
.callout[data-callout="note"] .callout-icon::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23448aff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 20h9'/%3E%3Cpath d='M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z'/%3E%3C/svg%3E");
}
.callout[data-callout="abstract"] .callout-icon::before,
.callout[data-callout="summary"] .callout-icon::before,
.callout[data-callout="tldr"] .callout-icon::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2300b8d4' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='8' y='2' width='8' height='4' rx='1' ry='1'/%3E%3Cpath d='M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2'/%3E%3Cpath d='M12 11h4'/%3E%3Cpath d='M12 16h4'/%3E%3Cpath d='M8 11h.01'/%3E%3Cpath d='M8 16h.01'/%3E%3C/svg%3E");
}
.callout[data-callout="info"] .callout-icon::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23448aff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 16v-4'/%3E%3Cpath d='M12 8h.01'/%3E%3C/svg%3E");
}
.callout[data-callout="tip"] .callout-icon::before,
.callout[data-callout="hint"] .callout-icon::before,
.callout[data-callout="important"] .callout-icon::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2300bfa5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'/%3E%3C/svg%3E");
}
.callout[data-callout="success"] .callout-icon::before,
.callout[data-callout="check"] .callout-icon::before,
.callout[data-callout="done"] .callout-icon::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2300c853' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 11.08V12a10 10 0 1 1-5.93-9.14'/%3E%3Cpath d='m9 11 3 3L22 4'/%3E%3C/svg%3E");
}
.callout[data-callout="question"] .callout-icon::before,
.callout[data-callout="help"] .callout-icon::before,
.callout[data-callout="faq"] .callout-icon::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ff9100' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'/%3E%3Cpath d='M12 17h.01'/%3E%3C/svg%3E");
}
.callout[data-callout="warning"] .callout-icon::before,
.callout[data-callout="caution"] .callout-icon::before,
.callout[data-callout="attention"] .callout-icon::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ff9100' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'/%3E%3Cpath d='M12 9v4'/%3E%3Cpath d='M12 17h.01'/%3E%3C/svg%3E");
}
.callout[data-callout="failure"] .callout-icon::before,
.callout[data-callout="fail"] .callout-icon::before,
.callout[data-callout="missing"] .callout-icon::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ff5252' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 6 6 18'/%3E%3Cpath d='m6 6 12 12'/%3E%3C/svg%3E");
}
.callout[data-callout="danger"] .callout-icon::before,
.callout[data-callout="error"] .callout-icon::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ff1744' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'/%3E%3C/svg%3E");
}
.callout[data-callout="bug"] .callout-icon::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23ff6d00' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m8 2 1.88 1.88'/%3E%3Cpath d='M14.12 3.88 16 2'/%3E%3Cpath d='M9 7.13v-1a3.003 3.003 0 1 1 6 0v1'/%3E%3Cpath d='M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6'/%3E%3Cpath d='M12 20v-9'/%3E%3Cpath d='M6.53 9C4.6 8.8 3 7.1 3 5'/%3E%3Cpath d='M6 13H2'/%3E%3Cpath d='M3 21c0-2.1 1.7-3.9 3.8-4'/%3E%3Cpath d='M20.97 5c0 2.1-1.6 3.8-3.5 4'/%3E%3Cpath d='M22 13h-4'/%3E%3Cpath d='M17.2 17c2.1.1 3.8 1.9 3.8 4'/%3E%3C/svg%3E");
}
.callout[data-callout="example"] .callout-icon::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%237c4dff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='8' x2='21' y1='6' y2='6'/%3E%3Cline x1='8' x2='21' y1='12' y2='12'/%3E%3Cline x1='8' x2='21' y1='18' y2='18'/%3E%3Cline x1='3' x2='3.01' y1='6' y2='6'/%3E%3Cline x1='3' x2='3.01' y1='12' y2='12'/%3E%3Cline x1='3' x2='3.01' y1='18' y2='18'/%3E%3C/svg%3E");
}
.callout[data-callout="quote"] .callout-icon::before,
.callout[data-callout="cite"] .callout-icon::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239e9e9e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z'/%3E%3Cpath d='M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z'/%3E%3C/svg%3E");
}
.callout-fold { display: none; }
.callout-content {
  padding: 2mm 4mm 3mm 4mm;
  color: #333;
}
.callout-content p:first-child { margin-top: 0; }
.callout-content p:last-child { margin-bottom: 0; }

/* Standard callout types */
.callout[data-callout="note"] { --callout-color: #448aff; --callout-bg: #f0f4ff; --callout-title-bg: rgba(68,138,255,0.08); }
.callout[data-callout="abstract"],
.callout[data-callout="summary"],
.callout[data-callout="tldr"] { --callout-color: #00b8d4; --callout-bg: #f0fbff; --callout-title-bg: rgba(0,184,212,0.08); }
.callout[data-callout="info"] { --callout-color: #448aff; --callout-bg: #f0f4ff; --callout-title-bg: rgba(68,138,255,0.08); }
.callout[data-callout="tip"],
.callout[data-callout="hint"],
.callout[data-callout="important"] { --callout-color: #00bfa5; --callout-bg: #f0faf8; --callout-title-bg: rgba(0,191,165,0.08); }
.callout[data-callout="success"],
.callout[data-callout="check"],
.callout[data-callout="done"] { --callout-color: #00c853; --callout-bg: #f0faf0; --callout-title-bg: rgba(0,200,83,0.08); }
.callout[data-callout="question"],
.callout[data-callout="help"],
.callout[data-callout="faq"] { --callout-color: #ff9100; --callout-bg: #fff8f0; --callout-title-bg: rgba(255,145,0,0.08); }
.callout[data-callout="warning"],
.callout[data-callout="caution"],
.callout[data-callout="attention"] { --callout-color: #ff9100; --callout-bg: #fff8f0; --callout-title-bg: rgba(255,145,0,0.08); }
.callout[data-callout="failure"],
.callout[data-callout="fail"],
.callout[data-callout="missing"] { --callout-color: #ff5252; --callout-bg: #fff0f0; --callout-title-bg: rgba(255,82,82,0.08); }
.callout[data-callout="danger"],
.callout[data-callout="error"] { --callout-color: #ff1744; --callout-bg: #fff0f0; --callout-title-bg: rgba(255,23,68,0.08); }
.callout[data-callout="bug"] { --callout-color: #ff6d00; --callout-bg: #fff5f0; --callout-title-bg: rgba(255,109,0,0.08); }
.callout[data-callout="example"] { --callout-color: #7c4dff; --callout-bg: #f5f0ff; --callout-title-bg: rgba(124,77,255,0.08); }
.callout[data-callout="quote"],
.callout[data-callout="cite"] { --callout-color: #9e9e9e; --callout-bg: #f5f5f5; --callout-title-bg: rgba(158,158,158,0.08); }

/* Callout Manager custom callouts: pick up inline styles from data attributes */
.callout[style*="--callout-color"] {
  border-left-color: var(--callout-color);
}

/* Nested callouts */
.callout .callout {
  margin: 2mm 0;
}

/* --- Table of contents --- */
.toc {
  page-break-before: always;
  page-break-after: always;
}
.toc h2 {
  border-bottom: none;
  margin-bottom: 8mm;
}
.toc ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.toc li {
  margin: 0;
  padding: 2mm 0;
  border-bottom: 1px dotted #ddd;
  font-size: 10pt;
  color: #333;
}
.toc li.toc-h3 {
  padding-left: 8mm;
  font-size: 9pt;
  color: #666;
}
.toc li a {
  color: inherit;
  text-decoration: none;
}
.toc li a::after {
  content: target-counter(attr(href), page);
  float: right;
  color: ${a};
  font-weight: 600;
}

/* --- Legal notice --- */
.legal-footer {
  margin-top: 15mm;
  padding-top: 5mm;
  border-top: 1px solid #ccc;
  font-size: 7pt;
  color: #888;
  text-align: justify;
  line-height: 1.5;
}
.legal-footer .legal-title {
  font-weight: 700;
  color: #666;
  text-align: center;
  margin-bottom: 2mm;
}
${theme.watermarkText ? `
/* --- Watermark --- */
.rhino-watermark {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(${theme.watermarkRotation}deg);
  font-size: ${theme.watermarkFontSize};
  color: ${theme.watermarkColor};
  opacity: ${theme.watermarkOpacity};
  pointer-events: none;
  z-index: 1000;
  white-space: nowrap;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
}
` : ""}
`;
}

/**
 * Build the complete HTML document for PDF generation.
 */
export function buildHtml(
  bodyHtml: string,
  title: string,
  theme: PdfTheme,
  logoDataUri: string
): string {
  const css = buildCss(theme);
  const logoImg = logoDataUri
    ? `<img src="${logoDataUri}" alt="Logo">`
    : "";

  // Running header (logo + text, page 2+)
  const headerLogo =
    theme.showHeaderLogo && logoDataUri
      ? `<div class="running-header-logo">${logoImg}</div>`
      : "";
  const headerText = theme.headerText
    ? `<div class="running-header-text">${escapeHtml(resolveTextVariables(theme.headerText, title))}</div>`
    : "";

  // Running footer (pagination via paged.js CSS counters)
  let footerContent = "";
  if (theme.showPagination) {
    footerContent = '<span class="page-num"></span> / <span class="page-total"></span>';
  }
  if (theme.footerText) {
    const resolvedFooter = escapeHtml(resolveTextVariables(theme.footerText, title));
    footerContent += footerContent
      ? ` — ${resolvedFooter}`
      : resolvedFooter;
  }
  const footer = footerContent
    ? `<div class="running-footer">${footerContent}</div>`
    : "";

  // Cover page
  let cover = "";
  if (theme.showCover) {
    const coverLogo = logoDataUri
      ? `<img src="${logoDataUri}" alt="Logo">`
      : "";
    const subtitle = theme.subtitle
      ? `<div class="subtitle">${escapeHtml(theme.subtitle)}</div>`
      : "";
    cover = `
    <div class="cover">
      ${coverLogo}
      <h1>${escapeHtml(title)}</h1>
      ${subtitle}
    </div>`;
  }

  // Table of contents
  let toc = "";
  let processedBody = bodyHtml;
  if (theme.showToc) {
    const extracted = extractHeadings(bodyHtml);
    processedBody = extracted.html;
    toc = buildTocHtml(extracted.headings, theme.tocTitle || "Table of Contents");
  }

  // Legal notice
  let legal = "";
  if (theme.showLegal && theme.legalText) {
    const legalTitle = theme.legalTitle
      ? `<div class="legal-title">${escapeHtml(theme.legalTitle)}</div>`
      : "";
    legal = `<div class="legal-footer">${legalTitle}${escapeHtml(theme.legalText)}</div>`;
  }

  // paged.js bundled locally (base64-encoded at build time to avoid HTML parsing issues)
  const pagedJsB64: string = process.env.PAGED_JS_B64 as unknown as string;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>${css}</style>
  <script>
    window.__rhinoErrors = [];
    window.onerror = function(msg, src, line, col, err) {
      window.__rhinoErrors.push({msg: msg, src: src, line: line, err: String(err)});
    };
    window.PagedConfig = {
      auto: true,
      after: function() {${buildOutlineScript()}${buildWatermarkScript(theme)}
        document.title = "PAGED_READY";
      }
    };
  </script>
  <script>
    try {
      eval(atob("${pagedJsB64}"));
    } catch(e) {
      window.__rhinoErrors.push({msg: "eval failed", err: String(e)});
      document.title = "PAGED_READY";
    }
    setTimeout(function() {
      if (document.title !== "PAGED_READY") {
        window.__rhinoErrors.push({msg: "paged.js timeout fallback triggered"});
        document.title = "PAGED_READY";
      }
    }, 15000);
  </script>
</head>
<body>
  ${headerText}
  ${headerLogo}
  ${footer}
  ${cover}
  ${toc}
  ${processedBody}
  ${legal}
</body>
</html>`;
}

/**
 * Build a merged HTML document containing multiple notes, each starting on a new page.
 */
export function buildMergedHtml(
  sections: { title: string; bodyHtml: string }[],
  mergedTitle: string,
  theme: PdfTheme,
  logoDataUri: string
): string {
  const css = buildCss(theme);
  const logoImg = logoDataUri
    ? `<img src="${logoDataUri}" alt="Logo">`
    : "";

  // Running header (logo + text, page 2+)
  const headerLogo =
    theme.showHeaderLogo && logoDataUri
      ? `<div class="running-header-logo">${logoImg}</div>`
      : "";
  const headerText = theme.headerText
    ? `<div class="running-header-text">${escapeHtml(resolveTextVariables(theme.headerText, mergedTitle))}</div>`
    : "";

  // Running footer (pagination via paged.js CSS counters)
  let footerContent = "";
  if (theme.showPagination) {
    footerContent = '<span class="page-num"></span> / <span class="page-total"></span>';
  }
  if (theme.footerText) {
    const resolvedFooter = escapeHtml(resolveTextVariables(theme.footerText, mergedTitle));
    footerContent += footerContent
      ? ` — ${resolvedFooter}`
      : resolvedFooter;
  }
  const footer = footerContent
    ? `<div class="running-footer">${footerContent}</div>`
    : "";

  // Cover page with merged title
  let cover = "";
  if (theme.showCover) {
    const coverLogo = logoDataUri
      ? `<img src="${logoDataUri}" alt="Logo">`
      : "";
    const subtitle = theme.subtitle
      ? `<div class="subtitle">${escapeHtml(theme.subtitle)}</div>`
      : "";
    cover = `
    <div class="cover">
      ${coverLogo}
      <h1>${escapeHtml(mergedTitle)}</h1>
      ${subtitle}
    </div>`;
  }

  // Build sections with page breaks between each note
  // Extract all H2/H3 headings from each section for a full TOC
  let globalCounter = 0;
  let headingCounter = 0;
  const allHeadings: { level: number; text: string; id: string }[] = [];
  const processedSections = sections.map((s, i) => {
    const sectionId = `merged-${globalCounter++}`;
    // Section title as H2 in TOC
    allHeadings.push({ level: 2, text: s.title, id: sectionId });

    // Extract sub-headings (H2/H3) from the section body
    let sectionBody = s.bodyHtml;
    if (theme.showToc) {
      const extracted = extractHeadings(s.bodyHtml, headingCounter);
      headingCounter = extracted.counterEnd;
      sectionBody = extracted.html;
      for (const h of extracted.headings) {
        // Bump everything to H3 since section title is already H2
        allHeadings.push({ level: 3, text: h.text, id: h.id });
      }
    }

    const pageBreak = i > 0 ? ' style="page-break-before:always;"' : "";
    return `<div class="merged-section"${pageBreak}>
      <h2 id="${sectionId}">${escapeHtml(s.title)}</h2>
      ${sectionBody}
    </div>`;
  }).join("\n");
  const sectionsHtml = processedSections;

  // Table of contents for merged document
  let toc = "";
  if (theme.showToc) {
    toc = buildTocHtml(allHeadings, theme.tocTitle || "Table of Contents");
  }

  // Legal notice (once at the end)
  let legal = "";
  if (theme.showLegal && theme.legalText) {
    const legalTitle = theme.legalTitle
      ? `<div class="legal-title">${escapeHtml(theme.legalTitle)}</div>`
      : "";
    legal = `<div class="legal-footer">${legalTitle}${escapeHtml(theme.legalText)}</div>`;
  }

  const pagedJsB64: string = process.env.PAGED_JS_B64 as unknown as string;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>${css}</style>
  <script>
    window.__rhinoErrors = [];
    window.onerror = function(msg, src, line, col, err) {
      window.__rhinoErrors.push({msg: msg, src: src, line: line, err: String(err)});
    };
    window.PagedConfig = {
      auto: true,
      after: function() {${buildOutlineScript()}${buildWatermarkScript(theme)}
        document.title = "PAGED_READY";
      }
    };
  </script>
  <script>
    try {
      eval(atob("${pagedJsB64}"));
    } catch(e) {
      window.__rhinoErrors.push({msg: "eval failed", err: String(e)});
      document.title = "PAGED_READY";
    }
    setTimeout(function() {
      if (document.title !== "PAGED_READY") {
        window.__rhinoErrors.push({msg: "paged.js timeout fallback triggered"});
        document.title = "PAGED_READY";
      }
    }, 15000);
  </script>
</head>
<body>
  ${headerText}
  ${headerLogo}
  ${footer}
  ${cover}
  ${toc}
  ${sectionsHtml}
  ${legal}
</body>
</html>`;
}

/**
 * Extract H2/H3 headings from body HTML and add IDs for TOC linking.
 * Returns the modified HTML and the list of headings.
 */
function extractHeadings(bodyHtml: string, counterStart = 0): {
  html: string;
  headings: { level: number; text: string; id: string }[];
  counterEnd: number;
} {
  const headings: { level: number; text: string; id: string }[] = [];
  let counter = counterStart;
  const html = bodyHtml.replace(/<(h[23])([^>]*)>([\s\S]*?)<\/\1>/gi, (_match: string, tag: string, attrs: string, content: string) => {
    const level = parseInt(tag[1]);
    const text = content.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();
    const id = `toc-${counter++}`;
    headings.push({ level, text, id });
    return `<${tag}${attrs} id="${id}">${content}</${tag}>`;
  });
  return { html, headings, counterEnd: counter };
}

/**
 * Build a table of contents HTML block from headings.
 */
function buildTocHtml(headings: { level: number; text: string; id: string }[], tocTitle = "Table of Contents"): string {
  if (headings.length === 0) return "";
  const items = headings.map((h) => {
    const cls = h.level === 3 ? ' class="toc-h3"' : "";
    return `<li${cls}><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`;
  }).join("\n      ");
  return `
    <div class="toc">
      <h2>${escapeHtml(tocTitle)}</h2>
      <ul>
      ${items}
      </ul>
    </div>`;
}

/**
 * Resolve relative/internal image paths in rendered HTML to absolute file:// URLs.
 * This is needed because the HTML is loaded from a temp file outside the vault.
 */
export function resolveImagePaths(html: string, vaultBasePath: string): string {
  return html.replace(/<img([^>]*)\ssrc="([^"]+)"([^>]*)>/gi, (match: string, before: string, src: string, after: string) => {
    // Skip data URIs and absolute URLs
    if (src.startsWith("data:") || src.startsWith("http://") || src.startsWith("https://") || src.startsWith("file://")) {
      return match;
    }

    // Strip Obsidian's app:// protocol
    let resolvedPath: string = src;
    if (src.startsWith("app://")) {
      // app://local/<absolute-path> or app://obsidian.md/<absolute-path>
      const appMatch = src.match(/^app:\/\/[^/]+(\/.+)$/);
      if (appMatch) {
        resolvedPath = decodeURIComponent(appMatch[1]);
        return `<img${before} src="file://${resolvedPath}"${after}>`;
      }
    }

    // Relative path — resolve from vault root
    // Decode percent-encoded characters
    resolvedPath = decodeURIComponent(resolvedPath);
    // Remove leading ./
    if (resolvedPath.startsWith("./")) {
      resolvedPath = resolvedPath.substring(2);
    }
    const absolutePath = vaultBasePath + "/" + resolvedPath;
    return `<img${before} src="file://${encodeURI(absolutePath).replace(/#/g, "%23")}"${after}>`;
  });
}

/**
 * Build JS snippet that injects watermark divs into each paged.js page.
 * Returns empty string if no watermark is configured.
 */
/**
 * Build JS snippet that collects heading positions for PDF bookmarks.
 * Stores [{title, level, page}] in window.__rhinoOutline.
 */
function buildOutlineScript(): string {
  return `
        window.__rhinoOutline = [];
        var headings = document.querySelectorAll("h1, h2, h3");
        for (var i = 0; i < headings.length; i++) {
          var h = headings[i];
          var page = h.closest(".pagedjs_page");
          if (page) {
            var pageNum = parseInt(page.getAttribute("data-page-number") || "0");
            window.__rhinoOutline.push({
              title: h.textContent || "",
              level: parseInt(h.tagName[1]),
              page: pageNum
            });
          }
        }`;
}

function buildWatermarkScript(theme: PdfTheme): string {
  if (!theme.watermarkText) return "";
  const text = theme.watermarkText.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `
        var boxes = document.querySelectorAll(".pagedjs_pagebox");
        for (var i = 0; i < boxes.length; i++) {
          boxes[i].style.position = "relative";
          var wm = document.createElement("div");
          wm.className = "rhino-watermark";
          wm.textContent = '${text}';
          boxes[i].appendChild(wm);
        }`;
}

/**
 * Replace {title} and {date} placeholders in header/footer text.
 */
function resolveTextVariables(text: string, title: string): string {
  return text
    .replace(/\{title\}/gi, title)
    .replace(/\{date\}/gi, new Date().toLocaleDateString());
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
