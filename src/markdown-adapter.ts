import { waitForLayout } from "./navigation";
import type { Annotation, CapturedSelection, DocumentAdapter } from "./model";
import { TextIndex, findText, normalizeText, textAnchor } from "./text-index";

// Keep the host's virtual-section internals confined to the Markdown adapter.
interface PreviewSection { html: string; lineStart: number; shown: boolean }
interface PreviewRenderer {
  sections: PreviewSection[];
  showSection(section: PreviewSection): void;
  applyScrollSection(section: PreviewSection): boolean;
}
function previewRenderer(preview: unknown): PreviewRenderer | null {
  const renderer = (preview as { renderer?: PreviewRenderer } | undefined)?.renderer;
  return renderer && Array.isArray(renderer.sections) && typeof renderer.showSection === "function" && typeof renderer.applyScrollSection === "function" ? renderer : null;
}

export class MarkdownAdapter implements DocumentAdapter {
  private canonical: TextIndex;
  private visible: TextIndex | null = null;
  private navigation = 0;

  constructor(readonly root: HTMLElement, renderedDocument: HTMLElement, private preview?: unknown) {
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
    return index.rects(visible, visible + quote.length);
  }

  async scrollTo(annotation: Annotation): Promise<boolean> {
    const token = ++this.navigation;
    if (annotation.anchor.kind !== "markdown" || findText(this.canonical.text, annotation.quote, annotation.anchor) === null) return false;
    this.refreshLayout();
    if (!this.locate(annotation)?.length) {
      const renderer = previewRenderer(this.preview);
      if (!renderer) return false;
      // Parse inert HTML from the complete native section index. No hidden section
      // is guessed from a percentage or an old offset, and images are not loaded.
      const template = this.root.ownerDocument.createElement("template");
      const wrappers = new Map<Node, PreviewSection>();
      for (const section of renderer.sections) {
        if (typeof section.html !== "string") continue;
        const fragment = template.content.ownerDocument.createElement("template");
        fragment.innerHTML = section.html;
        const wrapper = template.content.ownerDocument.createElement("section");
        wrapper.append(fragment.content); template.content.append(wrapper);
        wrappers.set(wrapper, section);
      }
      const index = new TextIndex(template.content);
      const position = findText(index.text, annotation.quote, annotation.anchor);
      if (position === null) return false;
      const range = index.range(position, position + normalizeText(annotation.quote).length);
      let node: Node | null = range?.startContainer ?? null;
      while (node && !wrappers.has(node)) node = node.parentNode;
      const section = node ? wrappers.get(node) : undefined;
      if (!section) return false;
      renderer.showSection(section);
      if (!renderer.applyScrollSection(section)) return false;
    }
    const loaded = await waitForLayout(this.root, () => { this.refreshLayout(); return !!this.locate(annotation)?.length; }, () => this.navigation === token);
    if (!loaded) return false;
    const rect = this.locate(annotation)![0]!;
    const box = this.root.getBoundingClientRect();
    this.root.scrollTop += rect.top - box.top - Math.max(80, box.height / 3);
    return waitForLayout(this.root, () => {
      this.refreshLayout();
      const current = this.locate(annotation)?.[0], viewport = this.root.getBoundingClientRect();
      return !!current && current.bottom > viewport.top && current.top < viewport.bottom;
    }, () => this.navigation === token);
  }

  dispose(): void { this.navigation++; }

  refreshLayout(): void { this.visible = new TextIndex(this.root); }

  matches(annotation: Annotation, selection: CapturedSelection): boolean {
    return annotation.anchor.kind === "markdown" && selection.anchor.kind === "markdown" &&
      normalizeText(annotation.quote) === selection.quote &&
      findText(this.canonical.text, annotation.quote, annotation.anchor) === selection.anchor.textStart;
  }
}
