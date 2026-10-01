import type { Annotation } from "./model";
import { setAnnotationActionIcon } from "./action-icons";

/** A per-document review list. It only displays companion-note data. */
export class AnnotationSidebar {
  readonly element: HTMLElement;
  private list: HTMLElement;
  private cards = new Map<string, HTMLElement>();
  private signature = "";

  constructor(document: Document, select: (annotation: Annotation, edit: boolean) => void, hover: (id: string | null) => void, private remove: (annotation: Annotation) => void) {
    this.element = document.win.createEl("aside");
    this.element.className = "marglow-ui marglow-sidebar";
    this.element.setAttribute("aria-label", "Annotation comments");
    const header = document.win.createDiv();
    header.className = "marglow-sidebar-header";
    const title = document.win.createEl("strong"); title.textContent = "Comments";
    header.append(title);
    this.list = document.win.createDiv(); this.list.className = "marglow-comment-list";
    this.element.append(header, this.list);
    this.select = select; this.hover = hover;
  }

  private select: (annotation: Annotation, edit: boolean) => void;
  private hover: (id: string | null) => void;

  render(annotations: Annotation[], unlocated: Set<string>, error: string): void {
    if (this.element.querySelector(".marglow-inline-composer")) return;
    const signature = JSON.stringify([annotations, [...unlocated], error]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.cards.clear(); this.list.replaceChildren();
    const document = this.element.ownerDocument;
    if (error) {
      const status = document.win.createEl("p"); status.className = "marglow-sidebar-status";
      status.textContent = "Reading note needs repair. Open its reading note to review the file; annotations cannot be edited safely yet.";
      this.list.append(status);
    } else if (!annotations.length) {
      const empty = document.win.createDiv(); empty.className = "marglow-sidebar-empty";
      const title = document.win.createEl("strong"); title.textContent = "No annotations yet";
      const hint = document.win.createEl("p"); hint.textContent = "Select text to highlight, underline, or comment.";
      empty.append(title, hint); this.list.append(empty);
    }
    for (const annotation of annotations) {
      const card = document.win.createEl("article");
      card.className = `marglow-comment-card marglow-${annotation.color}`;
      card.dataset.annotationId = annotation.id;
      const jump = document.win.createEl("button"); jump.type = "button";
      jump.className = "marglow-comment-jump"; jump.setAttribute("aria-label", `Go to annotation: ${annotation.quote.slice(0, 80)}`);
      const quote = document.win.createEl("blockquote"); quote.textContent = annotation.quote;
      const comment = document.win.createEl("button"); comment.type = "button"; comment.className = "marglow-comment-text";
      comment.setAttribute("aria-label", `Edit comment: ${annotation.quote.slice(0, 80)}`);
      comment.disabled = !!error;
      comment.addEventListener("click", () => this.select(annotation, true));
      comment.textContent = annotation.comment || `${annotation.style === "underline" ? "Underline" : "Highlight"} · no comment`;
      jump.append(quote); jump.disabled = !!error;
      jump.addEventListener("click", () => this.select(annotation, false));
      const time = document.win.createEl("time");
      time.className = "marglow-comment-time";
      time.dateTime = annotation.updatedAt;
      time.textContent = new Date(annotation.updatedAt).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      time.title = `Created: ${new Date(annotation.createdAt).toLocaleString()}\nUpdated: ${new Date(annotation.updatedAt).toLocaleString()}`;
      const remove = document.win.createEl("button");
      remove.type = "button"; remove.className = "marglow-comment-delete";
      setAnnotationActionIcon(remove, "delete");
      remove.setAttribute("aria-label", "Delete annotation"); remove.disabled = !!error;
      remove.addEventListener("click", () => this.remove(annotation));
      card.append(jump, comment, time, remove);
      if (unlocated.has(annotation.id)) {
        const status = document.win.createEl("p"); status.className = "marglow-sidebar-status"; status.textContent = "Unlocated · reassociate this annotation"; card.append(status);
      }
      card.addEventListener("pointermove", () => this.hover(annotation.id));
      card.addEventListener("pointerenter", () => this.hover(annotation.id));
      card.addEventListener("pointerleave", () => this.hover(null));
      comment.addEventListener("focus", () => this.hover(annotation.id));
      comment.addEventListener("blur", () => this.hover(null));
      jump.addEventListener("focus", () => this.hover(annotation.id));
      jump.addEventListener("blur", () => this.hover(null));
      this.cards.set(annotation.id, card); this.list.append(card);
    }
  }

  editorHost(id: string): HTMLElement | undefined { return this.cards.get(id); }

  emphasize(active: string | null, hovered: string | null, reveal = false): void {
    for (const [id, card] of this.cards) {
      card.classList.toggle("is-active", id === active);
      card.classList.toggle("is-hovered", id === hovered);
      card.querySelector(".marglow-comment-jump")?.setAttribute("aria-current", String(id === active));
    }
    if (reveal && active && !this.element.hidden) this.cards.get(active)?.scrollIntoView({ block: "nearest" });
  }

  dispose(): void { this.element.remove(); }
}
