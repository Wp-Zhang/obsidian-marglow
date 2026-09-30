import { afterEach, describe, expect, it } from "vitest";
import { TextIndex, findText, textAnchor } from "../src/text-index";

afterEach(() => document.body.replaceChildren());

function fixture(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

describe("rendered Markdown anchoring", () => {
  it("indexes emphasis, links, lists, and tables with consistent block boundaries", () => {
    const root = fixture('<p>Hello <strong>world</strong> <a href="#">a link</a>.</p><ul><li>One</li><li>Two</li></ul><table><tr><td>Cell A</td><td>Cell B</td></tr></table>');
    expect(new TextIndex(root).text).toBe("Hello world a link. One Two Cell A Cell B");
  });

  it("maps a cross-paragraph DOM range without treating rendered offsets as source offsets", () => {
    const root = fixture("<p>Some <em>important</em> text.</p><p>Next paragraph.</p>");
    const range = document.createRange();
    range.setStart(root.querySelector("em")!.firstChild!, 0);
    range.setEnd(root.querySelectorAll("p")[1]!.firstChild!, 4);
    const index = new TextIndex(root);
    const offsets = index.offsets(range)!;
    expect(index.text.slice(offsets.start, offsets.end)).toBe("important text. Next");
    expect(index.range(offsets.start, offsets.end)!.toString()).toBe(range.toString());
  });

  it("excludes embedded sources and plugin controls from source identity", () => {
    const root = fixture('<div class="metadata-container">Frontmatter UI</div><p>Own source</p><div class="internal-embed"><p>Another source</p></div><div class="marglow-ui">Reading notes</div>');
    expect(new TextIndex(root).text).toBe("Own source");
  });

  it("preserves UTF-16 mapping for emoji and CJK selections", () => {
    const root = fixture("<p>前文 😀 标注 后文</p>");
    const index = new TextIndex(root);
    const start = index.text.indexOf("😀");
    expect(index.range(start, start + "😀 标注".length)!.toString()).toBe("😀 标注");
  });

  it("relocates a passage after earlier text is inserted", () => {
    const original = "Before the important passage after.";
    const start = original.indexOf("important passage");
    const anchor = textAnchor(original, start, start + "important passage".length);
    expect(findText("New introduction. " + original, "important passage", anchor)).toBe(start + "New introduction. ".length);
  });

  it("distinguishes duplicate quotations using context, not quotation alone", () => {
    const text = "First context: repeated text. Second context: repeated text.";
    const start = text.lastIndexOf("repeated text");
    expect(findText(text, "repeated text", textAnchor(text, start, start + 13))).toBe(start);
  });

  it("refuses an ambiguous match even when one candidate has the old offset", () => {
    expect(findText("repeat and repeat", "repeat", { kind: "markdown", textStart: 0, prefix: "", suffix: "" })).toBeNull();
  });

  it("returns unlocated when the selected passage is deleted", () => {
    expect(findText("Only other content remains", "Deleted content", { kind: "markdown", textStart: 0, prefix: "", suffix: "" })).toBeNull();
  });

  it("does not attach a deleted passage to the only remaining identical quotation", () => {
    const original = "First area: repeated. Other area: repeated.";
    const start = original.indexOf("repeated.");
    const anchor = textAnchor(original, start, start + "repeated.".length);
    expect(findText("Other area: repeated.", "repeated.", anchor)).toBeNull();
  });
});
