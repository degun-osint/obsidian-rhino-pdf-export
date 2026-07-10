/**
 * Vendor the fonts used by the built-in themes so exports work offline.
 *
 * Fetches the CSS Google Fonts serves to a modern browser (woff2, already
 * subsetted by them), inlines each font file as a data: URI, and writes one
 * stylesheet per family to src/vendor/.
 *
 * Two things keep the payload down:
 * - Only the latin and latin-ext subsets are kept. latin-ext carries œ/Œ, which
 *   French needs; cyrillic, greek and vietnamese would triple the size.
 * - Both families are variable fonts: Google serves one file per subset and
 *   repeats it in a @font-face per requested weight. We emit a single rule per
 *   subset with a `font-weight` range, so the file is embedded once instead of
 *   three times (525 KB -> 178 KB for Inter).
 *
 * Run manually when a font needs updating:  node scripts/vendor-fonts.mjs
 */
import { writeFileSync } from "fs";

// Pretend to be Chrome, or Google serves ttf instead of woff2.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const KEPT_SUBSETS = new Set(["latin", "latin-ext"]);

const FAMILIES = [
  { file: "inter.css", url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" },
  { file: "jetbrains-mono.css", url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" },
];

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

async function fetchWoff2(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const field = (rule, name) => rule.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

/** Google labels each @font-face with a `/* subset *\/` comment above it. */
function parseFontFaces(css) {
  const faces = [];
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const rule = m[2];
    faces.push({
      subset: m[1],
      family: field(rule, "font-family"),
      style: field(rule, "font-style"),
      weight: Number(field(rule, "font-weight")),
      range: field(rule, "unicode-range"),
      url: rule.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1],
    });
  }
  return faces;
}

let totalBytes = 0;

for (const family of FAMILIES) {
  const faces = parseFontFaces(await fetchText(family.url)).filter((f) => KEPT_SUBSETS.has(f.subset));
  if (faces.length === 0) throw new Error(`No latin subset found for ${family.file}`);
  if (faces.some((f) => !f.url)) throw new Error(`Missing woff2 url for ${family.file}`);

  // One rule per subset; a variable font covers every weight of that subset.
  const bySubset = new Map();
  for (const f of faces) {
    const group = bySubset.get(f.subset);
    if (!group) bySubset.set(f.subset, { ...f, min: f.weight, max: f.weight });
    else {
      if (f.url !== group.url) throw new Error(`${family.file}: subset ${f.subset} is not a variable font`);
      group.min = Math.min(group.min, f.weight);
      group.max = Math.max(group.max, f.weight);
    }
  }

  const rules = [];
  for (const g of bySubset.values()) {
    const woff2 = await fetchWoff2(g.url);
    totalBytes += woff2.length;
    rules.push(
      `/* ${g.subset} */\n@font-face {\n` +
        `  font-family: ${g.family};\n` +
        `  font-style: ${g.style};\n` +
        `  font-weight: ${g.min} ${g.max};\n` +
        `  font-display: swap;\n` +
        `  src: url(data:font/woff2;base64,${woff2.toString("base64")}) format('woff2');\n` +
        `  unicode-range: ${g.range};\n}`
    );
  }

  const header =
    `/* Vendored from ${family.url}\n` +
    `   Subsets: ${[...bySubset.keys()].join(", ")}. SIL Open Font License 1.1.\n` +
    `   Regenerate with: node scripts/vendor-fonts.mjs — do not edit by hand. */\n`;
  writeFileSync(`src/vendor/${family.file}`, header + rules.join("\n") + "\n");
  console.log(`${family.file.padEnd(22)} ${bySubset.size} faces (${[...bySubset.keys()].join(", ")})`);
}

console.log(`\nTotal font payload: ${(totalBytes / 1024).toFixed(0)} KB of woff2`);
