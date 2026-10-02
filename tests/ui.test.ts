import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnotationUI } from "../src/ui";
import { annotation } from "./helpers";

afterEach(() => document.body.replaceChildren());

function button(text: string): HTMLButtonElement {
  return [...document.querySelectorAll("button")].find(button => button.textContent === text || button.getAttribute("aria-label") === text)!;
}

const selection = { quote: "Selected text", anchor: annotation().anchor, rect: new DOMRect(100, 100, 100, 20) };

describe("whole-material composer", () => {
  it("does not save untouched multiline text merely because textarea line endings normalize", async () => {
    const host = document.createElement("article"); document.body.append(host);
    const save = vi.fn(); const ui = new AnnotationUI(document, false, vi.fn());
    ui.showThought(host, "First\r\n\r\nSecond", save, true);
    button("Save").click(); expect(save).not.toHaveBeenCalled(); ui.dispose();
  });
  it("keeps an inline thought and its material-bound input after persistence fails, then retries", async () => {
    const host = document.createElement("article"); document.body.append(host);
    const save = vi.fn().mockRejectedValueOnce(new Error("Disk write failed")).mockResolvedValueOnce(undefined);
    const ui = new AnnotationUI(document, true, vi.fn());
    ui.showThought(host, "", save);
    const input = host.querySelector("textarea")!; input.value = "A thought without any selection.";
    button("Save").click();
    await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toBe("Disk write failed"));
    expect(input.value).toBe("A thought without any selection."); expect(input.isConnected).toBe(true);
    expect(document.querySelector("body > .marglow-composer")).toBeNull();
    button("Save").click();
    await vi.waitFor(() => expect(ui.hasDraft).toBe(false));
    expect(save).toHaveBeenNthCalledWith(2, "A thought without any selection."); ui.dispose();
  });

  it("does not persist an empty or canceled thought and removes its draft host", async () => {
    const host = document.createElement("article"); host.dataset.marglowDraft = "true"; document.body.append(host);
    const save = vi.fn(); const ui = new AnnotationUI(document, false, vi.fn());
    ui.showThought(host, "", save); button("Save").click();
    await vi.waitFor(() => expect(host.isConnected).toBe(false)); expect(save).not.toHaveBeenCalled();
    const another = document.createElement("article"); another.dataset.marglowDraft = "true"; document.body.append(another);
    ui.showThought(another, "", save); another.querySelector("textarea")!.value = "Do not save."; button("Cancel").click();
    expect(another.isConnected).toBe(false); expect(save).not.toHaveBeenCalled(); ui.dispose();
  });
});

describe("comment composer lifecycle", () => {
  it("moves only floating composers, clamps them to the viewport, and retains the unsaved input", () => {
    const save = vi.fn(), ui = new AnnotationUI(document, false, vi.fn());
    ui.showComment(selection, { highlight: async () => {}, comment: save });
    const panel = document.querySelector<HTMLElement>('.marglow-composer')!, handle = panel.querySelector<HTMLElement>('.marglow-drag-handle')!;
    Object.defineProperties(panel, { offsetWidth: { value: 360 }, offsetHeight: { value: 200 } });
    vi.spyOn(panel, 'getBoundingClientRect').mockImplementation(() => new DOMRect(Number.parseFloat(panel.style.left)||100,Number.parseFloat(panel.style.top)||100,360,200));
    const input = panel.querySelector('textarea')!; input.value = 'Keep my draft while moving.';
    handle.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true}));
    expect(Number.parseFloat(panel.style.left)).toBe(110);
    for (let i=0;i<50;i++) handle.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown',shiftKey:true,bubbles:true}));
    expect(Number.parseFloat(panel.style.top)+200).toBeLessThanOrEqual(window.innerHeight-12);
    expect(input.value).toBe('Keep my draft while moving.'); expect(save).not.toHaveBeenCalled(); ui.close();
    const host = document.createElement('article'); document.body.append(host);
    ui.showComment(selection,{highlight:async()=>{},comment:save},annotation(),host);
    expect(host.querySelector('.marglow-drag-handle')).toBeNull(); ui.dispose();
  });

  it("autosaves outside clicks and keeps the input when saving fails", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("Disk write failed"));
    const report = vi.fn();
    const ui = new AnnotationUI(document, false, report);
    ui.show(selection, { highlight: async () => {}, comment: save });
    button("Comment").click();
    const input = document.querySelector("textarea")!;
    input.value = "Keep this thought";
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith("Disk write failed"));
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe("Keep this thought");
    save.mockResolvedValueOnce(undefined);
    button("Save").click();
    await vi.waitFor(() => expect(document.querySelector("textarea")).toBeNull());
    expect(save).toHaveBeenLastCalledWith("Keep this thought");
    ui.dispose();
  });

  it("cancels an unsaved comment with Escape and performs no write", () => {
    const save = vi.fn();
    const ui = new AnnotationUI(document, false, vi.fn());
    ui.show(selection, { highlight: async () => {}, comment: save });
    button("Comment").click();
    document.querySelector("textarea")!.value = "Discard";
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(save).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).toBeNull();
    ui.dispose();
  });

  it("does not rewrite an unchanged comment when the composer closes", async () => {
    const save = vi.fn();
    const ui = new AnnotationUI(document, false, vi.fn());
    ui.show(selection, { highlight: async () => {}, comment: save }, annotation());
    await ui.finish();
    expect(save).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).toBeNull();
    ui.dispose();
  });

  it("provides touch save/cancel controls and clears a comment without deleting the annotation", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn();
    const ui = new AnnotationUI(document, true, vi.fn());
    ui.show(selection, { highlight: async () => {}, comment: save, delete: remove }, annotation());
    expect(button("Save")).toBeDefined(); expect(button("Cancel")).toBeDefined();
    button("Remove comment").click();
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith(""));
    expect(remove).not.toHaveBeenCalled();
    ui.dispose();
  });

  it("keeps the floating editor and unsaved draft through repeated appearance changes", async () => {
    const highlight = vi.fn().mockResolvedValue(undefined);
    const style = vi.fn().mockResolvedValue(undefined), comment = vi.fn().mockResolvedValue(undefined);
    const ui = new AnnotationUI(document, false, vi.fn());
    ui.show(selection, { highlight, style, comment }, annotation());
    const input = document.querySelector("textarea")!; input.value = "New draft";
    document.querySelector<HTMLButtonElement>('[aria-label="Highlight blue"]')!.click();
    await vi.waitFor(() => expect(ui.isBusy).toBe(false));
    expect(highlight).toHaveBeenCalledWith("blue");
    expect(document.querySelector("textarea")).toBe(input); expect(input.value).toBe("New draft");
    button("Underline").click();
    await vi.waitFor(() => expect(ui.isBusy).toBe(false));
    expect(style).toHaveBeenCalledWith("underline"); expect(comment).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).toBe(input);
    button("Save").click(); await vi.waitFor(() => expect(comment).toHaveBeenCalledWith("New draft"));
    expect(document.querySelector('textarea')).toBeNull();
    ui.dispose();
  });

  it("keeps a failed appearance change open and clears its error only after a successful retry", async () => {
    const highlight=vi.fn().mockRejectedValueOnce(new Error('Entry changed')).mockResolvedValueOnce(undefined);
    const ui=new AnnotationUI(document,false,vi.fn());ui.show(selection,{highlight,comment:async()=>{}},annotation());
    const input=document.querySelector('textarea')!;input.value='Retained draft';
    button('Highlight blue').click();await vi.waitFor(()=>expect(document.querySelector('[role="alert"]')?.textContent).toBe('Entry changed'));
    expect(input.value).toBe('Retained draft');expect(button('Highlight blue').getAttribute('aria-pressed')).toBe('false');
    button('Highlight blue').click();await vi.waitFor(()=>expect(button('Highlight blue').getAttribute('aria-pressed')).toBe('true'));
    expect(document.querySelector('[role="alert"]')).toBeNull();expect(document.querySelector('textarea')).toBe(input);ui.dispose();
  });
});

it("lets sidebar navigation await a failed save without losing its draft", async () => {
  const save = vi.fn().mockRejectedValue(new Error("Disk unavailable"));
  const ui = new AnnotationUI(document, false, vi.fn());
  const sidebar = document.createElement("aside");
  sidebar.innerHTML = '<article class="marglow-comment-card"><button>Navigate</button></article>';
  document.body.append(sidebar);
  ui.navigationContainer = sidebar;
  ui.showComment(selection, { highlight: async () => {}, comment: save });
  document.querySelector("textarea")!.value = "Unsaved thought";
  sidebar.querySelector("button")!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  expect(save).not.toHaveBeenCalled();
  expect(await ui.finish()).toBe(false);
  expect(document.querySelector("textarea")!.value).toBe("Unsaved thought");
  ui.dispose();
});

it("edits inside a card and retains a stale draft after persistence fails", async () => {
  const save = vi.fn().mockRejectedValue(new Error("Entry changed externally"));
  const ui = new AnnotationUI(document, false, vi.fn());
  const card = document.createElement("article"); document.body.append(card);
  ui.showComment(selection, { highlight: async () => {}, comment: save }, annotation(), card);
  expect(card.querySelector(".marglow-inline-composer")).not.toBeNull();
  const input = card.querySelector("textarea")!; input.value = "Keep local draft";
  expect(await ui.finish()).toBe(false);
  expect(input.isConnected).toBe(true); expect(input.value).toBe("Keep local draft");
  expect(card.classList.contains("is-editing")).toBe(true);
  button("Cancel").click();
  expect(card.querySelector("textarea")).toBeNull();
  expect(card.classList.contains("is-editing")).toBe(false);
  ui.dispose();
});
