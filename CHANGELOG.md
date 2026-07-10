# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-07-10

### Fixed
- **`minAppVersion` corrected to 1.4.10.** 1.3.0 declared 1.4.0 but uses
  `AbstractInputSuggest` and `processFrontMatter`, added in 1.4.10 and 1.4.4.
  On older apps the font path autocomplete or "Save to note" would have thrown.
- Removed the three `eslint-disable` comments the community-plugin review
  rejects: the deprecations they silenced only exist in Obsidian's pre-release
  typings, so pinning the `obsidian` dev dependency to the stable 1.12.x line
  makes them unnecessary. The lint config now matches the reviewers' (typed
  rules enabled), so `npx eslint src/` catches what the review catches.
- Dropped an unnecessary type assertion and the last `!important` (styled by
  specificity instead).

## [1.3.0] - 2026-07-10

Configuration is now layered: the theme carries the defaults, the note overrides
them, the export modal has the last word.

### Added
- **"This document" section** in both export modals: change the subtitle, cover,
  table of contents, watermark and classification banner right before exporting,
  without touching the theme.
- **"Save to note"**: writes the modal's overrides into the note's `rhino-pdf`
  frontmatter, so any last-minute tweak becomes reproducible. It merges onto the
  existing block, preserving keys the modal does not expose.
- **"Save as theme default"**: promotes the modal's overrides to the theme,
  duplicating it first when it is built-in.
- **`theme:` frontmatter key**: pin a base theme per note, by id or by name.
- **`order:` frontmatter key**: sort notes in a merged batch export. Chapters no
  longer need `01-` filename prefixes.
- **`coverInfo:` frontmatter key**: the cover info block selection is finally
  persisted. The checkboxes used to reset on every open.
- **Cover info block in the theme** (`coverInfoFields`) as the default selection,
  and in batch export, where it was missing entirely.
- **Override badge** in the export modal, reporting how many settings the note's
  frontmatter changes, plus a second badge listing keys rejected by validation.
- **"Export note as PDF with last settings"** command: no dialog, uses the pinned
  theme and writes next to the note (or to the last folder used). Overwrites an
  existing PDF of the same name.
- **Embedded fonts**: point a theme at font files in your vault (woff2, woff, ttf,
  otf) and they are inlined into the PDF. A document then renders identically on
  any machine, whether or not the font is installed — which is what a client's
  charter usually requires. One row per weight, so bold is a real bold rather
  than a synthesized one.
- **Font metadata is read from the file**, not guessed from its name: pick a font
  and its family, weight and style fill themselves in. Variable fonts report
  their real range (Inter is `100 900`). "Import from folder" turns a folder of
  font files into ready-to-use rows in one click.
- **Duplicate** button on every theme, built-ins included.

### Changed
- **BREAKING — `rhino-pdf` frontmatter must be valid YAML.** The hand-rolled
  parser was replaced by Obsidian's own. It was lenient and accepted values that
  YAML rejects, typically `paginationFormat: {page}/{pages}`, where `{` opens a
  flow mapping. Quote such values: `paginationFormat: "{page}/{pages}"`.
  Unknown or invalid keys are now ignored and reported instead of applied.
- Overrides resolve consistently everywhere: modal > frontmatter > theme. Batch
  export used to let the frontmatter win over the dialog.
- Merged batch exports honour each note's page-break settings.
- **Fonts are bundled.** Inter and JetBrains Mono ship as `@font-face` rules with
  the woff2 embedded (latin + latin-ext subsets, 173 KB), injected only when a
  theme uses them. Exports are fully offline and make no network request.
- Theme editor sections follow the order things appear in the document, margins
  are four inputs, and watermark opacity/rotation are sliders. All three used to
  discard invalid input without a word.
- The export modal's preview is debounced; every keystroke used to rerun paged.js.
- "Edit theme" no longer closes the modal and discards your overrides.

### Fixed
- An empty value in the modal now clears a value set by the theme. Truthiness
  checks made it impossible to remove a theme's subtitle.
- A watermark containing `</script>` no longer breaks the whole render.
- `lastOutputDir` and any future plugin setting are actually persisted;
  `saveSettings()` only ever wrote `lastUsedThemeId`.
- Duplicating a theme deep-copies its margins instead of sharing them.

## [1.2.0] - 2026-06-14

### Added
- **External link display**: per-theme option to keep links as-is, show the URL
  inline `(https://…)`, or move it to a real footnote at the bottom of the page
  (via paged.js footnotes).
- **Configurable pagination format**: footer page number uses a `{page}`/`{pages}`
  template, e.g. "Page {page} of {pages}".
- **Automatic heading numbering**: optional H2/H3 numbering (1, 1.1, …), kept in
  sync with the table of contents.

### Fixed
- Table of contents links are now reliably clickable: headings that already carry
  an `id` reuse it instead of getting a duplicate `id` attribute.

## [1.1.1] - 2026-06-14

### Changed
- **PDF metadata** is now opt-in per theme (toggle in the theme editor, off by
  default). Previously it was always written, including the producer signature.

## [1.1.0] - 2026-06-14

### Added
- **PDF metadata**: title/author/subject/keywords are written into the PDF document
  properties, read from the note frontmatter (`author`, `subject`, `keywords`/`tags`).
- **Classification banner**: optional text (e.g. "RESTRICTED") centered on every page,
  cover included, with a configurable color. Supports text variables.
- **Manual page break**: insert `<!-- pagebreak -->` on its own line to force a new page.
- **Automatic page breaks**: per-theme toggles to start a new page before every
  H1/H2/H3 (cover and table-of-contents headings are never broken).
- **Extended text variables**: header/footer/classification text now resolve
  `{filename}`, `{author}`, `{time}` and `{fm.KEY}` (any frontmatter field), on top of
  `{title}` and `{date}`.
- **Cover info block**: pick frontmatter fields (author, date, …) via checkboxes in the
  export modal to list them as a table on the cover page.
- Third-party attribution: `THIRD_PARTY_NOTICES.md` and a legal banner at the top of
  `main.js` for the bundled MIT libraries (paged.js, pdf-lib).

### Changed
- Theme editor: field descriptions now list all available text variables; new
  "Classification banner" and "Page break before headings" sections.

## [1.0.2] - 2026-06-13

### Changed
- Addressed Obsidian review feedback: use `activeDocument` instead of `document`
  (popout-window compatibility) and `window.setTimeout` instead of `setTimeout`.

### CI
- Release workflow now attaches build provenance attestations to release assets and
  runs on Node 24 (`actions/checkout` and `setup-node` bumped to v6).

## [1.0.1] - 2026-06-13

### Fixed
- Truncated PDFs on large documents: paged.js completion is now detected via a rich
  state signal (done/timeout) with a generous timeout, the layout waits for fonts and
  two paint frames before capture, and the exported page count is verified against
  paged.js (with one retry on mismatch).

### Changed
- Refactored `render.ts` to share head/header/footer/cover/legal helpers between single
  and merged HTML builders; minor export-pipeline performance improvements.

## [1.0.0] - 2026-03-10

### Added
- Initial release: themed Markdown-to-PDF export with cover page, table of contents,
  running headers/footers, pagination, watermark, legal notice, logo, Obsidian callouts,
  PDF bookmarks, custom themes (JSON import/export), batch and merge export, and
  per-note `rhino-pdf` frontmatter overrides.

[1.2.0]: https://github.com/degun-osint/obsidian-rhino-pdf-export/releases/tag/1.2.0
[1.1.1]: https://github.com/degun-osint/obsidian-rhino-pdf-export/releases/tag/1.1.1
[1.1.0]: https://github.com/degun-osint/obsidian-rhino-pdf-export/releases/tag/1.1.0
[1.0.2]: https://github.com/degun-osint/obsidian-rhino-pdf-export/releases/tag/1.0.2
[1.0.1]: https://github.com/degun-osint/obsidian-rhino-pdf-export/releases/tag/1.0.1
[1.0.0]: https://github.com/degun-osint/obsidian-rhino-pdf-export/releases/tag/1.0.0
