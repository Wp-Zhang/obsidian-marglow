import { afterEach, expect, it } from "vitest";
import { colorButton, AnnotationUI } from "../src/ui";
import { setAnnotationActionIcon } from "../src/action-icons";
import { AnnotationSidebar } from "../src/sidebar";
import { annotation } from "./helpers";

afterEach(() => document.body.replaceChildren());

it("creates UI and SVG icons in the source window rather than the main document", () => {
  const frame = document.createElement("iframe"); document.body.append(frame);
  const doc = frame.contentDocument!;
  // Real Obsidian installs helpers in each window; expose the jsdom equivalent.
  Object.defineProperty(doc, "win", { get: () => {
    const win = doc.defaultView!;
    win.createEl = ((tag: keyof HTMLElementTagNameMap) => doc.createElement(tag)) as typeof createEl;
    win.createDiv = (() => doc.createElement("div")) as typeof createDiv;
    win.createSpan = (() => doc.createElement("span")) as typeof createSpan;
    win.createSvg = ((tag: keyof SVGElementTagNameMap) => doc.createElementNS("http://www.w3.org/2000/svg", tag)) as typeof createSvg;
    return win;
  } });
  const button = colorButton(doc.body, "yellow", () => {});
  setAnnotationActionIcon(button, "delete");
  const sidebar = new AnnotationSidebar(doc, () => {}, () => {}, () => {});
  sidebar.render([annotation()], new Set(), ""); doc.body.append(sidebar.element);
  const ui = new AnnotationUI(doc, false, () => {});
  ui.show({ quote: "Selected text", anchor: annotation().anchor, rect: new DOMRect(100, 100, 100, 20) }, { highlight: async () => {}, comment: async () => {} });
  expect([...doc.querySelectorAll(".marglow-ui, button, svg, path")].every(el => el.ownerDocument === doc)).toBe(true);
  expect(button.querySelector("svg")?.namespaceURI).toBe("http://www.w3.org/2000/svg");
  expect(document.querySelector(".marglow-ui, button, svg")).toBeNull();
  ui.dispose(); sidebar.dispose();
});
