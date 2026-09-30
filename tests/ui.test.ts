import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnotationUI } from "../src/ui";
import { annotation } from "./helpers";

afterEach(() => document.body.replaceChildren());

function button(text: string): HTMLButtonElement {
  return [...document.querySelectorAll("button")].find(button => button.textContent === text || button.getAttribute("aria-label") === text)!;
}

const selection = { quote: "Selected text", anchor: annotation().anchor, rect: new DOMRect(100, 100, 100, 20) };

describe("comment composer lifecycle", () => {
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

  it("changes a commented annotation's color without discarding the current draft", async () => {
    const highlight = vi.fn().mockResolvedValue(undefined);
    const ui = new AnnotationUI(document, false, vi.fn());
    ui.show(selection, { highlight, comment: async () => {} }, annotation());
    document.querySelector("textarea")!.value = "New draft";
    document.querySelector<HTMLButtonElement>('[aria-label="Highlight blue"]')!.click();
    await vi.waitFor(() => expect(highlight).toHaveBeenCalledWith("blue", "New draft"));
    expect(document.querySelector("textarea")).toBeNull();
    ui.dispose();
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
