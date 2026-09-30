import { afterEach, expect, it } from "vitest";
import { TextIndex } from "../src/text-index";

const original = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
afterEach(() => {
  document.body.replaceChildren();
  if (original) Object.defineProperty(Range.prototype, "getClientRects", original);
  else Reflect.deleteProperty(Range.prototype, "getClientRects");
});

function index(html: string, measure: (range: Range) => DOMRect[]) {
  const root = document.createElement("div"); root.innerHTML = html; document.body.append(root);
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: function(this: Range) {
    expect(this.startContainer).toBe(this.endContainer);
    expect(this.startContainer.nodeType).toBe(Node.TEXT_NODE);
    return measure(this);
  } });
  return new TextIndex(root);
}

it("clips partial styled/link text and removes repeated glyph rectangles", () => {
  const text = index('<p>Plain <em>italic</em> <a href="#">link</a> tail</p>', range => {
    const nodes: Node[] = [...range.startContainer.parentElement!.closest("p")!.childNodes].flatMap(node => node.nodeType === 3 ? [node] : [...node.childNodes]);
    const before = nodes.slice(0, nodes.indexOf(range.startContainer)).reduce((sum, node) => sum + node.textContent!.length, 0);
    const rect = new DOMRect((before + range.startOffset) * 10, 0, (range.endOffset - range.startOffset) * 10, 20);
    return [rect, rect];
  });
  const rects = text.rects(2, text.text.length - 2);
  expect(rects).toHaveLength(1);
  expect(rects[0]!.left).toBe(20);
  expect(rects[0]!.right).toBe((text.text.length - 2) * 10);
});

it("keeps wrapped lines separate while merging adjacent formatted runs", () => {
  const text = index('<p><em>first</em><a href="#">wrapped</a></p>', range => range.startContainer.parentElement!.tagName === "EM" ?
    [new DOMRect(0, 0, 40, 20)] : [new DOMRect(40, 0, 30, 20), new DOMRect(0, 30, 30, 20)]);
  const rects = text.rects(0, text.text.length);
  expect(rects.map(rect => [rect.left, rect.top, rect.width, rect.height])).toEqual([[0, 0, 70, 20], [0, 30, 30, 20]]);
});

it("merges connected fragments even when visual order differs from DOM order", () => {
  const text = index('<p><em>right</em><a href="#">left</a><strong>middle</strong></p>', range => {
    const tag = range.startContainer.parentElement!.tagName;
    return [tag === "EM" ? new DOMRect(70, 0, 30, 20) : tag === "A" ? new DOMRect(0, 0, 30, 20) : new DOMRect(30, 0, 40, 20)];
  });
  expect(text.rects(0, text.text.length).map(rect => rect.width)).toEqual([100]);
});
