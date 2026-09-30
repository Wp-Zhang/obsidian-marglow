import { afterEach, expect, it } from "vitest";
import { isAnnotationDelete } from "../src/keyboard";

afterEach(() => document.body.replaceChildren());

function allowed(target: Element, key: string, options: KeyboardEventInit = {}): boolean {
  if (!target.isConnected) document.body.append(target);
  let result = false;
  target.addEventListener("keydown", event => { result = isAnnotationDelete(event as KeyboardEvent); });
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));
  return result;
}

it("accepts Delete, Backspace, and Mac command-delete for object selections", () => {
  for (const key of ["Delete", "Backspace"]) for (const metaKey of [false, true]) expect(allowed(document.createElement("button"), key, { metaKey })).toBe(true);
});

it("preserves text deletion in inputs, editors, nested editable text, and dialogs", () => {
  for (const html of ['<textarea></textarea>', '<input>', '<div contenteditable="true"><span>Text</span></div>', '<div class="cm-editor"><span>Text</span></div>', '<div class="modal-container"><button>Delete</button></div>']) {
    const container = document.createElement("div"); container.innerHTML = html;
    document.body.append(container);
    expect(allowed(container.querySelector("span, textarea, input, button")!, "Backspace", { metaKey: true })).toBe(false);
  }
});

it("ignores composition, held keys, and other shortcut modifiers", () => {
  for (const options of [{ isComposing: true }, { repeat: true }, { altKey: true }, { ctrlKey: true }, { shiftKey: true }]) expect(allowed(document.createElement("div"), "Delete", options)).toBe(false);
});
