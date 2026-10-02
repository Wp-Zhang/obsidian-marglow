import { afterEach, expect, it, vi } from "vitest";
import { AnnotationSidebar } from "../src/sidebar";
import { annotation } from "./helpers";

afterEach(() => document.body.replaceChildren());

it("renders user text safely and reflects external edits without changing annotation IDs", () => {
  const sidebar = new AnnotationSidebar(document, vi.fn(), vi.fn(), vi.fn());
  document.body.append(sidebar.element);
  const item = { ...annotation(), comment: '<img src=x onerror="alert(1)">' };
  sidebar.render([item], new Set(), "");
  expect(sidebar.element.querySelector("img")).toBeNull();
  expect(sidebar.element.textContent).toContain(item.comment);
  const card = sidebar.element.querySelector("article")!;
  sidebar.render([item], new Set(), "");
  expect(sidebar.element.querySelector("article")).toBe(card);
  sidebar.render([{ ...item, comment: "Direct edit" }], new Set(), "");
  expect(sidebar.element.textContent).toContain("Direct edit");
  expect(sidebar.element.querySelector("article")!.dataset.annotationId).toBe(item.id);
  sidebar.render([], new Set(), "");
  expect(sidebar.element.querySelector("article")).toBeNull();
});

it("selects and edits the corresponding entry and distinguishes active from hovered", () => {
  const select = vi.fn(), hover = vi.fn();
  const sidebar = new AnnotationSidebar(document, select, hover, vi.fn());
  const first = annotation(), second = annotation("ann-second");
  sidebar.render([first, second], new Set(), "");
  sidebar.emphasize(first.id, second.id);
  const cards = sidebar.element.querySelectorAll("article");
  expect(cards[0]!.classList.contains("is-active")).toBe(true);
  expect(cards[1]!.classList.contains("is-hovered")).toBe(true);
  cards[0]!.querySelector<HTMLButtonElement>("button")!.click();
  expect(select).toHaveBeenLastCalledWith(first, false);
  cards[1]!.querySelectorAll<HTMLButtonElement>("button")[1]!.click();
  expect(select).toHaveBeenLastCalledWith(second, true);
  cards[1]!.dispatchEvent(new MouseEvent("pointerenter"));
  expect(hover).toHaveBeenLastCalledWith(second.id);
  cards[1]!.dispatchEvent(new MouseEvent("pointerleave"));
  expect(hover).toHaveBeenLastCalledWith(null);
});

it("retains unlocated entries and pauses editing when parsing fails", () => {
  const select = vi.fn();
  const sidebar = new AnnotationSidebar(document, select, vi.fn(), vi.fn());
  const item = annotation();
  sidebar.render([item], new Set([item.id]), "Broken metadata");
  expect(sidebar.element.textContent).toContain("Unlocated");
  expect(sidebar.element.textContent).toContain("needs repair");
  sidebar.element.querySelectorAll<HTMLButtonElement>("article button").forEach(button => { expect(button.disabled).toBe(true); button.click(); });
  expect(select).not.toHaveBeenCalled();
});

it("shows the last update time and uses the comment itself for editing without extra controls", () => {
  const select = vi.fn();
  const sidebar = new AnnotationSidebar(document, select, vi.fn(), vi.fn());
  const item = annotation(); sidebar.render([item], new Set(), "");
  expect(sidebar.element.querySelector("time")!.dateTime).toBe(item.updatedAt);
  const buttons = [...sidebar.element.querySelectorAll<HTMLButtonElement>("button")];
  expect(buttons).toHaveLength(3);
  expect(buttons.some(button => ["Close", "Edit comment", "Add comment"].includes(button.textContent!))).toBe(false);
  sidebar.element.querySelector<HTMLButtonElement>(".marglow-comment-text")!.click();
  expect(select).toHaveBeenCalledWith(item, true);
});

it("routes the card delete button to its exact annotation", () => {
  const remove = vi.fn();
  const sidebar = new AnnotationSidebar(document, vi.fn(), vi.fn(), remove);
  const item = annotation(); sidebar.render([item], new Set(), "");
  sidebar.element.querySelector<HTMLButtonElement>('[aria-label="Delete annotation"]')!.click();
  expect(remove).toHaveBeenCalledWith(item);
});

it("keeps the inline draft attached while external note content changes", () => {
  const sidebar = new AnnotationSidebar(document, vi.fn(), vi.fn(), vi.fn());
  const item = annotation(); sidebar.render([item], new Set(), "");
  const draft = document.createElement("div"); draft.className = "marglow-inline-composer";
  draft.innerHTML = '<textarea>Unsaved local thought</textarea>';
  sidebar.editorHost(item.id)!.append(draft);
  sidebar.render([{ ...item, comment: "External edit" }], new Set(), "");
  expect(sidebar.element.querySelector("textarea")).toBe(draft.firstChild);
  expect(sidebar.element.querySelector("textarea")!.value).toBe("Unsaved local thought");
  draft.remove();
  sidebar.render([{ ...item, comment: "External edit" }], new Set(), "");
  expect(sidebar.element.textContent).toContain("External edit");
});

it("omits empty comment content and offers an explicit add action at the bottom", () => {
  const select = vi.fn(), sidebar = new AnnotationSidebar(document, select, vi.fn(), vi.fn(), vi.fn());
  const item = { ...annotation(), comment: "   " };
  sidebar.render([item], new Set(), "");
  expect(sidebar.element.querySelector('.marglow-comment-text, textarea')).toBeNull();
  expect(sidebar.element.textContent).not.toContain('no comment');
  const add = sidebar.element.querySelector<HTMLButtonElement>('.marglow-add-comment')!;
  expect(add.textContent).toBe('');
  expect(add.querySelector('svg')).not.toBeNull();
  expect(add.closest('.marglow-record-actions')).not.toBeNull();
  expect(add.title).toBe('Add comment');
  add.click(); expect(select).toHaveBeenCalledWith(item, true);
  sidebar.render([{ ...item, comment: 'A new comment.' }], new Set(), '');
  expect(sidebar.element.querySelector('.marglow-add-comment')).toBeNull();
  expect(sidebar.element.querySelector('.marglow-comment-text')?.textContent).toBe('A new comment.');
});

it("groups accessible icon actions with the timestamp without large copy text", () => {
  const copy=vi.fn(), sidebar=new AnnotationSidebar(document,vi.fn(),vi.fn(),vi.fn(),copy), item=annotation();
  sidebar.render([item],new Set(),'');
  const footer=sidebar.element.querySelector('.marglow-record-footer')!;
  const button=footer.querySelector<HTMLButtonElement>('[aria-label="Copy reference"]')!;
  expect(button.textContent).toBe('');expect(button.querySelector('svg')).not.toBeNull();expect(button.title).toBe('Copy reference');
  expect(footer.querySelector('time')).not.toBeNull();button.click();expect(copy).toHaveBeenCalledWith(item);
});
