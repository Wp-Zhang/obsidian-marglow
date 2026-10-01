/** Obsidian exposes its global DOM helpers on each window, including pop-outs. */
declare global {
  interface Window {
    AbortController: typeof AbortController;
    createEl: typeof createEl;
    createDiv: typeof createDiv;
    createSpan: typeof createSpan;
    createSvg: typeof createSvg;
  }
}
export {};
