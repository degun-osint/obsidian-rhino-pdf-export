import { describe, it, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { createPreviewWebview, FIT_SCRIPT } from "../src/preview";

function preview() {
  const listeners: (() => void)[] = [];
  const zoomWrites: string[] = [];
  let measurements = 0;
  let zoom = "";
  const document = {
    title: "",
    body: { style: {
      get zoom() { return zoom; },
      set zoom(value: string) { zoom = value; zoomWrites.push(value); },
    } },
    documentElement: { clientWidth: 432 },
    // Simulate the first page appearing while pagination is still running.
    querySelector: () => ({
      getBoundingClientRect: () => {
        measurements++;
        return { width: 800 * Number(zoom || 1) };
      },
    }),
  };
  const window = {
    __rhinoState: undefined as { status: string } | undefined,
    addEventListener: (event: string, listener: () => void) => {
      assert.equal(event, "resize");
      listeners.push(listener);
    },
  };
  const context = createContext({ document, window });
  return {
    document, window, listeners, zoomWrites,
    get measurements() { return measurements; },
    execute: (code: string) => runInContext(code, context),
    inject: () => runInContext(FIT_SCRIPT, context),
    resize: () => listeners.forEach(listener => listener()),
  };
}

describe("preview zoom", () => {
  it("leaves partial pages unmeasured and unzoomed on load and resize", () => {
    const guest = preview();
    guest.inject();
    guest.resize();
    guest.document.documentElement.clientWidth = 632;
    guest.resize();
    assert.equal(guest.measurements, 0);
    assert.deepEqual(guest.zoomWrites, []);

    guest.window.__rhinoState = { status: "done" };
    guest.document.title = "PAGED_READY";
    guest.inject();
    assert.deepEqual(guest.zoomWrites, ["", "0.75"]);
    assert.equal(guest.listeners.length, 1);

    guest.document.documentElement.clientWidth = 832;
    guest.resize();
    assert.deepEqual(guest.zoomWrites, ["", "0.75", "", "1"]);
  });

  it("fits when pagination completes before the script is first injected", () => {
    const guest = preview();
    guest.window.__rhinoState = { status: "done" };
    guest.document.title = "PAGED_READY";
    guest.inject();
    assert.deepEqual(guest.zoomWrites, ["", "0.5"]);
  });

  it("restores the same zoom after repeated narrow/wide/narrow resizes", () => {
    const guest = preview();
    guest.window.__rhinoState = { status: "done" };
    guest.inject();
    assert.equal(guest.document.body.style.zoom, "0.5");

    for (let cycle = 0; cycle < 3; cycle++) {
      guest.document.documentElement.clientWidth = 1232;
      guest.resize();
      assert.equal(guest.document.body.style.zoom, "1.5");
      guest.document.documentElement.clientWidth = 432;
      guest.resize();
      assert.equal(guest.document.body.style.zoom, "0.5");
      guest.inject();
      assert.equal(guest.document.body.style.zoom, "0.5");
    }
    assert.equal(guest.listeners.length, 1);
  });

  it("does not fit on a PAGED_READY error or timeout signal", () => {
    for (const status of ["error", "timeout"]) {
      const guest = preview();
      guest.window.__rhinoState = { status };
      guest.document.title = "PAGED_READY";
      guest.inject();
      guest.resize();
      assert.equal(guest.measurements, 0);
      assert.deepEqual(guest.zoomWrites, []);
    }
  });
});

/** Keep host webview events separate from the guest's document/window. */
function webviewPreview(t: TestContext) {
  let guest = preview();
  const webview = new class extends EventTarget {
    addClass() {}
    setAttribute() {}
    async executeJavaScript(code: string) { return guest.execute(code); }
  }();
  const original = Object.getOwnPropertyDescriptor(globalThis, "createEl");
  Object.defineProperty(globalThis, "createEl", {
    configurable: true,
    value: () => webview,
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "createEl", original);
    else Reflect.deleteProperty(globalThis, "createEl");
  });
  createPreviewWebview({
    empty() {},
    appendChild() {},
  } as unknown as HTMLElement);

  return {
    get guest() { return guest; },
    load: () => webview.dispatchEvent(new Event("did-finish-load")),
    title: (title: string) => {
      guest.document.title = title;
      webview.dispatchEvent(Object.assign(new Event("page-title-updated"), { title }));
    },
    navigate: () => { guest = preview(); },
  };
}

describe("preview webview events", () => {
  it("fits after the ready event when pagination finishes after load", (t) => {
    const host = webviewPreview(t);
    host.load();
    host.guest.resize();
    assert.deepEqual(host.guest.zoomWrites, []);

    host.guest.window.__rhinoState = { status: "done" };
    host.title("Document title");
    assert.deepEqual(host.guest.zoomWrites, []);
    host.title("PAGED_READY");
    assert.equal(host.guest.document.body.style.zoom, "0.5");
    assert.equal(host.guest.listeners.length, 1);
  });

  it("fits when pagination finishes before load and installs only one resize listener", (t) => {
    const host = webviewPreview(t);
    host.guest.window.__rhinoState = { status: "done" };
    host.title("PAGED_READY");
    assert.equal(host.guest.document.body.style.zoom, "0.5");
    host.load();
    assert.equal(host.guest.document.body.style.zoom, "0.5");
    assert.equal(host.guest.listeners.length, 1);
  });

  it("waits for the new document to finish after navigating a completed preview", (t) => {
    const host = webviewPreview(t);
    host.guest.window.__rhinoState = { status: "done" };
    host.title("PAGED_READY");
    assert.equal(host.guest.document.body.style.zoom, "0.5");

    host.navigate();
    host.load();
    host.guest.document.documentElement.clientWidth = 632;
    host.guest.resize();
    assert.equal(host.guest.measurements, 0);
    assert.deepEqual(host.guest.zoomWrites, []);

    host.guest.window.__rhinoState = { status: "done" };
    host.title("PAGED_READY");
    assert.equal(host.guest.document.body.style.zoom, "0.75");
    host.guest.document.documentElement.clientWidth = 832;
    host.guest.resize();
    assert.equal(host.guest.document.body.style.zoom, "1");
    assert.equal(host.guest.listeners.length, 1);
  });
});
