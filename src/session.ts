import type { Entry } from "./format";
import { AnnotationStore } from "./store";
import { AnnotationUI, colorButton } from "./ui";
import { COLORS, createAnnotation, type Color, type Annotation, type CapturedSelection, type DocumentAdapter, type LocatedAnnotation, type Source } from "./model";

export interface SessionCallbacks {
  report(message: string): void;
  openNote(source: Source): Promise<void>;
  isReassociating(): boolean;
  reassociate(selection: CapturedSelection): Promise<void>;
  cancelReassociation(): void;
  onUiClosed(): void;
}

export class AnnotationSession {
  readonly ui: AnnotationUI;
  entries: Entry[] = [];
  private located: LocatedAnnotation[] = [];
  private overlay: HTMLElement;
  private tools: HTMLElement;
  private notesButton: HTMLButtonElement;
  private abort = new AbortController();
  private observer: MutationObserver;
  private resize: ResizeObserver;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private selectionTimer: ReturnType<typeof setTimeout> | undefined;
  private version = 0;
  private disposed = false;
  private error = "";
  private suspended = false;
  private pointerStart: { x: number; y: number } | null = null;
  private preferredColor: Color = "yellow";
  private toolMode: "highlight" | "comment" | null = null;
  private pageHighlight: HTMLButtonElement;
  private pageComment: HTMLButtonElement;
  private pageBusy = false;
  private pointerActive = false;

  constructor(readonly source: Source, readonly adapter: DocumentAdapter, private store: AnnotationStore, mobile: boolean, private callbacks: SessionCallbacks) {
    const root = adapter.root;
    const document = root.ownerDocument;
    this.ui = new AnnotationUI(document, mobile, callbacks.report, callbacks.onUiClosed);
    this.overlay = document.createElement("div");
    this.overlay.className = "marglow-overlay";
    this.overlay.setAttribute("aria-hidden", "true");
    this.tools = document.createElement("div");
    this.tools.className = `marglow-ui marglow-file-tools${mobile ? " marglow-mobile" : ""}`;
    this.tools.setAttribute("role", "toolbar");
    this.tools.setAttribute("aria-label", "Page annotation tools");
    this.tools.addEventListener("pointerdown", event => {
      if ((event.target as Element).closest("button")) { event.preventDefault(); event.stopPropagation(); }
    });
    for (const color of COLORS) {
      colorButton(this.tools, color, async () => {
        if (this.ui.hasDraft || this.ui.isBusy) return;
        this.preferredColor = color;
        this.updatePageTools();
        const selection = this.currentSelection();
        if (selection) await this.pageAction(selection, "highlight");
      }, `Choose ${color}`);
    }
    this.pageHighlight = document.createElement("button");
    this.pageHighlight.type = "button";
    this.pageHighlight.textContent = "Highlight";
    this.pageHighlight.addEventListener("click", () => this.chooseTool("highlight"));
    this.pageComment = document.createElement("button");
    this.pageComment.type = "button";
    this.pageComment.textContent = "Comment";
    this.pageComment.addEventListener("click", () => this.chooseTool("comment"));
    this.tools.append(this.pageHighlight, this.pageComment);
    this.notesButton = document.createElement("button");
    this.notesButton.textContent = "Reading notes";
    this.notesButton.addEventListener("click", () => { void callbacks.openNote(source).catch(error => callbacks.report(String(error))); });
    this.tools.append(this.notesButton);
    this.updatePageTools();
    root.classList.add("marglow-source");
    root.prepend(this.tools);
    root.append(this.overlay);
    const signal = this.abort.signal;
    root.addEventListener("pointerdown", event => { this.pointerStart = { x: event.clientX, y: event.clientY }; this.pointerActive = true; }, { signal });
    document.addEventListener("pointerup", () => {
      if (this.pointerActive) { this.pointerActive = false; clearTimeout(this.selectionTimer); this.selectionTimer = setTimeout(() => this.capture(), 0); }
    }, { capture: true, signal });
    document.addEventListener("pointercancel", () => { this.pointerActive = false; }, { signal });
    document.addEventListener("selectionchange", () => {
      clearTimeout(this.selectionTimer);
      this.selectionTimer = setTimeout(() => this.capture(), 100);
    }, { signal });
    root.addEventListener("pointerup", event => {
      if ((event.target as Element).closest(".marglow-ui")) return;
      if (!document.getSelection()?.isCollapsed) { this.capture(); return; }
      if (this.pointerStart && Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 8) return;
      if (this.ui.hasDraft || this.ui.isBusy || (event.target as Element).closest("a, button, input")) return;
      const hits = this.located.filter(located => located.rects.some(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom));
      if (hits.length === 1) this.open(hits[0]!.annotation, new DOMRect(event.clientX, event.clientY, 1, 1));
      else if (hits.length > 1) this.ui.choose(new DOMRect(event.clientX, event.clientY, 1, 1), hits.map(hit => hit.annotation), annotation => this.open(annotation, new DOMRect(event.clientX, event.clientY, 1, 1)));
    }, { signal });
    root.addEventListener("scroll", () => this.scheduleRender(), { capture: true, signal });
    document.defaultView?.addEventListener("resize", () => this.scheduleRender(), { signal });
    this.observer = new MutationObserver(records => {
      const external = records.some(record => {
        const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
        if (target?.closest(".marglow-ui, .marglow-overlay")) return false;
        if (record.type === "childList" && [...record.addedNodes, ...record.removedNodes].every(node => node.nodeType === 1 && (node as Element).matches(".marglow-ui, .marglow-overlay"))) return false;
        return true;
      });
      if (external) this.scheduleRender();
    });
    this.observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["style", "data-loaded"] });
    this.resize = new ResizeObserver(() => this.scheduleRender());
    this.resize.observe(root);
    void this.refresh();
  }

  private capture(): void {
    if (this.disposed || this.suspended || this.pointerActive || this.ui.hasDraft || this.ui.isBusy || this.error) return;
    try {
      const selection = this.adapter.root.ownerDocument.getSelection();
      if (!selection || selection.isCollapsed) return;
      const captured = this.adapter.capture(selection);
      if (!captured) return;
      if (this.callbacks.isReassociating()) {
        this.ui.showRelocate(captured, { highlight: async () => {}, comment: async () => {}, relocate: () => this.callbacks.reassociate(captured), cancelRelocate: this.callbacks.cancelReassociation });
        return;
      }
      const existing = this.entries.find(entry => this.adapter.matches(entry.annotation, captured));
      if (this.toolMode) { void this.pageAction(captured, this.toolMode); return; }
      this.ui.show(captured, this.actions(captured, existing), existing?.annotation);
    } catch (error) {
      this.callbacks.report(error instanceof Error ? error.message : String(error));
    }
  }

  private actions(selection: CapturedSelection, entry?: Entry) {
    const annotation = entry?.annotation ?? createAnnotation(selection, this.preferredColor);
    const save = async (updated: Annotation) => {
      if (this.disposed) throw new Error("The source view closed. Reopen it before saving.");
      await this.store.save(this.source, { ...updated, updatedAt: new Date().toISOString() }, entry?.raw);
      this.adapter.root.ownerDocument.getSelection()?.removeAllRanges();
      await this.refresh();
    };
    return {
      highlight: (color: Annotation["color"], comment = annotation.comment) => save({ ...annotation, color, comment }),
      comment: (comment: string) => save({ ...annotation, comment }),
      ...(entry ? { delete: async () => {
        await this.store.remove(this.source, entry.annotation.id, entry.raw);
        this.adapter.root.ownerDocument.getSelection()?.removeAllRanges();
        await this.refresh();
      } } : {}),
    };
  }

  private open(annotation: Annotation, rect: DOMRect): void {
    const entry = this.entries.find(entry => entry.annotation.id === annotation.id);
    if (!entry || this.error) return;
    this.ui.show({ quote: annotation.quote, anchor: annotation.anchor, rect }, this.actions({ quote: annotation.quote, anchor: annotation.anchor, rect }, entry), annotation);
  }

  private currentSelection(): CapturedSelection | null {
    if (this.disposed || this.suspended || this.error) return null;
    try {
      const selection = this.adapter.root.ownerDocument.getSelection();
      return selection && !selection.isCollapsed ? this.adapter.capture(selection) : null;
    } catch (error) {
      this.callbacks.report(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private chooseTool(mode: "highlight" | "comment"): void {
    if (this.ui.hasDraft || this.ui.isBusy) return;
    const selection = this.currentSelection();
    if (selection) { void this.pageAction(selection, mode); return; }
    this.ui.close();
    this.toolMode = this.toolMode === mode ? null : mode;
    this.updatePageTools();
  }

  private async pageAction(selection: CapturedSelection, mode: "highlight" | "comment"): Promise<void> {
    if (this.pageBusy || this.ui.hasDraft || this.ui.isBusy || this.callbacks.isReassociating()) return;
    const entry = this.entries.find(entry => this.adapter.matches(entry.annotation, selection));
    const actions = this.actions(selection, entry);
    if (mode === "comment") {
      this.toolMode = null;
      this.updatePageTools();
      this.ui.showComment(selection, actions, entry?.annotation);
      return;
    }
    this.pageBusy = true;
    try { await actions.highlight(this.preferredColor); this.ui.close(); }
    catch (error) { this.callbacks.report(error instanceof Error ? error.message : String(error)); }
    finally { this.pageBusy = false; }
  }

  private updatePageTools(): void {
    this.tools.querySelectorAll<HTMLButtonElement>(".marglow-color").forEach(button => button.setAttribute("aria-pressed", String(button.classList.contains(`marglow-${this.preferredColor}`))));
    this.pageHighlight.setAttribute("aria-pressed", String(this.toolMode === "highlight"));
    this.pageComment.setAttribute("aria-pressed", String(this.toolMode === "comment"));
    this.pageHighlight.title = this.toolMode === "highlight" ? "Highlight mode on — select text, or click to turn off" : "Highlight the selection or activate highlight mode";
    this.pageComment.title = this.toolMode === "comment" ? "Select text to add a comment" : "Comment on the selection or select text next";
  }

  async refresh(): Promise<void> {
    if (this.disposed || this.suspended) return;
    const version = ++this.version;
    try {
      const { note } = await this.store.load(this.source);
      if (this.disposed || this.suspended || version !== this.version) return;
      this.entries = note?.entries ?? [];
      this.error = "";
      this.render();
    } catch (error) {
      // File and metadata events can briefly disagree during native renames or edits.
      await new Promise(resolve => setTimeout(resolve, 120));
      if (this.disposed || this.suspended || version !== this.version) return;
      const message = error instanceof Error ? error.message : String(error);
      if (message !== this.error) this.callbacks.report(message);
      this.error = message;
      this.tools.dataset.error = "true";
      this.notesButton.textContent = "Reading note needs repair";
      this.notesButton.title = message;
    }
  }

  private scheduleRender(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.render(), 40);
  }

  private render(): void {
    if (this.disposed || this.suspended || this.error) return;
    const root = this.adapter.root;
    this.adapter.refreshLayout();
    const box = root.getBoundingClientRect();
    const nodes: HTMLElement[] = [];
    const located: LocatedAnnotation[] = [];
    let unlocated = 0;
    for (const entry of this.entries) {
      const rects = this.adapter.locate(entry.annotation);
      if (rects === null) { unlocated++; continue; }
      located.push({ annotation: entry.annotation, rects });
      for (const rect of rects) {
        const element = root.ownerDocument.createElement("div");
        element.className = `marglow-highlight marglow-${entry.annotation.color}`;
        element.dataset.annotationId = entry.annotation.id;
        element.dataset.comment = String(!!entry.annotation.comment.trim());
        element.style.left = `${rect.left - box.left + root.scrollLeft}px`;
        element.style.top = `${rect.top - box.top + root.scrollTop}px`;
        element.style.width = `${rect.width}px`;
        element.style.height = `${rect.height}px`;
        nodes.push(element);
      }
    }
    this.overlay.style.width = `${root.scrollWidth}px`;
    this.overlay.style.height = `${root.scrollHeight}px`;
    this.overlay.replaceChildren(...nodes);
    this.located = located;
    this.tools.dataset.error = "false";
    this.notesButton.textContent = `Reading notes · ${this.entries.length}${unlocated ? ` · ${unlocated} unlocated` : ""}`;
    this.notesButton.title = unlocated ? "Open reading notes, then run Reassociate an annotation." : "Open editable Markdown reading notes";
  }

  dispose(): void {
    this.disposed = true;
    this.version++;
    clearTimeout(this.timer);
    clearTimeout(this.selectionTimer);
    this.abort.abort();
    this.observer.disconnect();
    this.resize.disconnect();
    this.ui.dispose();
    this.overlay.remove();
    this.tools.remove();
    this.adapter.root.classList.remove("marglow-source");
    this.adapter.dispose();
  }

  suspend(): void {
    this.suspended = true;
    this.overlay.replaceChildren();
    this.located = [];
  }
}
