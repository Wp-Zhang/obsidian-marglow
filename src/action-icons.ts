/** Small browser-native action icons shared by both comment presentations. */
export type ReadingIcon = "highlighter" | "underline" | "grip" | "comment" | "copy" | "open-note" | "plus" | "delete";

export function setReadingIcon(element: HTMLElement, icon: ReadingIcon): void {
  const paths = {
    highlighter: "m9 11-6 6v3h7l3-3M9 11l8-8 4 4-8 8ZM3 20h7M13 15l-4-4",
    underline: "M6 3v6a6 6 0 0 0 12 0V3M4 21h16",
    grip: "M8 9h.01M12 9h.01M16 9h.01M8 15h.01M12 15h.01M16 15h.01",
    comment: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z",
    copy: "M9 9h11v11H9ZM5 15H3V3h12v2",
    "open-note": "M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5",
    plus: "M12 5v14M5 12h14",
    delete: "M3 6h18M19 6l-1 14H6L5 6M9 6V3h6v3M10 10v6M14 10v6",
  };
  const svg = element.ownerDocument.win.createSvg("svg");
  for (const [name, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(name, value);
  const path = element.ownerDocument.win.createSvg("path"); path.setAttribute("d", paths[icon]); svg.append(path); element.replaceChildren(svg);
}

export function labelIconButton(button: HTMLButtonElement, label: string, icon: ReadingIcon): void {
  button.classList.add("marglow-quiet-button");
  button.setAttribute("aria-label", label); button.title = label;
  setReadingIcon(button, icon);
}

export function setAnnotationActionIcon(button: HTMLButtonElement, action: "delete" | "remove-comment"): void {
  const deleting = action === "delete";
  button.classList.add("marglow-icon-button");
  button.setAttribute("aria-label", deleting ? "Delete annotation" : "Remove comment");
  button.title = deleting ? "Delete annotation and comment" : "Remove comment (keep highlight)";
  const path = deleting ? "M3 6h18M19 6l-1 14H6L5 6M9 6V3h6v3M10 10v6M14 10v6" : "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2ZM9 7l6 6M15 7l-6 6";
  const svg = button.ownerDocument.win.createSvg("svg");
  for (const [name, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(name, value);
  const shape = button.ownerDocument.win.createSvg("path");
  shape.setAttribute("d", path); svg.append(shape); button.replaceChildren(svg);
}
