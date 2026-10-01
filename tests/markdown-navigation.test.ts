import { afterEach, expect, it, vi } from "vitest";
import { MarkdownAdapter } from "../src/markdown-adapter";
import { annotation } from "./helpers";

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

it("uses the verified native section to load a target before aligning it", async () => {
  const root = document.createElement("div"); root.innerHTML = "<p>Start</p>"; document.body.append(root);
  const canonical = document.createElement("div"); canonical.innerHTML = "<p>Start</p><p>Before A meaningful passage. After</p>";
  const sections = [{ html: "<p>Start</p>", lineStart: 0, shown: true }, { html: "<p>Before <strong>A meaningful passage.</strong> After</p>", lineStart: 2, shown: false }];
  const showSection = vi.fn();
  const applyScrollSection = vi.fn(() => { root.innerHTML += sections[1]!.html; return true; });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 400));
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [new DOMRect(100, 200, 120, 20)] });
  const adapter = new MarkdownAdapter(root, canonical, { renderer: { sections, showSection, applyScrollSection } });
  expect(adapter.locate(annotation())).toEqual([]);
  expect(await adapter.scrollTo(annotation())).toBe(true);
  expect(showSection).toHaveBeenCalledWith(sections[1]);
  expect(applyScrollSection).toHaveBeenCalledWith(sections[1]);
  expect(root.scrollTop).toBeGreaterThan(0);
});

it("does not navigate by stale offsets when a quote is gone or ambiguous", async () => {
  const root = document.createElement("div"); document.body.append(root);
  const applyScrollSection = vi.fn();
  for (const html of ["<p>Changed passage</p>", "<p>Before A meaningful passage. After</p><p>Before A meaningful passage. After</p>"]) {
    const canonical = document.createElement("div"); canonical.innerHTML = html;
    const adapter = new MarkdownAdapter(root, canonical, { renderer: { sections: [], showSection: vi.fn(), applyScrollSection } });
    expect(await adapter.scrollTo(annotation())).toBe(false);
  }
  expect(applyScrollSection).not.toHaveBeenCalled();
});

it("indexes untrusted native HTML only in inert documents and excludes embedded/script text", async () => {
  const root = document.createElement("div"); root.textContent = "Start"; document.body.append(root);
  const canonical = document.createElement("div"); canonical.textContent = "Start Before A meaningful passage. After";
  const sections = [
    { html: "<p>Start</p>", lineStart: 0, shown: true },
    { html: '<div class="internal-embed"><p>Before A meaningful passage. After</p></div>', lineStart: 1, shown: false },
    { html: '<script>window.marglowExecuted = true</script><style>.trap{display:none}</style><p>Before <img src="https://example.invalid/trap.png" onerror="window.marglowExecuted = true"><strong>A meaningful passage.</strong> After</p>', lineStart: 2, shown: false },
  ];
  const parserDocuments: Document[] = [];
  const nativeCreate = Document.prototype.createElement;
  vi.spyOn(Document.prototype, "createElement").mockImplementation(function(this: Document, tag: string) {
    if (tag === "template" || tag === "section") parserDocuments.push(this);
    return nativeCreate.call(this, tag);
  });
  const showSection = vi.fn();
  const applyScrollSection = vi.fn(() => {
    // Simulate host rendering of the matching text, without mounting index HTML.
    root.append(document.createTextNode(" Before A meaningful passage. After")); return true;
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 400));
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [new DOMRect(100, 200, 120, 20)] });
  const adapter = new MarkdownAdapter(root, canonical, { renderer: { sections, showSection, applyScrollSection } });
  expect(await adapter.scrollTo(annotation())).toBe(true);
  expect(showSection).toHaveBeenCalledWith(sections[2]);
  expect(parserDocuments.length).toBeGreaterThan(1);
  expect(parserDocuments.slice(1).every(doc => doc.defaultView === null)).toBe(true);
  expect(document.querySelector("script, style, img, .internal-embed")).toBeNull();
  expect((window as Window & { marglowExecuted?: boolean }).marglowExecuted).toBeUndefined();
});
