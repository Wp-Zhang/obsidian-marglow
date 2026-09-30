/** Small browser-native action icons shared by both comment presentations. */
export function setAnnotationActionIcon(button: HTMLButtonElement, action: "delete" | "remove-comment"): void {
  const deleting = action === "delete";
  button.classList.add("marglow-icon-button");
  button.setAttribute("aria-label", deleting ? "Delete annotation" : "Remove comment");
  button.title = deleting ? "Delete annotation and comment" : "Remove comment (keep highlight)";
  const path = deleting ? "M3 6h18M19 6l-1 14H6L5 6M9 6V3h6v3M10 10v6M14 10v6" : "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2ZM9 7l6 6M15 7l-6 6";
  const svg = button.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [name, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(name, value);
  const shape = button.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute("d", path); svg.append(shape); button.replaceChildren(svg);
}
