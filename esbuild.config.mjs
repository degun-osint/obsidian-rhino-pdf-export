import esbuild from "esbuild";
import { readFileSync } from "fs";

const prod = process.argv[2] === "production";
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

// Legal notice kept at the top of the distributed bundle (MIT and the OFL both
// require the copyright notices of redistributed works to travel with them).
const banner = `/*!
 * Rhino PDF Export for Obsidian — GPL-3.0-only
 *
 * Bundled third-party libraries (MIT):
 *   paged.js v0.4.3 — Copyright (c) 2018 Adam Hyde — https://pagedjs.org
 *   pdf-lib v1.17.1 — Copyright (c) 2019 Andrew Dillon — https://github.com/Hopding/pdf-lib
 *
 * Bundled fonts (SIL Open Font License 1.1):
 *   Inter — Copyright (c) 2016 The Inter Project Authors — https://github.com/rsms/inter
 *   JetBrains Mono — Copyright 2020 The JetBrains Mono Project Authors — https://github.com/JetBrains/JetBrainsMono
 *
 * Full license texts: THIRD_PARTY_NOTICES.md
 */`;

/**
 * Read a vendored stylesheet, dropping its comments: the attribution header
 * carries the Google Fonts URL it was generated from, and that string has no
 * business appearing in a bundle that must not touch the network. Attribution
 * lives in the banner and in THIRD_PARTY_NOTICES.md.
 *
 * Safe against the embedded base64: its alphabet has no `*`, so no data URI can
 * contain a comment delimiter.
 */
function readVendoredCss(path) {
  return readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").trim();
}

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@electron/remote", "@codemirror/*", "@lezer/*", "fs", "path", "os", "zlib"],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  banner: { js: banner },
  define: {
    "process.env.PLUGIN_VERSION": JSON.stringify(manifest.version),
    "process.env.PAGED_JS_B64": JSON.stringify(Buffer.from(readFileSync("src/vendor/paged.polyfill.txt", "utf8")).toString("base64")),
    // Vendored @font-face rules with the woff2 embedded as data: URIs. Injected
    // verbatim into a <style> block, so no base64 wrapper is needed — unlike
    // paged.js, they contain no `</` sequence that would break HTML parsing.
    "process.env.INTER_CSS": JSON.stringify(readVendoredCss("src/vendor/inter.css")),
    "process.env.JETBRAINS_MONO_CSS": JSON.stringify(readVendoredCss("src/vendor/jetbrains-mono.css")),
  },
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
