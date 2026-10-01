import { COLORS, type Annotation, type CapturedSelection, type Color } from "./model";
import { setAnnotationActionIcon } from "./action-icons";

export interface Actions {
  highlight(this: void, color: Color, comment?: string): Promise<void>;
  comment(this: void, text: string): Promise<void>;
  delete?(this: void): Promise<void>;
  relocate?(this: void): Promise<void>;
  cancelRelocate?(this: void): void;
}

const SWATCHES: Record<Color, string> = { yellow: "#f6cd53", green: "#72c890", blue: "#79b7ed", pink: "#e997b7" };

export function colorButton(parent: HTMLElement, color: Color, action: () => void | Promise<void>, label = `Highlight ${color}`): HTMLButtonElement {
  const button = parent.ownerDocument.win.createEl("button");
  button.type = "button";
  button.className = `marglow-color marglow-${color}`;
  button.title = label;
  button.setAttribute("aria-label", label);
  const dot = parent.ownerDocument.win.createSpan();
  dot.className = "marglow-color-dot";
  dot.style.backgroundColor = SWATCHES[color];
  button.append(dot);
  button.addEventListener("click", () => { void action(); });
  parent.append(button);
  return button;
}

export class AnnotationUI {
  private element: HTMLElement | null = null;
  private saveDraft: (() => Promise<void>) | null = null;
  private busy = false;
  private rect: DOMRect | null = null;
  private abort: AbortController;
  private inlineHost: HTMLElement | null = null;
  navigationContainer: HTMLElement | null = null;

  constructor(private document: Document, private mobile: boolean, private report: (message: string) => void, private onClose: () => void = () => {}, private onChange: () => void = () => {}) {
    this.abort = new document.win.AbortController();
    document.addEventListener("pointerdown", event => {
      if (this.element && !this.element.contains(event.target as Node) && !(this.navigationContainer?.contains(event.target as Node) && (event.target as Element).closest(".marglow-comment-card"))) void this.finish();
    }, { capture: true, signal: this.abort.signal });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && this.element && !this.busy) {
        event.preventDefault();
        this.close();
      }
    }, { signal: this.abort.signal });
    document.defaultView?.visualViewport?.addEventListener("resize", () => this.position(), { signal: this.abort.signal });
    document.defaultView?.addEventListener("resize", () => this.position(), { signal: this.abort.signal });
  }

  get hasDraft(): boolean { return this.saveDraft !== null; }
  get isBusy(): boolean { return this.busy; }

  showComment(selection: CapturedSelection, actions: Actions, annotation?: Annotation, host?: HTMLElement): void {
    if (this.hasDraft || this.busy) return;
    this.rect = selection.rect;
    this.composer(actions, annotation, host);
  }

  show(selection: CapturedSelection, actions: Actions, annotation?: Annotation): void {
    if (this.hasDraft || this.busy) return;
    this.close();
    this.rect = selection.rect;
    const panel = this.panel("marglow-toolbar");
    panel.setAttribute("role", "toolbar");
    for (const color of COLORS) {
      colorButton(panel, color, () => this.run(() => actions.highlight(color)));
    }
    this.button(panel, annotation?.comment ? "Edit comment" : "Comment", () => this.composer(actions, annotation));
    if (actions.delete) setAnnotationActionIcon(this.button(panel, "", () => this.run(actions.delete!)), "delete");
    this.position();
    if (annotation?.comment) this.composer(actions, annotation);
  }

  showRelocate(selection: CapturedSelection, actions: Actions): void {
    if (this.hasDraft || this.busy) return;
    this.close();
    this.rect = selection.rect;
    const panel = this.panel("marglow-toolbar");
    this.button(panel, "Reassociate", () => this.run(actions.relocate!));
    this.button(panel, "Cancel", () => { actions.cancelRelocate?.(); this.close(); });
    this.position();
  }

  choose(rect: DOMRect, annotations: Annotation[], select: (annotation: Annotation) => void): void {
    if (this.hasDraft || this.busy) return;
    this.close();
    this.rect = rect;
    const panel = this.panel("marglow-choices");
    for (const annotation of annotations) {
      const label = `${annotation.style === "underline" ? "Underline" : "Highlight"} · ${annotation.quote.slice(0, 70)}${annotation.comment ? " · comment" : ""}`;
      this.button(panel, label, () => select(annotation)).classList.add(`marglow-${annotation.color}`);
    }
    this.position();
  }

  private composer(actions: Actions, annotation?: Annotation, host?: HTMLElement): void {
    this.close();
    const panel = this.panel("marglow-composer");
    if (host) {
      this.inlineHost = host; host.classList.add("is-editing");
      panel.classList.add("marglow-inline-composer"); host.insertBefore(panel, host.querySelector(".marglow-comment-time"));
    }
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", annotation ? "Edit annotation comment" : "Add annotation comment");
    const label = this.document.win.createEl("label");
    label.className = "marglow-composer-label";
    label.textContent = "Comment";
    const input = this.document.win.createEl("textarea");
    input.setAttribute("aria-label", "Comment");
    input.placeholder = "Write a thought…";
    input.rows = 4;
    const initial = annotation?.comment ?? "";
    input.value = initial;
    panel.append(label, input);
    if (annotation && !host) {
      const palette = this.document.win.createDiv();
      palette.className = "marglow-composer-actions";
      for (const color of COLORS) {
        colorButton(palette, color, () => this.run(() => actions.highlight(color, input.value)));
      }
      panel.append(palette);
    }
    const buttons = this.document.win.createDiv();
    buttons.className = "marglow-composer-actions";
    panel.append(buttons);
    const commit = async () => {
      if (this.busy) return;
      if ((input.value === initial && annotation) || (!annotation && !input.value.trim())) { this.close(); return; }
      await this.run(() => actions.comment(input.value));
    };
    this.saveDraft = commit;
    this.button(buttons, "Save", commit).classList.add("mod-cta");
    this.button(buttons, "Cancel", () => this.close());
    if (annotation) {
      if (initial) {
        const remove = this.button(buttons, "", () => { input.value = ""; return commit(); });
        remove.className = "marglow-remove-comment";
        setAnnotationActionIcon(remove, "remove-comment");
      }
      if (actions.delete && !host) setAnnotationActionIcon(this.button(buttons, "", () => this.run(actions.delete!)), "delete");
    }
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void commit(); }
    });
    this.position();
    input.focus({ preventScroll: true });
    this.onChange();
  }

  private panel(kind: string): HTMLElement {
    const panel = this.document.win.createDiv();
    panel.className = `marglow-ui ${kind}${this.mobile ? " marglow-mobile" : ""}`;
    panel.addEventListener("pointerdown", event => {
      if ((event.target as Element).closest("button")) event.preventDefault();
    });
    this.document.body.append(panel);
    this.element = panel;
    return panel;
  }

  private button(parent: HTMLElement, text: string, action: () => void | Promise<void>): HTMLButtonElement {
    const button = this.document.win.createEl("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", () => { void action(); });
    parent.append(button);
    return button;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.element?.querySelectorAll("button").forEach(button => { button.disabled = true; });
    try {
      await action();
      this.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the annotation.";
      this.report(message);
      if (this.element) {
        let errorElement = this.element.querySelector<HTMLElement>(".marglow-error");
        if (!errorElement) { errorElement = this.document.win.createEl("p"); errorElement.className = "marglow-error"; this.element.append(errorElement); }
        errorElement.textContent = message;
        errorElement.setAttribute("role", "alert");
      }
    } finally {
      this.busy = false;
      this.element?.querySelectorAll("button").forEach(button => { button.disabled = false; });
    }
  }

  async finish(): Promise<boolean> {
    if (this.busy) return false;
    if (this.saveDraft) await this.saveDraft();
    else this.close();
    return !this.hasDraft;
  }

  private position(): void {
    if (!this.element || !this.rect || this.inlineHost) return;
    const win = this.document.defaultView!;
    const viewport = win.visualViewport;
    const width = viewport?.width ?? win.innerWidth;
    const top = viewport?.offsetTop ?? 0;
    const height = viewport?.height ?? win.innerHeight;
    if (this.mobile && this.element.classList.contains("marglow-composer")) {
      this.element.style.width = `${Math.max(0, width - 24)}px`;
      this.element.style.top = `${Math.max(top + 12, top + height - this.element.offsetHeight - 16)}px`;
    } else {
      const panelWidth = Math.min(this.element.offsetWidth, width - 24);
      this.element.style.maxWidth = `${width - 24}px`;
      this.element.style.left = `${Math.max(12, Math.min(this.rect.left, width - panelWidth - 12))}px`;
      const proposed = this.rect.top - this.element.offsetHeight - 10;
      this.element.style.top = `${Math.max(top + 12, Math.min(proposed >= top + 12 ? proposed : this.rect.bottom + 10, top + height - this.element.offsetHeight - 12))}px`;
    }
  }

  close(): void {
    const wasOpen = this.element !== null;
    this.element?.remove();
    this.inlineHost?.classList.remove("is-editing");
    this.inlineHost = null;
    this.element = null;
    this.saveDraft = null;
    if (wasOpen) this.onClose();
  }

  dispose(): void {
    this.abort.abort();
    this.close();
  }
}
