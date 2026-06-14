# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.0]: https://github.com/degun-osint/obsidian-rhino-pdf-export/releases/tag/1.1.0
[1.0.2]: https://github.com/degun-osint/obsidian-rhino-pdf-export/releases/tag/1.0.2
[1.0.1]: https://github.com/degun-osint/obsidian-rhino-pdf-export/releases/tag/1.0.1
[1.0.0]: https://github.com/degun-osint/obsidian-rhino-pdf-export/releases/tag/1.0.0
