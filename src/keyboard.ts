/** Delete selected objects without intercepting text editing or modified shortcuts. */
export function isAnnotationDelete(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.ctrlKey || event.shiftKey) return false;
  if (event.key !== "Delete" && event.key !== "Backspace") return false;
  return !event.composedPath().some(target => (target as Element).nodeType === 1 && !!(target as Element).closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor, .modal-container, [role="textbox"]'));
}
