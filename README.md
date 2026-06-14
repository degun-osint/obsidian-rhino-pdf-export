# Rhino PDF Export for Obsidian

Export Markdown notes to beautifully styled PDFs with configurable themes: colors, logo, header/footer, watermark, PDF bookmarks, legal notice.

## What's new in 1.2.0

- **External links**: show the URL inline `(https://…)` or as a real footnote
- **Configurable pagination format** (`{page}` / `{pages}`)
- **Automatic heading numbering** (1, 1.1, …), synced with the table of contents
- **Clickable table of contents** in the exported PDF

See the full [changelog](CHANGELOG.md) for earlier releases (PDF metadata, classification banner, page breaks, cover info block…).

## Features

- **Built-in themes**: Minimal (clean, serif)
- **Custom themes**: create and configure your own themes (colors, logo, fonts, margins, legal notice)
- **Theme import/export**: share themes as JSON files
- **Theme persistence**: custom themes are stored in `.obsidian/rhino-pdf-themes.json`, outside the plugin folder (survives plugin updates)
- **Live preview**: PDF preview in the export modal before generating
- **Batch export**: export all notes in a folder with one click (right-click on folder)
- **Merge mode**: combine all notes in a folder into a single PDF with a full table of contents
- **Table of contents**: auto-generated from H2/H3 headings, clickable, with page numbers and customizable title
- **Heading numbering**: optional automatic numbering of H2/H3 (1, 1.1, …), synced with the table of contents
- **External links**: optionally show link URLs inline or as page footnotes
- **YAML frontmatter**: override theme settings per note via the `rhino-pdf` key
- **Export overrides**: subtitle can be changed in the export modal without modifying the theme
- **Obsidian callouts**: full callout rendering with colors and icons (all standard types + [Callout Manager](https://github.com/eth-p/obsidian-callout-manager) compatibility)
- **Watermark**: optional text watermark on every page (configurable text, color, opacity, font size, rotation)
- **Dynamic headers/footers**: header, footer and classification text support `{title}`, `{filename}`, `{author}`, `{date}`, `{time}` and `{fm.key}` (any frontmatter field), resolved at export time
- **PDF bookmarks**: clickable outline (H1/H2/H3) generated automatically in the PDF, visible in any PDF reader's sidebar
- **PDF metadata** (optional, per theme): title/author/subject/keywords written into the document properties, read from the note frontmatter
- **Classification banner**: optional text (e.g. "RESTRICTED") centered on every page, including the cover
- **Manual page breaks**: insert `<!-- pagebreak -->` in a note to force a new page
- **Automatic page breaks**: optionally start a new page before every H1/H2/H3 (per theme)
- **Cover info block**: pick frontmatter fields (author, date, …) to list in a table on the cover, via checkboxes in the export modal
- **Edit theme shortcut**: "Edit theme" button in the export modal opens the theme editor directly
- **Logo**: displayed on cover page + small version in the top-right corner of subsequent pages
- **Pagination**: configurable footer format (`{page}` / `{pages}`, via paged.js CSS counters)
- **Legal notice**: optional block at the end of the document
- **CSS Paged Media**: rendered via paged.js (running headers, margin boxes, page counters)
- **Offline**: paged.js is bundled locally, no CDN required

## Installation

### From Obsidian

Settings → Community plugins → Browse → search "Rhino PDF Export" → Install → Enable.

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
  classificationText: "RESTRICTED"
  pageBreakBeforeH2: true
  margins:
    top: 30mm
    bottom: 30mm
---
```

All `PdfTheme` fields are supported.

## Help & reference

### Text variables

Header, footer and classification text resolve these placeholders at export time:

| Variable | Value |
|---|---|
| `{title}` | Note title (first `# H1`, or filename) |
| `{filename}` | Note file name (without extension) |
| `{author}` | Frontmatter `author` field |
| `{date}` | Export date (locale format) |
| `{time}` | Export time (locale format) |
| `{fm.KEY}` | Any frontmatter field, e.g. `{fm.case_id}` |

### Manual page break

Put this on its own line anywhere in a note to force a new page:

```markdown
<!-- pagebreak -->
```

### Automatic page breaks

In the theme editor (Page layout → "Page break before headings"), toggle **Before heading 1/2/3** to start a new page before every heading of that level. Cover and table-of-contents headings are never affected.

### Classification banner

Set **Classification text** in the theme editor (or `classificationText` in frontmatter) to print a centered banner on every page, cover included. It supports the text variables above, so `DIFFUSION RESTREINTE — {fm.case_id}` works. Color is configurable.

### PDF metadata

Enable **PDF metadata** in the theme editor to fill the generated PDF's document properties from the note frontmatter (off by default):

| PDF property | Frontmatter field |
|---|---|
| Title | note title |
| Author | `author` |
| Subject | `subject` |
| Keywords | `keywords` or `tags` |

### Cover info block

In the export modal, each frontmatter field of the note appears as a checkbox under **Cover info block**. Tick the ones you want and they are listed as a label/value table on the cover page (requires a theme with a cover). Example frontmatter:

```yaml
---
author: Degun
subject: OSINT report
case_id: AFFAIRE-2026-0042
tags: [osint, report]
---
```

### External links

The **External links** theme option controls how external (`http`/`https`) link
addresses are rendered:

- **Keep as links** — unchanged (clickable, address hidden)
- **Show inline** — appends ` (https://…)` after the link text
- **As footnote** — moves the address to a numbered footnote at the bottom of the page

### Pagination format

The footer page number uses a template with `{page}` and `{pages}`, so you can set
e.g. `{page} / {pages}`, `Page {page} of {pages}` or `- {page} -`.

### Heading numbering

Enable **Number headings** in the theme editor to automatically prefix H2/H3 with
`1`, `1.1`, … The numbering is computed at print time and stays in sync with the
table of contents.

### Clickable table of contents

Table-of-contents entries link to their heading and are clickable in the exported
PDF (in addition to the PDF bookmarks/outline shown in a reader's sidebar).

## Callouts

All standard Obsidian callout types are supported with their colors and icons:

`note`, `abstract`/`summary`/`tldr`, `info`, `tip`/`hint`/`important`, `success`/`check`/`done`, `question`/`help`/`faq`, `warning`/`caution`/`attention`, `failure`/`fail`/`missing`, `danger`/`error`, `bug`, `example`, `quote`/`cite`

Nested callouts are supported. Custom callouts from the [Callout Manager](https://github.com/eth-p/obsidian-callout-manager) plugin are also supported (colors via CSS custom properties) — custom icons are not carried over, but styling (color, background) is preserved.

## Theme Configuration

Settings → Rhino PDF Export:

- Browse built-in themes
- Create / edit / delete custom themes
- Import / export themes as JSON
- Per theme: colors, logo (vault path), cover page, subtitle, table of contents (+ custom title), header logo, header text, pagination, footer text, classification banner (text + color), watermark (text, color, opacity, size, rotation), legal notice, fonts, font size, page size, orientation, margins, page break before headings (H1/H2/H3)
- Header/footer/classification text support variables (see [Help & reference](#help--reference))

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
