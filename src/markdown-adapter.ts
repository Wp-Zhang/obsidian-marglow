import type { Annotation, CapturedSelection, DocumentAdapter } from "./model";
import { TextIndex, findText, normalizeText, textAnchor } from "./text-index";

export class MarkdownAdapter implements DocumentAdapter {
  private canonical: TextIndex;
  private visible: TextIndex | null = null;

  constructor(readonly root: HTMLElement, renderedDocument: HTMLElement) {
    this.canonical = new TextIndex(renderedDocument);
  }

  capture(selection: Selection): CapturedSelection | null {
    if (!selection.rangeCount || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    if (!this.root.contains(range.startContainer) || !this.root.contains(range.endContainer)) return null;
    if ([...this.root.querySelectorAll(".internal-embed, .math, mjx-container")].some(element => range.intersectsNode(element))) {
      throw new Error("Select text from this source document without embedded documents or formulas.");
    }
    const index = new TextIndex(this.root);
    const offsets = index.offsets(range);
    if (!offsets) return null;
    const quote = index.text.slice(offsets.start, offsets.end);
    const hint = textAnchor(index.text, offsets.start, offsets.end);
    const position = findText(this.canonical.text, quote, hint);
    if (position === null) throw new Error("This selection cannot be uniquely associated with its source. Choose a more specific passage.");
    return { quote, anchor: textAnchor(this.canonical.text, position, position + quote.length), rect: range.getBoundingClientRect() };
  }

  locate(annotation: Annotation): DOMRect[] | null {
    if (annotation.anchor.kind !== "markdown") return null;
    const quote = normalizeText(annotation.quote);
    const position = findText(this.canonical.text, quote, annotation.anchor);
    if (position === null) return null;
    const index = this.visible ?? new TextIndex(this.root);
    const currentAnchor = textAnchor(this.canonical.text, position, position + quote.length);
    const visible = findText(index.text, quote, currentAnchor);
    if (visible === null) return [];
    const range = index.range(visible, visible + quote.length);
    return range ? [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0) : [];
  }

  scrollTo(annotation: Annotation): boolean {
    this.refreshLayout();
    const rect = this.locate(annotation)?.[0];
    if (!rect) return false;
    const box = this.root.getBoundingClientRect();
    this.root.scrollTop += rect.top - box.top - Math.max(80, box.height / 3);
    return true;
  }

  dispose(): void {}

  refreshLayout(): void { this.visible = new TextIndex(this.root); }

  matches(annotation: Annotation, selection: CapturedSelection): boolean {
    return annotation.anchor.kind === "markdown" && selection.anchor.kind === "markdown" &&
      normalizeText(annotation.quote) === selection.quote &&
      findText(this.canonical.text, annotation.quote, annotation.anchor) === selection.anchor.textStart;
  }
}
