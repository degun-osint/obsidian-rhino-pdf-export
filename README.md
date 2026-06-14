# Rhino PDF Export for Obsidian

Export Markdown notes to beautifully styled PDFs with configurable themes: colors, logo, header/footer, watermark, PDF bookmarks, legal notice.

## Features

- **Built-in themes**: Minimal (clean, serif)
- **Custom themes**: create and configure your own themes (colors, logo, fonts, margins, legal notice)
- **Theme import/export**: share themes as JSON files
- **Theme persistence**: custom themes are stored in `.obsidian/rhino-pdf-themes.json`, outside the plugin folder (survives plugin updates)
- **Live preview**: PDF preview in the export modal before generating
- **Batch export**: export all notes in a folder with one click (right-click on folder)
- **Merge mode**: combine all notes in a folder into a single PDF with a full table of contents
- **Table of contents**: auto-generated from H2/H3 headings, with page numbers and customizable title
- **YAML frontmatter**: override theme settings per note via the `rhino-pdf` key
- **Export overrides**: subtitle can be changed in the export modal without modifying the theme
- **Obsidian callouts**: full callout rendering with colors and icons (all standard types + [Callout Manager](https://github.com/eth-p/obsidian-callout-manager) compatibility)
- **Watermark**: optional text watermark on every page (configurable text, color, opacity, font size, rotation)
- **Dynamic headers/footers**: header and footer text support `{title}` and `{date}` variables, resolved at export time
- **PDF bookmarks**: clickable outline (H1/H2/H3) generated automatically in the PDF, visible in any PDF reader's sidebar
- **Edit theme shortcut**: "Edit theme" button in the export modal opens the theme editor directly
- **Logo**: displayed on cover page + small version in the top-right corner of subsequent pages
- **Pagination**: page number / total in footer (CSS counters via paged.js)
- **Legal notice**: optional block at the end of the document
- **CSS Paged Media**: rendered via paged.js (running headers, margin boxes, page counters)
- **Offline**: paged.js is bundled locally, no CDN required

## Installation

### From Obsidian

Settings → Community plugins → Browse → search "Rhino PDF Export" → Install → Enable. (waiting for validation on march 10th 2026)

### Manual

Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/degun-osint/obsidian-rhino-pdf-export/releases/latest), then copy them into your vault at `.obsidian/plugins/rhino-pdf-export/`.

### From source

```bash
git clone https://github.com/degun-osint/obsidian-rhino-pdf-export.git
cd obsidian-rhino-pdf-export
npm install && npm run build
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/rhino-pdf-export/
```

## Usage

- **Command palette**: `Export note as PDF`
- **Right-click** on a `.md` file → `Export note as PDF`
- **Right-click** on a folder → `Export folder as PDF`

The export modal shows a live PDF preview and lets you pick the theme, override the subtitle, jump to the theme editor, and choose the output location.

For folder export, a toggle lets you merge all notes into a single PDF with a global table of contents.

## YAML Frontmatter

Add a `rhino-pdf` block in a note's frontmatter to override theme settings:

```yaml
---
rhino-pdf:
  primaryColor: "#e63946"
  showCover: false
  subtitle: "My subtitle"
  watermarkText: "DRAFT"
  headerText: "{title} — {date}"
  margins:
    top: 30mm
    bottom: 30mm
---
```

All `PdfTheme` fields are supported.

## Callouts

All standard Obsidian callout types are supported with their colors and icons:

`note`, `abstract`/`summary`/`tldr`, `info`, `tip`/`hint`/`important`, `success`/`check`/`done`, `question`/`help`/`faq`, `warning`/`caution`/`attention`, `failure`/`fail`/`missing`, `danger`/`error`, `bug`, `example`, `quote`/`cite`

Nested callouts are supported. Custom callouts from the [Callout Manager](https://github.com/eth-p/obsidian-callout-manager) plugin are also supported (colors via CSS custom properties) — custom icons are not carried over, but styling (color, background) is preserved.

## Theme Configuration

Settings → Rhino PDF Export:

- Browse built-in themes
- Create / edit / delete custom themes
- Import / export themes as JSON
- Per theme: colors, logo (vault path), cover page, subtitle, table of contents (+ custom title), header logo, header text (`{title}`, `{date}`), pagination, footer text (`{title}`, `{date}`), watermark (text, color, opacity, size, rotation), legal notice, fonts, font size, page size, orientation, margins

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # production
```

### Structure

```
src/
├── main.ts         # Entry point, commands and context menus
├── types.ts        # PdfTheme, PluginSettings interfaces
├── themes.ts       # Built-in themes + factory
├── settings.ts     # Settings tab (theme editor, JSON import/export)
├── modal.ts        # Export modal with live preview
├── batch.ts        # Batch export (full folder)
├── frontmatter.ts  # YAML frontmatter parsing → theme overrides
├── render.ts       # HTML + CSS Paged Media generation
├── pdf.ts          # Electron BrowserWindow + printToPDF
└── vendor/
    └── paged.polyfill.txt  # paged.js v0.4.3 bundled
```

### Tech Stack

- TypeScript + esbuild
- Obsidian API (MarkdownRenderer, Plugin, Modal, SettingTab)
- paged.js v0.4.3 (CSS Paged Media polyfill, bundled locally)
- pdf-lib (PDF bookmarks/outline generation)
- Electron BrowserWindow + printToPDF

## Acknowledgments

Inspired by [Better Export PDF](https://github.com/l1xnan/obsidian-better-export-pdf).

This plugin bundles and redistributes the following MIT-licensed libraries:

- [paged.js](https://pagedjs.org) v0.4.3 — CSS Paged Media polyfill © 2018 Adam Hyde
- [pdf-lib](https://github.com/Hopding/pdf-lib) v1.17.1 — PDF generation © 2019 Andrew Dillon

Their full license texts are reproduced in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

GPLv3
