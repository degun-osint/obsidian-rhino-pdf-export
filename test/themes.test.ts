import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_THEMES, createBlankTheme, duplicateTheme } from "../src/themes";

describe("themes", () => {
  it("blank theme has an empty link color (default rendering)", () => {
    assert.equal(createBlankTheme().linkColor, "");
  });

  it("every builtin theme defines every field of a blank theme", () => {
    const keys = Object.keys(createBlankTheme()).filter((k) => k !== "id" && k !== "name");
    for (const t of BUILTIN_THEMES) {
      for (const k of keys) assert.ok(k in t, `${t.id} is missing ${k}`);
      assert.equal(t.builtin, true);
    }
  });

  it("builtin theme ids are unique", () => {
    const ids = BUILTIN_THEMES.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("duplicateTheme makes an independent custom copy", () => {
    const src = BUILTIN_THEMES[0];
    const copy = duplicateTheme(src);
    assert.notEqual(copy.id, src.id);
    assert.match(copy.id, /^custom-/);
    assert.equal(copy.builtin, undefined);
    assert.equal(copy.linkColor, src.linkColor);
    copy.margins.top = "99mm";
    assert.notEqual(src.margins.top, "99mm");
    copy.coverInfoFields.push("test-field");
    assert.ok(!src.coverInfoFields.includes("test-field"));
  });
});
