import type { MarkdownAnchor } from "./model";

interface Point { node: Text; start: number; end: number }
const EXCLUDED = ".internal-embed, .math, mjx-container, .metadata-container, .frontmatter, .mod-header, .heading-collapse-indicator, .copy-code-button, .footnote-backref, .marglow-ui, .marglow-overlay, script, style";
const BLOCK = "p, li, td, th, h1, h2, h3, h4, h5, h6, pre, blockquote";

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export class TextIndex {
  text = "";
  private points: Array<Point | null> = [];
  private characters: string[] = [];

  constructor(readonly root: HTMLElement | DocumentFragment, includeLineBreaks = false) {
    const walker = root.ownerDocument.createTreeWalker(root, includeLineBreaks ? 5 : 4);
    let previousBlock: Element | null = null;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 1) {
        if ((node as Element).tagName === "BR" && this.characters.length && this.characters.at(-1) !== " ") this.append(" ", null);
        continue;
      }
      const text = node as Text;
      if (!text.parentElement || text.parentElement.closest(EXCLUDED)) continue;
      const block = text.parentElement.closest(BLOCK);
      if (block !== previousBlock && this.points.length && this.characters.at(-1) !== " ") this.append(" ", null);
      previousBlock = block;
      for (let i = 0; i < text.length; i++) {
        const char = /\s/.test(text.data[i]!) ? " " : text.data[i]!;
        if (char === " " && (!this.points.length || this.characters.at(-1) === " ")) continue;
        this.append(char, { node: text, start: i, end: i + 1 });
      }
    }
    while (this.characters.at(-1) === " ") {
      this.characters.pop();
      this.points.pop();
    }
    this.text = this.characters.join("");
    this.characters = [];
  }

  private append(char: string, point: Point | null): void {
    this.characters.push(char);
    this.points.push(point);
  }

  offsets(range: Range): { start: number; end: number } | null {
    let start = -1;
    let end = -1;
    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i];
      if (point && range.comparePoint(point.node, point.start) >= 0 && range.comparePoint(point.node, point.end) <= 0) {
        if (start < 0) start = i;
        end = i + 1;
      }
    }
    if (start < 0) return null;
    while (this.text[start] === " ") start++;
    while (this.text[end - 1] === " ") end--;
    return end > start ? { start, end } : null;
  }

  rects(start: number, end: number, singleLine = false): DOMRect[] {
    const spans = new Map<Text, { start: number; end: number }>();
    for (const point of this.points.slice(start, end)) {
      if (!point) continue;
      const span = spans.get(point.node);
      if (span) span.end = point.end;
      else spans.set(point.node, { start: point.start, end: point.end });
    }
    const rects: DOMRect[] = [];
    for (const [node, span] of spans) {
      const range = this.root.ownerDocument.createRange();
      range.setStart(node, span.start); range.setEnd(node, span.end);
      // Whole-element ranges return both inline boxes and glyph boxes. Text-node
      // ranges only contribute selected text, including partial styled runs.
      for (const rect of singleLine ? [range.getBoundingClientRect()] : range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        let merged = new DOMRect(rect.left, rect.top, rect.width, rect.height);
        for (let index = rects.length - 1; index >= 0; index--) {
          const existing = rects[index]!;
          const sameLine = Math.abs(existing.top - merged.top) < 0.5 && Math.abs(existing.bottom - merged.bottom) < 0.5;
          if (!sameLine || existing.right < merged.left - 0.5 || merged.right < existing.left - 0.5) continue;
          const left = Math.min(existing.left, merged.left), right = Math.max(existing.right, merged.right);
          const top = Math.min(existing.top, merged.top), bottom = Math.max(existing.bottom, merged.bottom);
          merged = new DOMRect(left, top, right - left, bottom - top);
          rects.splice(index, 1);
          index = rects.length; // Recheck earlier fragments after the union expands.
        }
        rects.push(merged);
      }
    }
    return rects.sort((a, b) => a.top - b.top || a.left - b.left);
  }

  range(start: number, end: number): Range | null {
    let first = this.points[start];
    let last = this.points[end - 1];
    while (!first && start < end) first = this.points[++start];
    while (!last && end > start) last = this.points[--end - 1];
    if (!first || !last) return null;
    const range = this.root.ownerDocument.createRange();
    range.setStart(first.node, first.start);
    range.setEnd(last.node, last.end);
    return range;
  }
}

export function findText(text: string, quote: string, anchor: MarkdownAnchor): number | null {
  const needle = normalizeText(quote);
  if (!needle) return null;
  const matches: number[] = [];
  let position = text.indexOf(needle);
  while (position !== -1) {
    matches.push(position);
    position = text.indexOf(needle, position + 1);
  }
  const contextual = matches.filter(start =>
    (!anchor.prefix || text.slice(Math.max(0, start - anchor.prefix.length), start) === anchor.prefix) &&
    (!anchor.suffix || text.slice(start + needle.length, start + needle.length + anchor.suffix.length) === anchor.suffix),
  );
  if (contextual.length === 1) return contextual[0]!;
  if (matches.length === 1) {
    const start = matches[0]!;
    const prefixMatches = !!anchor.prefix && text.slice(Math.max(0, start - anchor.prefix.length), start) === anchor.prefix;
    const suffixMatches = !!anchor.suffix && text.slice(start + needle.length, start + needle.length + anchor.suffix.length) === anchor.suffix;
    if (prefixMatches || suffixMatches || (!anchor.prefix && !anchor.suffix)) return start;
  }
  // An old offset alone cannot distinguish duplicated or rearranged passages.
  return null;
}

export function textAnchor(text: string, start: number, end: number): MarkdownAnchor {
  return { kind: "markdown", textStart: start, prefix: text.slice(Math.max(0, start - 48), start), suffix: text.slice(end, end + 48) };
}
