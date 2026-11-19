import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateDocConfig,
  resolveBaseTheme,
  resolveTheme,
  diffFromTheme,
  mergeDocConfigBlock,
  isCssLength,
} from "../src/frontmatter";
import { BUILTIN_THEMES, createBlankTheme } from "../src/themes";

describe("validateDocConfig", () => {
  it("returns an empty config for a missing block", () => {
    assert.deepEqual(validateDocConfig(undefined), { overrides: {}, ignoredKeys: [] });
    assert.deepEqual(validateDocConfig(null), { overrides: {}, ignoredKeys: [] });
  });

  it("flags a non-object block as ignored", () => {
    assert.deepEqual(validateDocConfig("oops").ignoredKeys, ["rhino-pdf"]);
    assert.deepEqual(validateDocConfig([1, 2]).ignoredKeys, ["rhino-pdf"]);
  });

  it("accepts a valid linkColor", () => {
    const cfg = validateDocConfig({ linkColor: "#0969da" });
    assert.equal(cfg.overrides.linkColor, "#0969da");
    assert.deepEqual(cfg.ignoredKeys, []);
  });

  it("rejects an invalid linkColor", () => {
    const cfg = validateDocConfig({ linkColor: "blue; } body { display:none" });
    assert.equal(cfg.overrides.linkColor, undefined);
    assert.deepEqual(cfg.ignoredKeys, ["linkColor"]);
  });

  it("accepts an empty linkColor, including surrounding whitespace", () => {
    for (const linkColor of ["", "   "]) {
      assert.deepEqual(validateDocConfig({ linkColor }), {
        overrides: { linkColor: "" },
        ignoredKeys: [],
      });
    }
  });

  it("continues to reject empty values for required theme colors", () => {
    const cfg = validateDocConfig({
      primaryColor: "",
      accentColor: "   ",
      classificationColor: "",
      watermarkColor: "",
    });
    assert.deepEqual(cfg.overrides, {});
    assert.deepEqual(cfg.ignoredKeys, [
      "primaryColor", "accentColor", "classificationColor", "watermarkColor",
    ]);
  });

  it("ignores unknown keys and keys that would rename the theme", () => {
    const cfg = validateDocConfig({ nope: 1, id: "x", name: "y", builtin: true });
    assert.deepEqual(cfg.overrides, {});
    assert.deepEqual(cfg.ignoredKeys.sort(), ["builtin", "id", "name", "nope"]);
  });

  it("reads theme, order and coverInfo", () => {
    const cfg = validateDocConfig({ theme: " Minimal ", order: 2, coverInfo: ["author"] });
    assert.equal(cfg.theme, "Minimal");
    assert.equal(cfg.order, 2);
    assert.deepEqual(cfg.coverInfo, ["author"]);
  });

  it("validates booleans and lengths", () => {
    const cfg = validateDocConfig({ showCover: false, bodyFontSize: "11pt", headerLogoHeight: "big" });
    assert.equal(cfg.overrides.showCover, false);
    assert.equal(cfg.overrides.bodyFontSize, "11pt");
    assert.deepEqual(cfg.ignoredKeys, ["headerLogoHeight"]);
  });
});

describe("isCssLength", () => {
  it("accepts units and rejects garbage", () => {
    for (const v of ["0", "25mm", "1.5em", "10pt"]) assert.ok(isCssLength(v), v);
    for (const v of ["", "mm", "10", "10 px", "calc(1px)"]) assert.ok(!isCssLength(v), v);
  });
});

describe("theme resolution", () => {
  it("clears a theme's link color with an empty per-note override", () => {
    const base = { ...createBlankTheme(), linkColor: "#0969da" };
    const cfg = validateDocConfig({ linkColor: "" });
    assert.equal(resolveTheme(base, cfg).linkColor, "");
    assert.equal(base.linkColor, "#0969da");
    assert.equal(resolveTheme(base, cfg, { linkColor: "#123456" }).linkColor, "#123456");
  });

  it("preserves the theme's link color when the override is absent or invalid", () => {
    const base = { ...createBlankTheme(), linkColor: "#0969da" };
    for (const raw of [{}, { linkColor: null }, { linkColor: "red; display:none" }]) {
      assert.equal(resolveTheme(base, validateDocConfig(raw)).linkColor, "#0969da");
    }
  });

  it("retains an empty link color when saving and reading note overrides", () => {
    const base = { ...createBlankTheme(), linkColor: "#0969da" };
    const effective = resolveTheme(base, validateDocConfig({ linkColor: "" }));
    const block = mergeDocConfigBlock({
      prev: {},
      diff: diffFromTheme(effective, base),
      previousOverrides: {},
      coverInfo: [],
    });
    assert.equal(block.linkColor, "");
    assert.equal(resolveTheme(base, validateDocConfig(block)).linkColor, "");
  });

  it("pins a theme by name, case-insensitive, else falls back", () => {
    const fallback = createBlankTheme();
    const minimal = BUILTIN_THEMES[0];
    assert.equal(resolveBaseTheme(BUILTIN_THEMES, { overrides: {}, ignoredKeys: [], theme: minimal.name.toUpperCase() }, fallback), minimal);
    assert.equal(resolveBaseTheme(BUILTIN_THEMES, { overrides: {}, ignoredKeys: [], theme: "missing" }, fallback), fallback);
  });

  it("applies modal edits over frontmatter over base, without mutating base", () => {
    const base = { ...createBlankTheme(), linkColor: "" };
    const cfg = validateDocConfig({ linkColor: "#111111", margins: { top: "30mm" } });
    const eff = resolveTheme(base, cfg, { linkColor: "#222222" });
    assert.equal(eff.linkColor, "#222222");
    assert.equal(eff.margins.top, "30mm");
    assert.equal(eff.margins.left, base.margins.left);
    assert.equal(base.linkColor, "");
    assert.equal(resolveTheme(base, cfg).linkColor, "#111111");
  });
});
