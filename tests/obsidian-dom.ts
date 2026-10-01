/** Minimal host DOM helpers for jsdom; production relies on Obsidian's helpers. */
function installHelpers(win: Window): Window {
  const helpers = win as Window & { createEl?: typeof createEl; createSvg?: typeof createSvg };
  helpers.createEl ??= ((tag: keyof HTMLElementTagNameMap) => win.document.createElement(tag)) as typeof createEl;
  win.createDiv ??= (() => win.document.createElement("div")) as typeof createDiv;
  win.createSpan ??= (() => win.document.createElement("span")) as typeof createSpan;
  helpers.createSvg ??= ((tag: keyof SVGElementTagNameMap) => win.document.createElementNS("http://www.w3.org/2000/svg", tag)) as typeof createSvg;
  return win;
}

Object.defineProperty(Node.prototype, "win", {
  configurable: true,
  get(this: Node): Window {
    const document = this.nodeType === Node.DOCUMENT_NODE ? this as Document : this.ownerDocument;
    return installHelpers(document?.defaultView ?? window);
  },
});
installHelpers(window);
