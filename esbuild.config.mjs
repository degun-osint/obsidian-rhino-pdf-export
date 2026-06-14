import esbuild from "esbuild";
import { readFileSync } from "fs";

const prod = process.argv[2] === "production";
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

// Legal notice kept at the top of the distributed bundle (MIT requires the
// copyright notices of redistributed libraries to travel with the binary).
const banner = `/*!
 * Rhino PDF Export for Obsidian — GPL-3.0-only
 *
 * Bundled third-party libraries (MIT):
 *   paged.js v0.4.3 — Copyright (c) 2018 Adam Hyde — https://pagedjs.org
 *   pdf-lib v1.17.1 — Copyright (c) 2019 Andrew Dillon — https://github.com/Hopding/pdf-lib
 * Full license texts: THIRD_PARTY_NOTICES.md
 */`;

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@electron/remote", "@codemirror/*", "@lezer/*", "fs", "path", "os"],
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
  },
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
