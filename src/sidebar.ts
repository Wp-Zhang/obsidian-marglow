import type { Annotation } from "./model";
import { labelIconButton } from "./action-icons";

/** A per-document review list. It only displays companion-note data. */
export class AnnotationSidebar {
  readonly element: HTMLElement;
  private list: HTMLElement;
  private cards = new Map<string, HTMLElement>();
  private signature = "";
  private count: HTMLElement;

  constructor(document: Document, select: (annotation: Annotation, edit: boolean) => void, hover: (id: string | null) => void, private remove: (annotation: Annotation) => void, private copy?: (annotation: Annotation) => void) {
    this.element = document.win.createEl("aside");
    this.element.className = "marglow-ui marglow-sidebar";
    this.element.setAttribute("aria-label", "Annotation comments");
    const header = document.win.createDiv();
    header.className = "marglow-sidebar-header";
    const title = document.win.createEl("strong"); title.textContent = "Annotations";
    this.count = document.win.createSpan(); this.count.className = "marglow-section-count";
    header.append(title, this.count);
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
    this.count.textContent = String(annotations.length);
    this.cards.clear(); this.list.replaceChildren();
    const document = this.element.ownerDocument;
    if (error) {
      const status = document.win.createEl("p"); status.className = "marglow-sidebar-status";
      status.textContent = "Reading note needs repair. Open its reading note to review the file; annotations cannot be edited safely yet.";
      this.list.append(status);
    } else if (!annotations.length) {
      const empty = document.win.createDiv(); empty.className = "marglow-sidebar-empty";
      const title = document.win.createEl("strong"); title.textContent = "No annotations yet";
      empty.append(title); this.list.append(empty);
    }
    for (const annotation of annotations) {
      const card = document.win.createEl("article");
      card.className = `marglow-comment-card marglow-${annotation.color}`;
      card.dataset.annotationId = annotation.id;
      const jump = document.win.createEl("button"); jump.type = "button";
      jump.className = "marglow-comment-jump"; jump.setAttribute("aria-label", `Go to annotation: ${annotation.quote.slice(0, 80)}`);
      const quote = document.win.createEl("blockquote"); quote.textContent = annotation.quote;
      const hasComment = !!annotation.comment.trim();
      const comment = document.win.createEl("button"); comment.type = "button";
      comment.className = hasComment ? "marglow-comment-text" : "marglow-add-comment";
      if (hasComment) comment.textContent = annotation.comment;
      else labelIconButton(comment, "Add comment", "comment");
      comment.setAttribute("aria-label", `${hasComment ? "Edit" : "Add"} comment: ${annotation.quote.slice(0, 80)}`);
      comment.disabled = !!error;
      comment.addEventListener("click", () => this.select(annotation, true));
      jump.append(quote); jump.disabled = !!error;
      jump.addEventListener("click", () => this.select(annotation, false));
      const time = document.win.createEl("time");
      time.className = "marglow-comment-time";
      time.dateTime = annotation.updatedAt;
      time.textContent = new Date(annotation.updatedAt).toLocaleString(undefined, { ...(new Date(annotation.updatedAt).getFullYear() !== new Date().getFullYear() ? { year: "numeric" as const } : {}), month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      time.title = `Created: ${new Date(annotation.createdAt).toLocaleString()}\nUpdated: ${new Date(annotation.updatedAt).toLocaleString()}`;
      const remove = document.win.createEl("button");
      remove.type = "button"; remove.className = "marglow-comment-delete";
      labelIconButton(remove, "Delete annotation", "delete"); remove.disabled = !!error;
      remove.addEventListener("click", () => this.remove(annotation));
      card.append(jump);
      if (hasComment) card.append(comment);
      const footer = document.win.createDiv(); footer.className = "marglow-record-footer";
      const actions = document.win.createDiv(); actions.className = "marglow-record-actions";
      footer.append(time, actions); card.append(footer);
      if (!hasComment) actions.append(comment);
      if (this.copy) {
        const copy = document.win.createEl("button"); copy.type = "button";
        copy.className = "marglow-copy-reference"; labelIconButton(copy, "Copy reference", "copy"); copy.disabled = !!error;
        copy.addEventListener("click", () => this.copy?.(annotation)); actions.append(copy);
      }
      actions.append(remove);
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
