import { setIcon } from "obsidian";
import { isAnnotationDelete } from "./keyboard";
import { AnnotationSidebar } from "./sidebar";
import type { Entry } from "./format";
import { AnnotationStore } from "./store";
import { AnnotationUI, colorButton } from "./ui";
import { COLORS, createAnnotation, type Color, type Annotation, type CapturedSelection, type DocumentAdapter, type LocatedAnnotation, type Source } from "./model";

export interface SessionCallbacks {
  report(message: string): void;
  isReassociating(): boolean;
  reassociate(selection: CapturedSelection): Promise<void>;
  cancelReassociation(): void;
  onUiClosed(): void;
  openComments(session: AnnotationSession): Promise<void>;
  revealSource(): Promise<void>;
  isActive(): boolean;
}

export class AnnotationSession {
  readonly ui: AnnotationUI;
  entries: Entry[] = [];
  private located: LocatedAnnotation[] = [];
  private overlay: HTMLElement;
  private overlays = new Map<HTMLElement, HTMLElement>();
  private readingContainer: HTMLElement | null = null;
  private tools: HTMLElement;
  private notesButton: HTMLButtonElement;
  private abort = new AbortController();
  private observer: MutationObserver;
  private resize: ResizeObserver;
  private frame: number | undefined;
  private selectionTimer: ReturnType<typeof setTimeout> | undefined;
  private version = 0;
  private disposed = false;
  private error = "";
  private suspended = false;
  private pointerStart: { x: number; y: number } | null = null;
  private preferredColor: Color = "yellow";
  private preferredStyle: "highlight" | "underline" = "highlight";
  private toolMode: "highlight" | "underline" | "comment" | null = null;
  private pageHighlight: HTMLButtonElement;
  private pageUnderline: HTMLButtonElement;
  private pageComment: HTMLButtonElement;
  private pageBusy = false;
  private pointerActive = false;
  private sidebar: AnnotationSidebar;
  private activeId: string | null = null;
  private hoveredId: string | null = null;
  private preview: Annotation | null = null;
  private navigation = 0;
  private unlocated = new Set<string>();

  constructor(readonly source: Source, readonly adapter: DocumentAdapter, private store: AnnotationStore, mobile: boolean, private callbacks: SessionCallbacks) {
    const root = adapter.root;
    const document = root.ownerDocument;
    this.ui = new AnnotationUI(document, mobile, callbacks.report, () => { this.scheduleRender(); callbacks.onUiClosed(); }, () => this.render());
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
        if (selection) await this.pageAction(selection, this.preferredStyle);
      }, `Choose ${color}`);
    }
    this.pageHighlight = document.createElement("button");
    this.pageHighlight.type = "button";
    this.pageHighlight.setAttribute("aria-label", "Highlight");
    setIcon(this.pageHighlight, "highlighter");
    this.pageHighlight.addEventListener("click", () => this.chooseTool("highlight"));
    this.pageUnderline = document.createElement("button"); this.pageUnderline.type = "button";
    this.pageUnderline.setAttribute("aria-label", "Underline"); this.pageUnderline.title = "Underline the selection or activate underline mode";
    setIcon(this.pageUnderline, "underline");
    this.pageUnderline.addEventListener("click", () => this.chooseTool("underline"));
    this.pageComment = document.createElement("button");
    this.pageComment.type = "button";
    this.pageComment.setAttribute("aria-label", "Comment");
    setIcon(this.pageComment, "message-square");
    this.pageComment.addEventListener("click", () => this.chooseTool("comment"));
    this.tools.append(this.pageHighlight, this.pageUnderline, this.pageComment);
    this.sidebar = new AnnotationSidebar(document, (annotation, edit) => { void this.selectFromSidebar(annotation, edit).catch(error => callbacks.report(error instanceof Error ? error.message : String(error))); }, id => this.emphasize(this.activeId, id), annotation => { void this.removeFromSidebar(annotation); });
    this.ui.navigationContainer = this.sidebar.element;
    this.sidebar.element.classList.toggle("marglow-mobile", mobile);
    this.notesButton = document.createElement("button");
    this.notesButton.type = "button";
    this.notesButton.textContent = "Reading notes";
    this.notesButton.addEventListener("click", () => { void callbacks.openComments(this).catch(error => callbacks.report(String(error))); });
    this.tools.append(this.notesButton);
    this.updatePageTools();
    root.classList.add("marglow-source");
    if (source.type === "markdown" && root.parentElement) {
      this.readingContainer = root.parentElement;
      this.readingContainer.classList.add("marglow-reading-container");
      this.readingContainer.insertBefore(this.tools, root);
    } else root.prepend(this.tools);
    root.append(this.overlay);
    this.overlays.set(root, this.overlay);
    const signal = this.abort.signal;
    root.addEventListener("pointerdown", event => { this.pointerStart = { x: event.clientX, y: event.clientY }; this.pointerActive = true; }, { signal });
    document.addEventListener("pointerup", () => {
      if (this.pointerActive) { this.pointerActive = false; clearTimeout(this.selectionTimer); this.selectionTimer = setTimeout(() => this.capture(), 0); }
    }, { capture: true, signal });
    document.addEventListener("pointercancel", () => { this.pointerActive = false; }, { signal });
    document.addEventListener("keydown", event => {
      if (!isAnnotationDelete(event) || !callbacks.isActive() || this.disposed || this.suspended || this.error || this.pageBusy || this.ui.isBusy || this.ui.hasDraft) return;
      const entry = this.entries.find(entry => entry.annotation.id === this.activeId);
      if (!entry) return;
      const selection = document.getSelection();
      if (selection && !selection.isCollapsed) {
        const captured = this.currentSelection();
        if (!captured || !this.adapter.matches(entry.annotation, captured)) return;
      }
      event.preventDefault(); event.stopPropagation();
      this.pageBusy = true;
      void this.removeEntry(entry).then(() => this.ui.close()).catch(error => callbacks.report(error instanceof Error ? error.message : String(error))).finally(() => { this.pageBusy = false; });
    }, { capture: true, signal });
    document.addEventListener("selectionchange", () => {
      clearTimeout(this.selectionTimer);
      this.selectionTimer = setTimeout(() => this.capture(), 100);
    }, { signal });
    root.addEventListener("pointerup", event => {
      if ((event.target as Element).closest(".marglow-ui")) return;
      if (!document.getSelection()?.isCollapsed) { this.capture(); return; }
      if (this.pointerStart && Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 8) return;
      if (this.ui.hasDraft || this.ui.isBusy || (event.target as Element).closest("a, button, input")) return;
      const hits = this.hits(event.clientX, event.clientY);
      if (!hits.length) this.emphasize(null, null);
      if (hits.length === 1) this.open(hits[0]!.annotation, new DOMRect(event.clientX, event.clientY, 1, 1));
      else if (hits.length > 1) this.ui.choose(new DOMRect(event.clientX, event.clientY, 1, 1), hits.map(hit => hit.annotation), annotation => this.open(annotation, new DOMRect(event.clientX, event.clientY, 1, 1)));
    }, { signal });
    root.addEventListener("pointermove", event => {
      if (this.pointerActive || (event.target as Element).closest(".marglow-ui")) return;
      const hits = this.hits(event.clientX, event.clientY);
      this.emphasize(this.activeId, hits.find(hit => hit.annotation.id === this.activeId)?.annotation.id ?? hits[0]?.annotation.id ?? null);
    }, { signal });
    root.addEventListener("pointerleave", () => this.emphasize(this.activeId, null), { signal });
    root.addEventListener("scroll", () => { if (this.source.type !== "pdf") this.scheduleRender(); }, { capture: true, signal });
    document.defaultView?.addEventListener("resize", () => this.scheduleRender(), { signal });
    this.observer = new MutationObserver(records => {
      const external = records.some(record => {
        const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
        if (target?.closest(".marglow-ui, .marglow-overlay")) return false;
        if (record.type === "childList" && [...record.removedNodes].some(node => [...this.overlays.values()].includes(node as HTMLElement))) return true;
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
      const existing = this.entries.find(entry => (entry.annotation.style ?? "highlight") === this.preferredStyle && this.adapter.matches(entry.annotation, captured));
      if (this.toolMode) { void this.pageAction(captured, this.toolMode); return; }
      this.ui.show(captured, this.actions(captured, existing), existing?.annotation);
      this.render();
    } catch (error) {
      this.callbacks.report(error instanceof Error ? error.message : String(error));
    }
  }

  private actions(selection: CapturedSelection, entry?: Entry) {
    const annotation = entry?.annotation ?? createAnnotation(selection, this.preferredColor, "", this.preferredStyle);
    this.preview = entry ? null : annotation;
    this.emphasize(annotation.id, this.hoveredId, true);
    this.render();
    const save = async (updated: Annotation) => {
      if (this.disposed) throw new Error("The source view closed. Reopen it before saving.");
      await this.store.save(this.source, { ...updated, updatedAt: new Date().toISOString() }, entry?.raw);
      this.preview = null;
      this.activeId = updated.id;
      this.adapter.root.ownerDocument.getSelection()?.removeAllRanges();
      await this.refresh();
    };
    return {
      highlight: (color: Annotation["color"], comment = annotation.comment) => save({ ...annotation, color, comment }),
      comment: (comment: string) => save({ ...annotation, comment }),
      ...(entry ? { delete: async () => {
        await this.removeEntry(entry);
      } } : {}),
    };
  }

  private async removeFromSidebar(annotation: Annotation): Promise<void> {
    if (this.disposed || this.suspended || this.error || this.pageBusy || !await this.ui.finish()) return;
    if (this.disposed || this.suspended || this.error || this.pageBusy) return;
    const entry = this.entries.find(entry => entry.annotation.id === annotation.id);
    if (!entry) return;
    this.pageBusy = true;
    try { await this.removeEntry(entry); }
    catch (error) { this.callbacks.report(error instanceof Error ? error.message : String(error)); }
    finally { this.pageBusy = false; }
  }

  private async removeEntry(entry: Entry): Promise<void> {
    await this.store.remove(this.source, entry.annotation.id, entry.raw);
    this.activeId = null; this.hoveredId = null; this.preview = null;
    this.adapter.root.ownerDocument.getSelection()?.removeAllRanges();
    await this.refresh();
  }

  private open(annotation: Annotation, rect: DOMRect): void {
    const entry = this.entries.find(entry => entry.annotation.id === annotation.id);
    if (!entry || this.error) return;
    this.ui.show({ quote: annotation.quote, anchor: annotation.anchor, rect }, this.actions({ quote: annotation.quote, anchor: annotation.anchor, rect }, entry), annotation);
    void this.callbacks.openComments(this).then(() => {
      if (!this.disposed && !this.suspended && this.activeId === annotation.id) this.sidebar.emphasize(this.activeId, this.hoveredId, true);
    });
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

  private chooseTool(mode: "highlight" | "underline" | "comment"): void {
    if (this.ui.hasDraft || this.ui.isBusy) return;
    if (this.toolMode === mode) {
      this.toolMode = null;
      clearTimeout(this.selectionTimer);
      this.adapter.root.ownerDocument.getSelection()?.removeAllRanges();
      this.ui.close(); this.updatePageTools(); return;
    }
    if (mode !== "comment") this.preferredStyle = mode;
    const selection = this.currentSelection();
    if (selection) { void this.pageAction(selection, mode); return; }
    this.ui.close();
    this.toolMode = this.toolMode === mode ? null : mode;
    this.updatePageTools();
  }

  private async pageAction(selection: CapturedSelection, mode: "highlight" | "underline" | "comment"): Promise<void> {
    if (this.pageBusy || this.ui.hasDraft || this.ui.isBusy || this.callbacks.isReassociating()) return;
    if (mode !== "comment") this.preferredStyle = mode;
    const entry = this.entries.find(entry => (entry.annotation.style ?? "highlight") === this.preferredStyle && this.adapter.matches(entry.annotation, selection));
    const actions = this.actions(selection, entry);
    if (mode === "comment") {
      this.toolMode = null;
      this.updatePageTools();
      this.ui.showComment(selection, actions, entry?.annotation);
      this.render();
      return;
    }
    this.pageBusy = true;
    try { await actions.highlight(this.preferredColor); this.ui.close(); }
    catch (error) { this.callbacks.report(error instanceof Error ? error.message : String(error)); }
    finally { this.pageBusy = false; }
  }

  private updatePageTools(): void {
    this.tools.querySelectorAll<HTMLButtonElement>(".marglow-color").forEach(button => button.setAttribute("aria-pressed", String(button.classList.contains(`marglow-${this.preferredColor}`))));
    this.pageUnderline.setAttribute("aria-pressed", String(this.toolMode === "underline"));
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
      this.sidebar.render(this.entries.map(entry => entry.annotation), this.unlocated, message);
      this.tools.dataset.error = "true";
      this.notesButton.textContent = "Reading note needs repair";
      this.notesButton.title = message;
    }
  }

  private scheduleRender(): void {
    if (this.frame !== undefined || this.disposed || this.suspended) return;
    this.frame = this.adapter.root.ownerDocument.defaultView!.requestAnimationFrame(() => {
      this.frame = undefined;
      this.render();
    });
  }

  private render(): void {
    if (this.disposed || this.suspended || this.error) return;
    const root = this.adapter.root;
    this.adapter.refreshLayout();
    const layers = new Map<HTMLElement, HTMLElement[]>();
    const located: LocatedAnnotation[] = [];
    this.unlocated = new Set();
    const annotations = this.entries.map(entry => entry.annotation);
    if (this.preview && this.ui.hasDraft) annotations.push(this.preview);
    for (const annotation of annotations) {
      const rects = this.adapter.locate(annotation);
      if (rects === null) { this.unlocated.add(annotation.id); continue; }
      located.push({ annotation, rects });
      for (const rect of rects) {
        const host = this.adapter.overlayHost?.(rect) ?? root;
        const box = host.getBoundingClientRect();
        const nodes = layers.get(host) ?? [];
        layers.set(host, nodes);
        const element = root.ownerDocument.createElement("div");
        element.className = `marglow-highlight marglow-${annotation.color}${annotation.style === "underline" ? " marglow-underline" : ""}`;
        element.dataset.annotationId = annotation.id;
        element.dataset.comment = String(!!annotation.comment.trim());
        element.style.left = `${rect.left - box.left - host.clientLeft + host.scrollLeft}px`;
        element.style.top = `${rect.top - box.top - host.clientTop + host.scrollTop}px`;
        element.style.width = `${rect.width}px`;
        element.style.height = `${rect.height}px`;
        nodes.push(element);
      }
    }
    for (const [host, overlay] of this.overlays) {
      if (!layers.has(host)) {
        if (host === root) overlay.replaceChildren();
        else { overlay.remove(); this.overlays.delete(host); }
      }
    }
    for (const [host, nodes] of layers) {
      let overlay = this.overlays.get(host);
      if (!overlay) {
        overlay = root.ownerDocument.createElement("div");
        overlay.className = "marglow-overlay";
        overlay.setAttribute("aria-hidden", "true");
        host.append(overlay); this.overlays.set(host, overlay);
      }
      if (overlay.parentElement !== host) host.append(overlay);
      overlay.style.width = `${host.scrollWidth}px`;
      overlay.style.height = `${host.scrollHeight}px`;
      overlay.replaceChildren(...nodes);
    }
    this.located = located;
    if (this.activeId && this.activeId !== this.preview?.id && !annotations.some(annotation => annotation.id === this.activeId)) this.activeId = null;
    this.sidebar.render(this.entries.map(entry => entry.annotation).sort((a, b) => {
      const position = (annotation: Annotation) => annotation.anchor.kind === "markdown" ? annotation.anchor.textStart : annotation.anchor.segments[0]!.page;
      return Number(this.unlocated.has(a.id)) - Number(this.unlocated.has(b.id)) || position(a) - position(b);
    }), this.unlocated, "");
    this.emphasize(this.activeId, this.hoveredId);
    this.tools.dataset.error = "false";
    this.notesButton.textContent = `Reading notes · ${this.entries.length}${this.unlocated.size ? ` · ${this.unlocated.size} unlocated` : ""}`;
    this.notesButton.title = this.unlocated.size ? "Show annotations in the sidebar; use Reassociate an annotation for unlocated entries." : "Show reading notes in the right sidebar";
  }

  private hits(x: number, y: number): LocatedAnnotation[] {
    if (this.source.type === "pdf") this.located = this.entries.map(entry => ({ annotation: entry.annotation, rects: this.adapter.locate(entry.annotation) ?? [] }));
    return this.located.filter(item => item.rects.some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom));
  }

  private emphasize(active: string | null, hovered: string | null, reveal = false): void {
    this.activeId = active; this.hoveredId = hovered;
    for (const overlay of this.overlays.values()) for (const node of overlay.children) {
      const element = node as HTMLElement;
      element.classList.toggle("is-active", element.dataset.annotationId === active);
      element.classList.toggle("is-hovered", element.dataset.annotationId === hovered);
    }
    this.sidebar.emphasize(active, hovered, reveal);
  }

  get sidebarElement(): HTMLElement { return this.sidebar.element; }

  private async selectFromSidebar(annotation: Annotation, edit: boolean): Promise<void> {
    if (!await this.ui.finish() || this.disposed || this.suspended || this.error) return;
    const entry = this.entries.find(entry => entry.annotation.id === annotation.id);
    if (!entry) return;
    this.preview = null;
    this.adapter.root.ownerDocument.getSelection()?.removeAllRanges();
    this.emphasize(annotation.id, this.hoveredId, true);
    const token = ++this.navigation;
    await this.callbacks.revealSource();
    const navigated = await this.adapter.scrollTo?.(entry.annotation) ?? false;
    if (this.disposed || this.suspended || token !== this.navigation) return;
    this.render();
    const rect = this.located.find(item => item.annotation.id === annotation.id)?.rects[0];
    if (!navigated) this.callbacks.report(this.unlocated.has(annotation.id) ? "This annotation is unlocated. Reassociate it from Reading notes." : "The document viewer could not load this annotation location. Reopen the source and try again.");
    if (edit) {
      const selection = { quote: entry.annotation.quote, anchor: entry.annotation.anchor, rect: rect ?? this.sidebar.element.getBoundingClientRect() };
      this.ui.showComment(selection, this.actions(selection, entry), entry.annotation, this.sidebar.editorHost(annotation.id));
    }
  }

  dispose(): void {
    this.disposed = true;
    this.navigation++;
    this.version++;
    if (this.frame !== undefined) this.adapter.root.ownerDocument.defaultView!.cancelAnimationFrame(this.frame);
    clearTimeout(this.selectionTimer);
    this.abort.abort();
    this.observer.disconnect();
    this.resize.disconnect();
    this.ui.dispose();
    for (const overlay of this.overlays.values()) overlay.remove();
    this.overlays.clear();
    this.readingContainer?.classList.remove("marglow-reading-container");
    this.tools.remove();
    this.sidebar.dispose();
    this.adapter.root.classList.remove("marglow-source");
    this.adapter.dispose();
  }

  suspend(): void {
    this.suspended = true;
    this.tools.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = true; });
    for (const overlay of this.overlays.values()) overlay.replaceChildren();
    this.located = [];
  }
}
