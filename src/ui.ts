import { COLORS, type Annotation, type CapturedSelection, type Color } from "./model";

export interface Actions {
  highlight(color: Color, comment?: string): Promise<void>;
  comment(text: string): Promise<void>;
  delete?(): Promise<void>;
  relocate?(): Promise<void>;
  cancelRelocate?(): void;
}

export class AnnotationUI {
  private element: HTMLElement | null = null;
  private saveDraft: (() => Promise<void>) | null = null;
  private busy = false;
  private rect: DOMRect | null = null;
  private abort = new AbortController();

  constructor(private document: Document, private mobile: boolean, private report: (message: string) => void, private onClose: () => void = () => {}) {
    document.addEventListener("pointerdown", event => {
      if (this.element && !this.element.contains(event.target as Node)) void this.finish();
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

  show(selection: CapturedSelection, actions: Actions, annotation?: Annotation): void {
    if (this.hasDraft || this.busy) return;
    this.close();
    this.rect = selection.rect;
    const panel = this.panel("marglow-toolbar");
    panel.setAttribute("role", "toolbar");
    for (const color of COLORS) {
      const button = this.button(panel, "", () => this.run(() => actions.highlight(color)));
      button.className = `marglow-color marglow-${color}`;
      button.setAttribute("aria-label", `Highlight ${color}`);
      button.title = `Highlight ${color}`;
    }
    this.button(panel, annotation?.comment ? "Edit comment" : "Comment", () => this.composer(actions, annotation));
    if (actions.delete) this.button(panel, "Delete", () => this.run(actions.delete!));
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
      const label = `${annotation.quote.slice(0, 70)}${annotation.comment ? " · comment" : ""}`;
      this.button(panel, label, () => select(annotation)).classList.add(`marglow-${annotation.color}`);
    }
    this.position();
  }

  private composer(actions: Actions, annotation?: Annotation): void {
    this.close();
    const panel = this.panel("marglow-composer");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", annotation ? "Edit annotation comment" : "Add annotation comment");
    const label = this.document.createElement("label");
    label.textContent = "Comment";
    const input = this.document.createElement("textarea");
    input.setAttribute("aria-label", "Comment");
    input.placeholder = "Write a thought…";
    input.rows = 4;
    const initial = annotation?.comment ?? "";
    input.value = initial;
    panel.append(label, input);
    if (annotation) {
      const palette = this.document.createElement("div");
      palette.className = "marglow-composer-actions";
      for (const color of COLORS) {
        const colorButton = this.button(palette, "", () => this.run(() => actions.highlight(color, input.value)));
        colorButton.className = `marglow-color marglow-${color}`;
        colorButton.setAttribute("aria-label", `Highlight ${color}`);
        colorButton.title = `Highlight ${color}`;
      }
      panel.append(palette);
    }
    const buttons = this.document.createElement("div");
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
      if (initial) this.button(buttons, "Remove comment", () => { input.value = ""; return commit(); });
      if (actions.delete) this.button(buttons, "Delete annotation", () => this.run(actions.delete!));
    }
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void commit(); }
    });
    this.position();
    input.focus({ preventScroll: true });
  }

  private panel(kind: string): HTMLElement {
    const panel = this.document.createElement("div");
    panel.className = `marglow-ui ${kind}${this.mobile ? " marglow-mobile" : ""}`;
    panel.addEventListener("pointerdown", event => {
      if ((event.target as Element).closest("button")) event.preventDefault();
    });
    this.document.body.append(panel);
    this.element = panel;
    return panel;
  }

  private button(parent: HTMLElement, text: string, action: () => void | Promise<void>): HTMLButtonElement {
    const button = this.document.createElement("button");
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
        if (!errorElement) { errorElement = this.document.createElement("p"); errorElement.className = "marglow-error"; this.element.append(errorElement); }
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
    if (!this.element || !this.rect) return;
    const win = this.document.defaultView!;
    const viewport = win.visualViewport;
    const width = viewport?.width ?? win.innerWidth;
    const top = viewport?.offsetTop ?? 0;
    const height = viewport?.height ?? win.innerHeight;
    if (this.mobile && this.element.classList.contains("marglow-composer")) {
      this.element.style.left = "12px";
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
    this.element = null;
    this.saveDraft = null;
    if (wasOpen) this.onClose();
  }

  dispose(): void {
    this.abort.abort();
    this.close();
  }
}
