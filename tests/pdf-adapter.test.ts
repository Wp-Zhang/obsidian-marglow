import { afterEach, describe, expect, it, vi } from "vitest";
import { PdfAdapter, rectFromPdf, rectToPdf } from "../src/pdf-adapter";
import { annotation } from "./helpers";

afterEach(() => document.body.replaceChildren());

function fixture(missingPage = 0) {
  const root = document.createElement("div");
  document.body.append(root);
  const pages = [1, 2, 3].map(number => {
    if (number === missingPage) return undefined;
    const div = document.createElement("div");
    div.className = "page";
    div.dataset.pageNumber = String(number);
    div.innerHTML = `<div class="canvasWrapper"></div><div class="textLayer"><span>Page ${number} text</span></div>`;
    root.append(div);
    const box = new DOMRect(10, number * 100, 100, 100);
    vi.spyOn(div.querySelector<HTMLElement>(".canvasWrapper")!, "getBoundingClientRect").mockReturnValue(box);
    return { div, viewport: {
      width: 100, height: 100,
      convertToPdfPoint: (x: number, y: number): [number, number] => [x, 100 - y],
      convertToViewportRectangle: (rect: number[]) => [rect[0]!, 100 - rect[1]!, rect[2]!, 100 - rect[3]!],
    } };
  });
  const view = { viewer: { child: { pdfViewer: { pdfViewer: { pagesCount: 3, getPageView: (index: number) => pages[index] } } } } };
  const adapter = new PdfAdapter(root, view, "fingerprint");
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: vi.fn(function(this: Range) {
    const element = this.startContainer.nodeType === 1 ? this.startContainer as Element : this.startContainer.parentElement!;
    const page = element.closest<HTMLElement>(".page")!;
    return [new DOMRect(20, Number(page.dataset.pageNumber) * 100 + 10, 50, 15)] as unknown as DOMRectList;
  }) });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: vi.fn(function(this: Range) {
    if(this.startContainer===this.endContainer){const page=this.startContainer.parentElement!.closest('.page')!;return new DOMRect(20,Number((page as HTMLElement).dataset.pageNumber)*100+10,50,15);}
    return new DOMRect(20,110,50,215);
  }) });
  return { root, pages, adapter };
}

function select(pages: ReturnType<typeof fixture>["pages"], first: number, last: number): Selection {
  const range = document.createRange();
  range.setStart(pages[first - 1]!.div.querySelector("span")!.firstChild!, 0);
  range.setEnd(pages[last - 1]!.div.querySelector("span")!.firstChild!, "Page 1 text".length);
  const selection = document.getSelection()!;
  selection.removeAllRanges(); selection.addRange(range);
  return selection;
}

describe("PDF selection and geometry", () => {
  it("displays a unique same-page quote from current text geometry without rewriting a bad saved anchor", () => {
    const { adapter, pages } = fixture();
    const captured = adapter.capture(select(pages, 1, 1))!;
    if (captured.anchor.kind !== "pdf") throw new Error("Expected PDF anchor");
    captured.anchor.segments[0]!.rects = [[0, 0, 100, 100]];
    const before = JSON.stringify(captured.anchor);
    const located = adapter.locate({ ...annotation(), quote: captured.quote, anchor: captured.anchor })!;
    expect(located[0]!.toJSON()).toEqual(new DOMRect(20, 110, 50, 15).toJSON());
    expect(JSON.stringify(captured.anchor)).toBe(before);
  });

  it("retains stored geometry when the same-page quotation is ambiguous", () => {
    const { adapter, pages } = fixture();
    const captured = adapter.capture(select(pages, 1, 1))!;
    if (captured.anchor.kind !== "pdf") throw new Error("Expected PDF anchor");
    const layer = pages[0]!.div.querySelector(".textLayer")!;
    layer.append(document.createElement("br"), layer.querySelector("span")!.cloneNode(true));
    captured.anchor.segments[0]!.rects = [[0, 0, 100, 100]];
    const located = adapter.locate({ ...annotation(), quote: captured.quote, anchor: captured.anchor })!;
    expect(located[0]!.width).toBe(100);
  });
  it("round-trips page coordinates at a different display scale and page origin", () => {
    const viewport = { width: 100, height: 200, convertToPdfPoint: (x: number, y: number): [number, number] => [x, 200 - y], convertToViewportRectangle: (rect: number[]) => [rect[0]!, 200 - rect[1]!, rect[2]!, 200 - rect[3]!] };
    const box = new DOMRect(50, 80, 200, 400);
    const captured = new DOMRect(70, 100, 40, 20);
    expect(rectToPdf(captured, box, viewport)).toEqual([10, 180, 30, 190]);
    expect(rectFromPdf([10, 180, 30, 190], box, viewport).toJSON()).toEqual(captured.toJSON());
  });

  it("uses the viewport transform for rotated pages", () => {
    const viewport = { width: 200, height: 100, convertToPdfPoint: (x: number, y: number): [number, number] => [y, x], convertToViewportRectangle: (rect: number[]) => [rect[1]!, rect[0]!, rect[3]!, rect[2]!] };
    const box = new DOMRect(0, 0, 200, 100);
    const captured = new DOMRect(20, 10, 40, 30);
    expect(rectFromPdf(rectToPdf(captured, box, viewport), box, viewport).toJSON()).toEqual(captured.toJSON());
  });

  it("captures a cross-page selection as one anchor with all page segments", () => {
    const { adapter, pages } = fixture();
    const captured = adapter.capture(select(pages, 1, 3))!;
    expect(captured.anchor.kind).toBe("pdf");
    if (captured.anchor.kind !== "pdf") throw new Error("Expected PDF anchor");
    expect(captured.anchor.segments.map(segment => segment.page)).toEqual([1, 2, 3]);
    expect(captured.quote).toBe("Page 1 text\nPage 2 text\nPage 3 text");
    const entry = { ...annotation(), quote: captured.quote, anchor: captured.anchor };
    expect(adapter.locate(entry)).toHaveLength(3);
  });

  it("rejects a cross-page selection with an unloaded middle page instead of truncating", () => {
    const { adapter, pages } = fixture(2);
    expect(() => adapter.capture(select(pages, 1, 3))).toThrow(/not loaded/);
  });

  it("marks annotations unlocated when the PDF content fingerprint changes", () => {
    const { adapter, pages, root } = fixture();
    const captured = adapter.capture(select(pages, 1, 1))!;
    const entry = { ...annotation(), quote: captured.quote, anchor: captured.anchor };
    const replaced = new PdfAdapter(root, {}, "different-fingerprint");
    expect(replaced.locate(entry)).toBeNull();
  });

  it("refuses an incompatible viewer without producing an annotation", () => {
    const { root, pages } = fixture();
    expect(() => new PdfAdapter(root, {}, "fingerprint").capture(select(pages, 1, 1))).toThrow(/not yet compatible/);
  });
});
