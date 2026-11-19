import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHtml, buildMergedHtml, makeDocVars, NO_ASSETS } from "../src/render";
import { resolveTheme, validateDocConfig } from "../src/frontmatter";
import { createBlankTheme } from "../src/themes";
import type { PdfTheme } from "../src/types";

function render(patch: Partial<PdfTheme>, body = '<p><a href="https://example.com" class="external-link">x</a></p>') {
  const theme = { ...createBlankTheme(), showCover: false, ...patch };
  return buildHtml(body, "Title", theme, NO_ASSETS, makeDocVars("Title", "note", {}));
}

const LINK_RULE = /a,\s*a\.external-link,\s*a\.internal-link\s*\{\s*color:\s*([^;]+);/;
const FORMATTED_LINK_RULE = /a strong,\s*a code\s*\{\s*color:\s*inherit;/;

describe("buildHtml link color", () => {
  it("adds no body link rule when linkColor is empty", () => {
    const html = render({ linkColor: "" });
    assert.doesNotMatch(html, LINK_RULE);
    assert.doesNotMatch(html, FORMATTED_LINK_RULE);
  });

  it("preserves default rendering for older themes without linkColor", () => {
    const theme = createBlankTheme();
    Reflect.deleteProperty(theme, "linkColor");
    const html = buildHtml("<p>Legacy note</p>", "Title", theme, NO_ASSETS, makeDocVars("Title", "note", {}));
    assert.doesNotMatch(html, LINK_RULE);
    assert.doesNotMatch(html, FORMATTED_LINK_RULE);
  });

  it("removes link color rules after a note clears its theme's color", () => {
    const base = { ...createBlankTheme(), linkColor: "#0969da" };
    const theme = resolveTheme(base, validateDocConfig({ linkColor: "" }));
    const html = render(theme);
    assert.doesNotMatch(html, LINK_RULE);
    assert.doesNotMatch(html, FORMATTED_LINK_RULE);
  });

  it("colors body links with linkColor", () => {
    const m = render({ linkColor: "#0969da" }).match(LINK_RULE);
    assert.ok(m, "link rule missing");
    assert.equal(m[1], "#0969da");
  });

  it("makes bold and code link labels inherit color after competing text rules", () => {
    const body = '<blockquote><a href="https://example.com"><strong>bold <code>nested code</code></strong></a></blockquote>';
    const html = render({ linkColor: "#0969da" }, body);
    assert.ok(html.includes(body), "formatted label markup must survive rendering");
    const inheritance = html.search(FORMATTED_LINK_RULE);
    assert.ok(inheritance >= 0, "formatted link labels need scoped color inheritance");
    for (const rule of [/blockquote strong\s*\{/, /\nstrong\s*\{/, /\ncode\s*\{/, /\npre code\s*\{/]) {
      const competing = html.search(rule);
      assert.ok(competing >= 0 && inheritance > competing,
        `link inheritance must follow the competing rule ${rule}`);
    }
  });

  it("applies configured link colors and label inheritance to merged exports", () => {
    const theme = { ...createBlankTheme(), linkColor: "#0969da" };
    const html = buildMergedHtml(
      [{ title: "Note", bodyHtml: '<a href="https://example.com"><code>label</code></a>' }],
      "Merged", theme, NO_ASSETS, makeDocVars("Merged", "merged", {}),
    );
    assert.equal(html.match(LINK_RULE)?.[1], "#0969da");
    assert.match(html, FORMATTED_LINK_RULE);
  });

  it("keeps TOC links on their own style after the body rule", () => {
    const html = render({ linkColor: "#0969da", showToc: true }, "<h2>A</h2><p>t</p>");
    const body = html.search(LINK_RULE);
    const toc = html.indexOf(".toc li a {");
    assert.ok(body >= 0 && toc > body, "TOC rule must follow the body link rule");
    assert.match(html, /\.toc li a\s*\{\s*color:\s*inherit;/);
    assert.match(html, /<li><a href="#toc-0">A<\/a><\/li>/);
  });
});

describe("buildHtml document", () => {
  it("produces a full document containing the body", () => {
    const html = render({});
    assert.match(html, /^<!DOCTYPE html>/);
    assert.ok(html.includes('href="https://example.com"'));
  });

  it("renders a configured classification banner with its color", () => {
    const html = render({ classificationText: "RESTRICTED", classificationColor: "#123456" });
    assert.match(html, /\.running-classification\s*\{[^}]*color: #123456;/);
    assert.ok(html.includes('<div class="running-classification">RESTRICTED</div>'));
    assert.ok(html.includes("content: element(classification);"));
  });

  it("omits classification markup and page content when no banner is configured", () => {
    const html = render({ classificationText: "", classificationColor: "#123456" });
    assert.ok(!html.includes('<div class="running-classification">'));
    assert.ok(!html.includes("content: element(classification);"));
  });
});
