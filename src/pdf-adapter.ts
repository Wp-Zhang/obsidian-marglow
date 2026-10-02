import { waitForLayout } from "./navigation";
import type { Annotation, CapturedSelection, DocumentAdapter, PdfSegment, Rect } from "./model";
import { normalizeText, TextIndex } from "./text-index";

// All access to Obsidian's non-public PDF viewer is confined to this module.
interface PageViewport {
  width: number;
  height: number;
  convertToPdfPoint(x: number, y: number): [number, number];
  convertToViewportRectangle(rect: Rect): number[];
}

interface PageView {
  div: HTMLElement;
  viewport: PageViewport;
}

interface PdfViewer {
  getPageView(index: number): PageView | undefined;
  pagesCount: number;
}

export function viewerFromView(view: unknown): PdfViewer | null {
  const candidate = view as { viewer?: { child?: { pdfViewer?: { pdfViewer?: PdfViewer } } } };
  const viewer = candidate?.viewer?.child?.pdfViewer?.pdfViewer;
  return viewer && typeof viewer.getPageView === "function" && typeof viewer.pagesCount === "number" ? viewer : null;
}

function pageBox(page: PageView): DOMRect {
  return (page.div.querySelector<HTMLElement>(".canvasWrapper") ?? page.div).getBoundingClientRect();
}

function pageNumber(node: Node): number | null {
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  const page = element?.closest<HTMLElement>(".page[data-page-number]");
  const number = Number(page?.dataset.pageNumber);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function rectToPdf(rect: DOMRect, box: DOMRect, viewport: PageViewport): Rect {
  if (!box.width || !box.height) throw new Error("The PDF page is not ready for annotation.");
  const [x1, y1] = viewport.convertToPdfPoint((rect.left - box.left) * viewport.width / box.width, (rect.top - box.top) * viewport.height / box.height);
  const [x2, y2] = viewport.convertToPdfPoint((rect.right - box.left) * viewport.width / box.width, (rect.bottom - box.top) * viewport.height / box.height);
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)].map(n => Math.round(n * 1000) / 1000) as Rect;
}

export function rectFromPdf(rect: Rect, box: DOMRect, viewport: PageViewport): DOMRect {
  const mapped = viewport.convertToViewportRectangle(rect);
  const x1 = mapped[0]!, y1 = mapped[1]!, x2 = mapped[2]!, y2 = mapped[3]!;
  return new DOMRect(box.left + Math.min(x1, x2) * box.width / viewport.width, box.top + Math.min(y1, y2) * box.height / viewport.height,
    Math.abs(x2 - x1) * box.width / viewport.width, Math.abs(y2 - y1) * box.height / viewport.height);
}

/** PDF.js lays out each run in an em-height span. Browser Range boxes can include
 * extra fallback-font ascent/descent; clip to that run without expanding a partial selection.
 * Clipping both axes also handles quarter-turn pages and CSS/pinch transforms. */
export function pdfTextRect(range: Range): DOMRect {
  const rect = range.getBoundingClientRect();
  const start = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  const span = start?.closest(".textLayer span");
  const box = span?.getBoundingClientRect();
  if (!box?.width || !box.height) return rect;
  const left = Math.max(rect.left, box.left), top = Math.max(rect.top, box.top);
  return new DOMRect(left, top, Math.max(0, Math.min(rect.right, box.right) - left), Math.max(0, Math.min(rect.bottom, box.bottom) - top));
}

function mergedPageRects(rects: Rect[]): Rect[] {
  const result: Rect[] = [];
  for (const rect of rects) {
    let merged = [...rect] as Rect;
    for (let i = result.length - 1; i >= 0; i--) {
      const other = result[i]!;
      if (Math.abs(merged[1] - other[1]) > 0.5 || Math.abs(merged[3] - other[3]) > 0.5 || merged[0] > other[2] + 0.5 || other[0] > merged[2] + 0.5) continue;
      merged = [Math.min(merged[0], other[0]), Math.min(merged[1], other[1]), Math.max(merged[2], other[2]), Math.max(merged[3], other[3])];
      result.splice(i, 1); i = result.length;
    }
    result.push(merged);
  }
  return result;
}

function samePageRects(first: Rect[], second: Rect[]): boolean {
  const a = mergedPageRects(first), remaining = mergedPageRects(second);
  if (a.length !== remaining.length) return false;
  for (const rect of a) {
    const match = remaining.findIndex(other => {
      if (rect.every((value, i) => Math.abs(value - other[i]!) < 0.5)) return true;
      // Legacy font bounds may be taller, but the selected horizontal extent and
      // line center must still match. An adjacent repeated line cannot match.
      const height = Math.min(rect[3] - rect[1], other[3] - other[1]);
      return Math.abs(rect[0] - other[0]) < 0.5 && Math.abs(rect[2] - other[2]) < 0.5 &&
        Math.abs((rect[1] + rect[3] - other[1] - other[3]) / 2) < height * 0.25 + 0.5;
    });
    if (match < 0) return false;
    remaining.splice(match, 1);
  }
  return true;
}

export class PdfAdapter implements DocumentAdapter {
  private navigation = 0;
  private hosts = new WeakMap<DOMRect, HTMLElement>();
  overlayHost(rect: DOMRect): HTMLElement | null { return this.hosts.get(rect) ?? null; }
  constructor(readonly root: HTMLElement, private view: unknown, private fingerprint: string) {}

  capture(selection: Selection): CapturedSelection | null {
    if (!selection.rangeCount || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    if (!this.root.contains(range.startContainer) || !this.root.contains(range.endContainer)) return null;
    const start = pageNumber(range.startContainer);
    const end = pageNumber(range.endContainer);
    const viewer = viewerFromView(this.view);
    if (!viewer) throw new Error("This Obsidian PDF viewer is not yet compatible with Marglow. No annotation was saved.");
    if (!start || !end || start > end) throw new Error("Select text in the PDF page text layer.");
    const segments: PdfSegment[] = [];
    for (let number = start; number <= end; number++) {
      const page = viewer.getPageView(number - 1);
      const layer = page?.div.querySelector<HTMLElement>(".textLayer");
      if (!page || !layer || !layer.textContent?.trim()) throw new Error("Some selected PDF pages have not loaded their text. Wait for the pages to load and select again.");
      const part = layer.ownerDocument.createRange();
      part.selectNodeContents(layer);
      if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset);
      if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
      const fragment = part.cloneContents();
      fragment.querySelectorAll("br").forEach(br => br.replaceWith(layer.ownerDocument.createTextNode(" ")));
      const quote = normalizeText(fragment.textContent ?? "");
      const box = pageBox(page);
      const rects: Rect[] = [];
      const index = new TextIndex(layer, true), offsets = index.offsets(part);
      if (!offsets || normalizeText(index.text.slice(offsets.start, offsets.end)) !== quote) throw new Error("The full PDF selection could not be captured. No partial annotation was saved.");
      const selectedRects = index.rects(offsets.start, offsets.end, true, pdfTextRect);
      for (const rect of selectedRects) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        const clipped = new DOMRect(Math.max(rect.left, box.left), Math.max(rect.top, box.top),
          Math.min(rect.right, box.right) - Math.max(rect.left, box.left), Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top));
        if (clipped.width <= 0 || clipped.height <= 0) continue;
        const pdf = rectToPdf(clipped, box, page.viewport);
        if (!rects.some(existing => existing.every((value, i) => Math.abs(value - pdf[i]!) < 0.01))) rects.push(pdf);
      }
      if (!quote || !rects.length) throw new Error("The full PDF selection could not be captured. No partial annotation was saved.");
      segments.push({ page: number, quote, rects });
    }
    return { quote: segments.map(segment => segment.quote).join("\n"), anchor: { kind: "pdf", sourceFingerprint: this.fingerprint, segments }, rect: range.getBoundingClientRect() };
  }

  locate(annotation: Annotation): DOMRect[] | null {
    if (annotation.anchor.kind !== "pdf" || annotation.anchor.sourceFingerprint !== this.fingerprint) return null;
    if (normalizeText(annotation.quote) !== normalizeText(annotation.anchor.segments.map(segment => segment.quote).join(" "))) return null;
    const viewer = viewerFromView(this.view);
    if (!viewer) return [];
    const rects: DOMRect[] = [];
    for (const segment of annotation.anchor.segments) {
      if (segment.page > viewer.pagesCount) return null;
      const page = viewer.getPageView(segment.page - 1);
      if (!page || !page.viewport || !page.div.isConnected) continue;
      const box = pageBox(page);
      if (!box.width || !box.height) continue;
      // A matching fingerprint and a unique same-page quotation let us measure
      // the current text instead of replaying bad geometry saved by another engine.
      const layer = page.div.querySelector<HTMLElement>(".textLayer");
      if (layer) {
        const index = new TextIndex(layer, true), quote = normalizeText(segment.quote);
        const start = index.text.indexOf(quote);
        if (start >= 0 && index.text.indexOf(quote, start + 1) === -1) {
          const measured = index.rects(start, start + quote.length, true, pdfTextRect);
          if (measured.length) {
            for (const rect of measured) { this.hosts.set(rect, page.div); rects.push(rect); }
            continue;
          }
        }
      }
      for (const geometry of segment.rects) {
        const rect = rectFromPdf(geometry, box, page.viewport);
        this.hosts.set(rect, page.div);
        rects.push(rect);
      }
    }
    return rects;
  }

  async scrollTo(annotation: Annotation): Promise<boolean> {
    const token = ++this.navigation;
    if (annotation.anchor.kind !== "pdf" || this.locate(annotation) === null) return false;
    const page = viewerFromView(this.view)?.getPageView(annotation.anchor.segments[0]!.page - 1);
    if (!page?.div.isConnected) return false;
    page.div.scrollIntoView({ block: "start" });
    const loaded = await waitForLayout(this.root, () => !!page.div.querySelector(".textLayer") && !!this.locate(annotation)?.length, () => this.navigation === token);
    if (!loaded) return false;
    const rect = this.locate(annotation)?.[0];
    if (rect) {
      let scroller = page.div.parentElement;
      while (scroller && scroller !== this.root && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement;
      if (scroller) scroller.scrollTop += rect.top - scroller.getBoundingClientRect().top - 80;
    }
    return true;
  }

  dispose(): void { this.navigation++; }

  refreshLayout(): void {}

  matches(annotation: Annotation, selection: CapturedSelection): boolean {
    if (annotation.anchor.kind !== "pdf" || selection.anchor.kind !== "pdf" || normalizeText(annotation.quote) !== normalizeText(selection.quote)) return false;
    const a = annotation.anchor, b = selection.anchor;
    return a.sourceFingerprint === b.sourceFingerprint && a.segments.length === b.segments.length && a.segments.every((segment, i) => {
      const other = b.segments[i]!;
      if (segment.page !== other.page) return false;
      // Compare current measured geometry when the page quote is unique. This
      // preserves exact-selection reuse for older, over-tall saved rectangles.
      const page = viewerFromView(this.view)?.getPageView(segment.page - 1);
      const layer = page?.div.querySelector<HTMLElement>(".textLayer");
      let rects = segment.rects;
      if (page && layer) {
        const index = new TextIndex(layer, true), quote = normalizeText(segment.quote), start = index.text.indexOf(quote);
        if (start >= 0 && index.text.indexOf(quote, start + 1) === -1) {
          const measured = index.rects(start, start + quote.length, true, pdfTextRect);
          if (measured.length) rects = measured.map(rect => rectToPdf(rect, pageBox(page), page.viewport));
        }
      }
      return samePageRects(rects, other.rects);
    });
  }
}
