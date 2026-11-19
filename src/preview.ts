/**
 * Preview webview shared by the single and batch export modals.
 *
 * The preview renders real paged.js pages at their print size (A4 = ~794px),
 * which is wider than the modal. After paged.js has finished, the guest page is
 * zoomed to fit the webview width and refits on every resize, so widening the
 * (resizable) modal enlarges the pages instead of only revealing more grey.
 */

/** The bits of Electron's <webview> element this module uses. */
interface WebviewElement extends HTMLElement {
  executeJavaScript(code: string): Promise<unknown>;
}

/** Fit limits: never shrink to illegible, never blow up past 2x. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
/** Horizontal room kept free for the scrollbar and the page shadow. */
const GUTTER_PX = 32;

/**
 * Runs inside the guest. Idempotent: a second call only refits, so it is safe
 * to fire on both did-finish-load and the PAGED_READY title change.
 */
export const FIT_SCRIPT = `(function () {
  if (window.__rhinoFit) { window.__rhinoFit(); return; }
  var fit = function () {
    // PAGED_READY also signals errors/timeouts; only "done" guarantees that
    // paged.js has stopped measuring pages and zoom can safely change.
    if (!window.__rhinoState || window.__rhinoState.status !== "done") return;
    var page = document.querySelector(".pagedjs_page");
    if (!page) return;
    document.body.style.zoom = "";
    var width = page.getBoundingClientRect().width;
    if (!width) return;
    var avail = document.documentElement.clientWidth - ${GUTTER_PX};
    var zoom = Math.min(${MAX_ZOOM}, Math.max(${MIN_ZOOM}, avail / width));
    document.body.style.zoom = String(zoom);
  };
  window.__rhinoFit = fit;
  window.addEventListener("resize", fit);
  fit();
})();`;

/** Create the preview <webview> inside `container`, with fit-to-width. */
export function createPreviewWebview(container: HTMLElement): HTMLElement {
  // createEl has no key for Electron's <webview>; it is an HTMLElement at runtime.
  const webview = createEl("webview" as "div") as unknown as WebviewElement;
  webview.addClass("rhino-webview");
  webview.setAttribute("webpreferences", "javascript=yes");

  const fit = () => {
    // The guest may be mid-navigation; a failed fit only costs the zoom.
    webview.executeJavaScript(FIT_SCRIPT).catch(() => { /* non-critical */ });
  };
  // paged.js paginates after load and signals completion via the title.
  webview.addEventListener("page-title-updated", (e) => {
    if ((e as Event & { title?: string }).title === "PAGED_READY") fit();
  });
  webview.addEventListener("did-finish-load", fit);

  container.empty();
  container.appendChild(webview);
  return webview;
}

/** Make an export modal wide and resizable by the user. */
export function makeModalResizable(modalEl: HTMLElement): void {
  modalEl.addClass("rhino-pdf-modal");
}
