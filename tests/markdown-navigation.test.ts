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
