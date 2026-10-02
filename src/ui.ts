import { COLORS, type Annotation, type AnnotationStyle, type CapturedSelection, type Color } from "./model";
import { setAnnotationActionIcon, setReadingIcon } from "./action-icons";

export interface Actions {
  current?(this: void): Annotation | undefined;
  highlight(this: void, color: Color, comment?: string): Promise<void>;
  comment(this: void, text: string): Promise<void>;
  style?(this: void, style: AnnotationStyle, comment?: string): Promise<void>;
  delete?(this: void): Promise<void>;
  relocate?(this: void): Promise<void>;
  cancelRelocate?(this: void): void;
}

const SWATCHES: Record<Color, string> = { yellow: "#f6cd53", green: "#72c890", blue: "#79b7ed", pink: "#e997b7" };

export function colorButton(parent: HTMLElement, color: Color, action: () => void | Promise<void>, label = `Highlight ${color}`): HTMLButtonElement {
  const button = parent.ownerDocument.win.createEl("button");
  button.type = "button";
  button.className = `marglow-color marglow-${color}`;
  button.dataset.color = color;
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
  private moved: { left: number; top: number } | null = null;
  navigationContainer: HTMLElement | null = null;
  actionContainer: HTMLElement | null = null;

  constructor(private document: Document, private mobile: boolean, private report: (message: string) => void, private onClose: () => void = () => {}, private onChange: () => void = () => {}) {
    this.abort = new document.win.AbortController();
    document.addEventListener("pointerdown", event => {
      if (this.element && !this.element.contains(event.target as Node) && !this.actionContainer?.contains(event.target as Node) && !(this.navigationContainer?.contains(event.target as Node) && (event.target as Element).closest(".marglow-comment-card"))) void this.finish();
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

  showThought(host: HTMLElement, initial: string, save: (text: string) => Promise<void>, existing = false): void {
    if (this.hasDraft || this.busy) return;
    this.rect = null;
    this.composer({ highlight: async () => {}, comment: save }, undefined, host, { initial, existing, label: "Whole-material thought" });
  }

  show(selection: CapturedSelection, actions: Actions, annotation?: Annotation): void {
    if (this.hasDraft || this.busy) return;
    this.close();
    this.rect = selection.rect;
    const panel = this.panel("marglow-toolbar");
    panel.setAttribute("role", "toolbar");
    for (const color of COLORS) {
      colorButton(panel, color, () => this.run(async () => { await actions.highlight(color); this.appearance(actions.current?.() ?? { ...annotation, color }); }, true));
    }
    this.styleButtons(panel, actions, annotation);
    this.button(panel, annotation?.comment ? "Edit comment" : "Comment", () => this.composer(actions, actions.current?.() ?? annotation));
    if (actions.delete) setAnnotationActionIcon(this.button(panel, "", () => this.run(actions.delete!)), "delete");
    this.position();
    this.appearance(annotation);
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

  private composer(actions: Actions, annotation?: Annotation, host?: HTMLElement, thought?: { initial: string; existing: boolean; label: string }): void {
    this.close();
    const panel = this.panel("marglow-composer");
    if (host) {
      this.inlineHost = host; host.classList.add("is-editing");
      panel.classList.add("marglow-inline-composer"); host.insertBefore(panel, host.querySelector(".marglow-record-footer") ?? host.querySelector(".marglow-comment-time"));
    }
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", thought ? thought.label : annotation ? "Edit annotation comment" : "Add annotation comment");
    const label = this.document.win.createEl("label");
    label.className = "marglow-composer-label";
    label.textContent = thought?.label ?? "Comment";
    const input = this.document.win.createEl("textarea");
    input.setAttribute("aria-label", thought?.label ?? "Comment");
    input.placeholder = thought ? "Your thoughts…" : "Add a comment…";
    input.rows = 4;
    const initial = (thought?.initial ?? annotation?.comment ?? "").replace(/\r\n/g, "\n");
    input.value = initial;
    panel.append(label, input);
    if (!host) this.draggable(label, panel);
    if (annotation && !host) {
      const palette = this.document.win.createDiv();
      palette.className = "marglow-composer-actions";
      for (const color of COLORS) {
        colorButton(palette, color, () => this.run(async () => { await actions.highlight(color); this.appearance(actions.current?.() ?? { ...annotation, color }); }, true));
      }
      this.styleButtons(palette, actions, annotation);
      panel.append(palette);
    }
    const buttons = this.document.win.createDiv();
    buttons.className = "marglow-composer-actions";
    panel.append(buttons);
    const commit = async () => {
      if (this.busy) return;
      if ((input.value === initial && (annotation || thought?.existing)) || (!annotation && !thought?.existing && !input.value.trim())) { this.close(); return; }
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
    this.appearance(annotation);
    input.focus({ preventScroll: true });
    this.onChange();
  }

  private panel(kind: string): HTMLElement {
    const panel = this.document.win.createDiv();
    panel.className = `marglow-ui ${kind}${this.mobile ? " marglow-mobile" : ""}`;
    panel.addEventListener("pointerdown", event => {
      // WebKit suppresses the synthesized click when touch pointerdown is canceled.
      if (event.pointerType !== "touch" && (event.target as Element).closest("button")) event.preventDefault();
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

  private styleButtons(parent: HTMLElement, actions: Actions, annotation?: Annotation): void {
    if (!actions.style) return;
    for (const style of ["highlight", "underline"] as const) {
      const button = this.button(parent, "", () => this.run(async () => { await actions.style!(style); this.appearance(actions.current?.() ?? { ...annotation, style }); }, true));
      button.className = "marglow-style-button";
      button.dataset.style = style;
      button.setAttribute("aria-label", style === "highlight" ? "Highlight" : "Underline");
      button.title = style === "highlight" ? "Change to highlight" : "Change to underline";
      button.setAttribute("aria-pressed", String((annotation?.style ?? "highlight") === style));
      setReadingIcon(button, style === "highlight" ? "highlighter" : "underline");
    }
  }

  private appearance(annotation?: { color?: Color; style?: AnnotationStyle }): void {
    this.element?.querySelectorAll<HTMLButtonElement>(".marglow-color").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.color === (annotation?.color ?? "yellow"))));
    this.element?.querySelectorAll<HTMLButtonElement>(".marglow-style-button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.style === (annotation?.style ?? "highlight"))));
  }

  private draggable(handle: HTMLElement, panel: HTMLElement): void {
    handle.classList.add("marglow-drag-handle");
    handle.tabIndex = 0; handle.setAttribute("role", "button");
    handle.setAttribute("aria-label", "Move comment window");
    handle.title = "Drag to move · arrow keys to adjust";
    const grip = this.document.win.createSpan(); grip.className = "marglow-drag-grip";
    grip.setAttribute("aria-hidden", "true"); setReadingIcon(grip, "grip"); handle.append(grip);
    let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0 || this.busy) return;
      const box = panel.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top };
      handle.setPointerCapture(event.pointerId);
      event.preventDefault(); event.stopPropagation();
    });
    handle.addEventListener("pointermove", event => {
      if (!drag || drag.id !== event.pointerId) return;
      this.moved = { left: drag.left + event.clientX - drag.x, top: drag.top + event.clientY - drag.y };
      this.position();
    });
    const stop = () => { drag = null; };
    handle.addEventListener("pointerup", stop); handle.addEventListener("pointercancel", stop); handle.addEventListener("lostpointercapture", stop);
    handle.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const box = panel.getBoundingClientRect(), step = event.shiftKey ? 40 : 10;
      this.moved = { left: box.left + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), top: box.top + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0) };
      this.position();
    });
  }

  private async run(action: () => Promise<void>, keepOpen = false): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.element?.querySelectorAll("button").forEach(button => { button.disabled = true; });
    try {
      await action();
      this.element?.querySelector(".marglow-error")?.remove();
      if (!keepOpen) this.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the annotation.";
      this.report(message);
      if (this.element) {
        let errorElement = this.element.querySelector<HTMLElement>(".marglow-error");
        if (!errorElement) { errorElement = this.document.win.createEl("p"); errorElement.className = "marglow-error"; this.element.append(errorElement); }
        errorElement.textContent = message;
        errorElement.setAttribute("role", "alert");
        this.position();
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
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const height = viewport?.height ?? win.innerHeight;
    this.element.style.maxWidth = `${Math.max(0, width - 24)}px`;
    this.element.style.maxHeight = `${Math.max(0, height - 24)}px`;
    if (this.moved) {
      this.moved.left = Math.max(left + 12, Math.min(this.moved.left, left + width - this.element.offsetWidth - 12));
      this.moved.top = Math.max(top + 12, Math.min(this.moved.top, top + height - this.element.offsetHeight - 12));
      this.element.style.left = `${this.moved.left}px`; this.element.style.top = `${this.moved.top}px`;
      return;
    }
    if (this.mobile && this.element.classList.contains("marglow-composer")) {
      this.element.style.width = `${Math.max(0, width - 24)}px`;
      this.element.style.left = `${left + 12}px`;
      this.element.style.top = `${Math.max(top + 12, top + height - this.element.offsetHeight - 16)}px`;
    } else {
      const panelWidth = Math.min(this.element.offsetWidth, width - 24);
      this.element.style.maxWidth = `${width - 24}px`;
      this.element.style.left = `${Math.max(left + 12, Math.min(this.rect.left, left + width - panelWidth - 12))}px`;
      const tools = this.actionContainer && win.getComputedStyle(this.actionContainer).visibility !== "hidden" ? this.actionContainer.getBoundingClientRect() : null;
      const minTop = Math.min(Math.max(top + 12, tools ? tools.bottom + 8 : 0), Math.max(top + 12, top + height - this.element.offsetHeight - 12));
      const proposed = this.rect.top - this.element.offsetHeight - 10;
      this.element.style.top = `${Math.max(minTop, Math.min(proposed >= minTop ? proposed : this.rect.bottom + 10, top + height - this.element.offsetHeight - 12))}px`;
    }
  }

  close(): void {
    const wasOpen = this.element !== null;
    this.element?.remove();
    this.inlineHost?.classList.remove("is-editing");
    if (this.inlineHost?.dataset.marglowDraft === "true") this.inlineHost.remove();
    this.inlineHost = null;
    this.moved = null;
    this.element = null;
    this.saveDraft = null;
    if (wasOpen) this.onClose();
  }

  dispose(): void {
    this.abort.abort();
    this.close();
  }
}
