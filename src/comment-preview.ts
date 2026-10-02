import { setReadingIcon } from "./action-icons";
import type { Annotation } from "./model";

/** Read-only mouse preview, independent of the comment draft and source selection. */
export class CommentPreview {
  private element: HTMLElement | null = null;
  private timer: number | undefined;
  private leaveTimer: number | undefined;
  private id: string | null = null;
  private content = "";
  private abort: AbortController;

  constructor(private document: Document) {
    this.abort = new document.win.AbortController();
    document.addEventListener("pointerdown", event => { if (!this.contains(event.target as Node)) this.hide(); }, { capture: true, signal: this.abort.signal });
    document.addEventListener("keydown", event => { if (event.key === "Escape") this.hide(); }, { signal: this.abort.signal });
    document.defaultView?.addEventListener("resize", () => this.hide(), { signal: this.abort.signal });
  }

  contains(node: Node): boolean { return !!this.element?.contains(node); }

  show(annotation: Annotation, rect: DOMRect): void {
    const win = this.document.defaultView!;
    win.clearTimeout(this.leaveTimer);
    if (this.id === annotation.id && this.content === annotation.comment) return;
    win.clearTimeout(this.timer);
    this.element?.remove(); this.element = null;
    this.id = annotation.id; this.content = annotation.comment;
    this.timer = win.setTimeout(() => {
      const panel = this.document.win.createDiv(); panel.className = "marglow-ui marglow-comment-preview";
      panel.setAttribute("role", "note"); panel.setAttribute("aria-label", "Comment preview");
      const heading = this.document.win.createDiv(); heading.className = "marglow-preview-heading";
      const icon = this.document.win.createSpan(); setReadingIcon(icon, "comment");
      const title = this.document.win.createSpan(); title.textContent = "Comment"; heading.append(icon, title);
      const body = this.document.win.createDiv(); body.className = "marglow-preview-text"; body.textContent = annotation.comment;
      panel.append(heading, body); this.document.body.append(panel); this.element = panel;
      const viewport = win.visualViewport, left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? win.innerWidth, height = viewport?.height ?? win.innerHeight;
      panel.style.maxWidth = `${Math.max(0, width - 24)}px`; panel.style.maxHeight = `${Math.max(0, Math.min(240, height - 24))}px`;
      panel.style.left = `${Math.max(left + 12, Math.min(rect.left, left + width - panel.offsetWidth - 12))}px`;
      const below = rect.bottom + 8;
      panel.style.top = `${Math.max(top + 12, Math.min(below + panel.offsetHeight <= top + height - 12 ? below : rect.top - panel.offsetHeight - 8, top + height - panel.offsetHeight - 12))}px`;
      panel.addEventListener("pointerenter", () => { win.clearTimeout(this.leaveTimer); });
      panel.addEventListener("pointerleave", () => this.leave());
    }, 160);
  }

  leave(): void { this.document.defaultView!.clearTimeout(this.leaveTimer); this.leaveTimer = this.document.defaultView!.setTimeout(() => this.hide(), 180); }
  hide(): void { this.document.defaultView!.clearTimeout(this.timer); this.document.defaultView!.clearTimeout(this.leaveTimer); this.element?.remove(); this.element = null; this.id = null; this.content = ""; }
  validate(annotations: Annotation[]): void { if (this.id && !annotations.some(item => item.id === this.id && item.comment === this.content)) this.hide(); }
  dispose(): void { this.hide(); this.abort.abort(); }
}
