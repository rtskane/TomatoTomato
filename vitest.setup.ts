import "@testing-library/jest-dom/vitest";

// jsdom parses <dialog> but implements none of its behaviour — `showModal` and
// `close` simply aren't there, so anything using the native dialog API throws
// on mount. This stands them up well enough to assert that a component drives
// the element correctly.
//
// What it does NOT reproduce is what the browser gives us and we deliberately
// rely on: the top layer, focus trapping, focus restore, page inertness, and
// Escape-to-dismiss. Those are the browser's job, and a test here can't
// meaningfully cover them — verify them in a real browser, not by extending
// this shim.
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(
      this: HTMLDialogElement,
      returnValue?: string,
    ) {
      this.open = false;
      if (returnValue !== undefined) this.returnValue = returnValue;
      // The real element fires this, and components sync their state from it.
      this.dispatchEvent(new Event("close"));
    };
  }
}

// jsdom does no layout, so it has no ResizeObserver either. The cover editor
// uses one to size its selection frame; with nothing ever resizing here, an
// observer that never fires is exactly what a real one would do.
if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
