# Rhino PDF Export for Obsidian

Export Markdown notes to beautifully styled PDFs with configurable themes: colors, logo, header/footer, watermark, PDF bookmarks, legal notice.

## What's new in 1.3.0

Configuration is now layered: **the theme carries the defaults, the note overrides them, the export modal has the last word.**

- **"This document" section** in the export modal: subtitle, cover, table of contents, watermark and classification, changeable right before exporting
- **"Save to note"**: writes those overrides into the note's frontmatter, so a one-off tweak becomes reproducible
- **`theme:` frontmatter key**: pin a base theme per note
- **`order:` frontmatter key**: sort chapters in a merged export, without `01-` filename prefixes
- **Embedded fonts**: point a theme at font files in your vault and they are inlined into the PDF. Family, weight and style are read from the file itself; "Import from folder" configures a whole family in one click
- **Fully offline**: fonts are bundled, exporting makes no network request
- **Quick export command**: no dialog, straight to a PDF next to the note
- **Duplicate** any theme, built-ins included

⚠️ **Breaking**: `rhino-pdf` frontmatter must now be valid YAML — quote values containing `{`, `:` or `#`. See the [changelog](CHANGELOG.md).

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
- **YAML frontmatter**: override theme settings per note via the `rhino-pdf` key, including which theme to use
- **Export overrides**: change subtitle, cover, TOC, watermark and classification in the export modal, then save them to the note or to the theme
- **Obsidian callouts**: full callout rendering with colors and icons (all standard types + [Callout Manager](https://github.com/eth-p/obsidian-callout-manager) compatibility)
- **Watermark**: optional text watermark on every page (configurable text, color, opacity, font size, rotation)
- **Dynamic headers/footers**: header, footer and classification text support `{title}`, `{filename}`, `{author}`, `{date}`, `{time}` and `{fm.key}` (any frontmatter field), resolved at export time
- **PDF bookmarks**: clickable outline (H1/H2/H3) generated automatically in the PDF, visible in any PDF reader's sidebar
- **PDF metadata** (optional, per theme): title/author/subject/keywords written into the document properties, read from the note frontmatter
- **Classification banner**: optional text (e.g. "RESTRICTED") centered on every page, including the cover
- **Manual page breaks**: insert `<!-- pagebreak -->` in a note to force a new page
- **Automatic page breaks**: optionally start a new page before every H1/H2/H3 (per theme)
- **Cover info block**: pick frontmatter fields (author, date, …) to list in a table on the cover, via checkboxes in the export modal; persisted per note (`coverInfo`) or per theme
- **Merge ordering**: sort notes of a merged export with the `order` frontmatter key
- **Quick export**: "Export note as PDF with last settings" skips the modal entirely
- **Edit theme shortcut**: "Edit theme" button in the export modal opens the theme editor without losing your overrides
- **Logo**: displayed on cover page + small version in the top-right corner of subsequent pages
- **Pagination**: configurable footer format (`{page}` / `{pages}`, via paged.js CSS counters)
- **Legal notice**: optional block at the end of the document
- **CSS Paged Media**: rendered via paged.js (running headers, margin boxes, page counters)
- **Embedded fonts**: reference font files from your vault (woff2, woff, ttf, otf) and they are inlined into the PDF — same rendering on every machine, even if the font is not installed
- **Offline**: paged.js and the Inter / JetBrains Mono fonts are bundled locally. Exporting never touches the network, so a document can be exported air-gapped and the act of exporting it leaks nothing

## Installation

### From Obsidian

Settings → Community plugins → Browse → search "Rhino PDF Export" → Install → Enable. Or get it there : https://community.obsidian.md/plugins/rhino-pdf-export

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

- **Command palette**: `Export note as PDF`, or `Export note as PDF with last settings` to skip the modal
- **Right-click** on a `.md` file → `Export note as PDF`
- **Right-click** on a folder → `Export folder as PDF`

The export modal shows a live PDF preview, lets you pick the theme, and opens a **"This document"** section for the settings you want to change just this once.

For folder export, a toggle lets you merge all notes into a single PDF with a global table of contents.

## Where settings live

Three layers, resolved in this order — **the export modal wins, then the note, then the theme**:

| Layer | Holds | Edited in |
|---|---|---|
| **Theme** | The charter: colors, fonts, logo, margins, page size, legal notice | Settings → theme editor |
| **Note** | What is specific to this document: subtitle, watermark, classification, cover info | The `rhino-pdf` frontmatter key |
| **Export** | A one-off change, before hitting Export | The "This document" section |

Two buttons bridge the layers. **Save to note** writes the modal's overrides into the note's frontmatter — that is how a one-off tweak becomes reproducible. **Save as theme default** promotes them to the theme instead, duplicating it first if it is built-in.

## YAML frontmatter

Add a `rhino-pdf` block in a note's frontmatter to override theme settings:

```yaml
---
rhino-pdf:
  theme: "Corporate Report"      # pin a theme, by name or id
  primaryColor: "#e63946"
  showCover: false
  subtitle: "My subtitle"
  watermarkText: "DRAFT"
  headerText: "{title} — {date}"
  classificationText: "RESTRICTED"
  pageBreakBeforeH2: true
  coverInfo: [author, case_id]   # cover info block for this note
  order: 2                       # position in a merged folder export
  margins:
    top: 30mm
    bottom: 30mm
---
```

Every theme field is supported except `id`, `name` and `builtin` — a note must not be able to rename the theme it resolves against.

Values must be **valid YAML**. Quote anything containing `{`, `:` or `#`, or YAML will read it as structure:

```yaml
rhino-pdf:
  paginationFormat: "{page} / {pages}"   # quoted — `{` would open a flow mapping
  primaryColor: "#e63946"                # quoted — `#` would start a comment
```

Unknown or invalid keys are ignored rather than applied, and the export modal shows a badge listing them.

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

In the theme editor (Page layout → "Page breaks"), toggle **Before heading 1/2/3** to start a new page before every heading of that level. Cover and table-of-contents headings are never affected.

Set `pageBreakBeforeH2: true` in a note's frontmatter and it applies to that note only, including inside a merged folder export.

### Merge order

In a merged folder export, notes are sorted by their `rhino-pdf.order` frontmatter key, then alphabetically. Notes without one come last.

```yaml
---
rhino-pdf:
  order: 1
---
```

### Quick export

`Export note as PDF with last settings` exports without opening the modal. It uses the theme pinned by the note's `rhino-pdf.theme`, falling back to the last theme you used, and writes to the folder of your last export (or next to the note). **It overwrites an existing PDF of the same name without asking** — the destination is shown in the notice.

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

In the export modal, under **This document → Cover info block**, each frontmatter field of the note appears as a checkbox. Tick the ones you want and they are listed as a label/value table on the cover page (requires a theme with a cover). Example frontmatter:

```yaml
---
author: Degun
subject: OSINT report
case_id: AFFAIRE-2026-0042
tags: [osint, report]
---
```

The selection is remembered where you save it: **Save to note** writes `coverInfo: [author, case_id]` into the note, and **Save as theme default** stores it as the theme's `coverInfoFields`, applied to every note exported with it.

### Embedded fonts

A font named in **Body font** / **Code font** must be installed on the machine running the export, or it falls back silently. To avoid that, drop the font files in your vault and reference them under **Settings → theme → Embedded fonts**: they get inlined into the PDF, so the document renders identically everywhere.

Drop your font files in the vault, then either:

- **Import from folder** — pick the folder and every font in it becomes a row, ready to use;
- **Add font file** — start typing a path, pick from the suggestions.

Either way the family, weight and style are **read from the font file itself**, not guessed from its name. Variable fonts are detected and get their real range (`100 900` for Inter). Correct any field afterwards if you want to.

| Field | Example |
|---|---|
| Family | `Marianne` |
| File | `assets/fonts/Marianne-Regular.woff2` |
| Weight | `400`, or `100 900` for a variable font |
| Style | Normal / Italic |

Add one row per weight and style you actually use — with only a regular file, the bold is synthesized by the renderer and it shows in print. Then use the family in the font fields: `'Marianne', sans-serif`.

Supported formats are woff2 (recommended), woff, ttf and otf. Font collections (`.ttc`) are not supported — `@font-face` cannot use them. An embedded family takes precedence over a system font of the same name. If a file is missing or invalid, the export tells you rather than quietly falling back.

Inter and JetBrains Mono are already bundled with the plugin — no need to add them.

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
- Duplicate any theme, built-ins included, to start from it
- Create / edit / delete custom themes
- Import / export themes as JSON
- Per theme: colors, logo (vault path), cover page, subtitle, cover info block, table of contents (+ custom title), heading numbering, header logo, header text, pagination format, footer text, external link display, classification banner (text + color), watermark (text, color, opacity, size, rotation), legal notice, PDF metadata, fonts, embedded font files, font size, page size, orientation, margins, page break before headings (H1/H2/H3)
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
├── main.ts           # Entry point, commands and context menus
├── types.ts          # PdfTheme, DocConfig, CustomFont, PluginSettings
├── themes.ts         # Built-in themes + factory + duplication
├── settings.ts       # Settings tab (theme editor, JSON import/export)
├── modal.ts          # Export modal with live preview
├── batch.ts          # Batch export (full folder)
├── doc-config-ui.ts  # "This document" overrides section, shared by both modals
├── frontmatter.ts    # rhino-pdf validation + theme resolution
├── export.ts         # Shared note → PDF pipeline + asset cache
├── font-meta.ts      # sfnt/woff/woff2 parser: family, weight, style
├── font-picker.ts    # Vault font autocomplete + folder import
├── render.ts         # HTML + CSS Paged Media generation
├── pdf.ts            # Electron BrowserWindow + printToPDF
└── vendor/
    ├── paged.polyfill.txt   # paged.js v0.4.3 bundled
    ├── inter.css            # Inter, woff2 inlined as data URIs
    └── jetbrains-mono.css   # JetBrains Mono, same

scripts/
└── vendor-fonts.mjs  # Regenerates the two vendored stylesheets
```

Fonts are vendored, not fetched. `node scripts/vendor-fonts.mjs` re-downloads Inter and JetBrains Mono from Google Fonts, keeps the latin and latin-ext subsets, and inlines each woff2 as a data URI. Both are variable fonts, so one `@font-face` per subset carries a `font-weight` range.

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

And the following typefaces, under the SIL Open Font License 1.1:

- [Inter](https://github.com/rsms/inter) © 2016 The Inter Project Authors
- [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) © 2020 The JetBrains Mono Project Authors

Their full license texts are reproduced in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

GPLv3
