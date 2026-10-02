import { setIcon } from "obsidian";
import { isAnnotationDelete } from "./keyboard";
import { AnnotationSidebar } from "./sidebar";
import type { Entry } from "./format";
import { AnnotationStore } from "./store";
import { AnnotationUI, colorButton } from "./ui";
import { overlayRect } from "./overlay-geometry";
import { CommentPreview } from "./comment-preview";
import { setReadingIcon } from "./action-icons";
import { COLORS, createAnnotation, type Color, type Annotation, type CapturedSelection, type DocumentAdapter, type LocatedAnnotation, type Source } from "./model";

export interface SessionCallbacks {
  report(this: void, message: string): void;
  isReassociating(this: void): boolean;
  reassociate(this: void, selection: CapturedSelection): Promise<void>;
  cancelReassociation(this: void): void;
  onUiClosed(this: void): void;
  toggleComments(this: void, session: AnnotationSession): Promise<void>;
  isCommentsVisible(this: void, session: AnnotationSession): boolean;
  revealSource(this: void): Promise<void>;
  isActive(this: void): boolean;
  copyReference?(this: void, annotation: Annotation): Promise<void>;
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
  private abort: AbortController;
  private observer: MutationObserver;
  private resize: ResizeObserver;
  private frame: number | undefined;
  private selectionTimer: number | undefined;
  private toolbarSelection: CapturedSelection | null = null;
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
  private commentPreview: CommentPreview;

  constructor(readonly source: Source, readonly adapter: DocumentAdapter, private store: AnnotationStore, private mobile: boolean, private callbacks: SessionCallbacks) {
    const root = adapter.root;
    const document = root.ownerDocument;
    this.abort = new document.win.AbortController();
    this.ui = new AnnotationUI(document, mobile, callbacks.report, () => { this.preview = null; this.scheduleRender(); callbacks.onUiClosed(); }, () => this.render());
    this.commentPreview = new CommentPreview(document);
    this.overlay = document.win.createDiv();
    this.overlay.className = "marglow-overlay";
    this.overlay.setAttribute("aria-hidden", "true");
    this.tools = document.win.createDiv();
    this.tools.className = `marglow-ui marglow-file-tools${mobile ? " marglow-mobile" : ""}`;
    this.tools.setAttribute("role", "toolbar");
    this.tools.setAttribute("aria-label", "Page annotation tools");
    this.tools.addEventListener("pointerdown", event => {
      const button = (event.target as Element).closest("button");
      if (button) {
        this.toolbarSelection = !button.classList.contains("marglow-notes-button") ? this.currentSelection() : null;
        if (event.pointerType !== "touch") event.preventDefault();
        event.stopPropagation();
      }
    });
    this.tools.addEventListener("click", () => { this.toolbarSelection = null; });
    for (const color of COLORS) {
      colorButton(this.tools, color, async () => {
        const selection = this.selectionForTool();
        if (this.pageBusy || this.error || !await this.ui.finish()) return;
        this.preferredColor = color;
        this.updatePageTools();
        if (selection) await this.pageAction(selection, this.preferredStyle);
        else await this.changeSelected({ color });
      }, `Choose ${color}`);
    }
    this.pageHighlight = document.win.createEl("button");
    this.pageHighlight.type = "button";
    this.pageHighlight.setAttribute("aria-label", "Highlight");
    setIcon(this.pageHighlight, "highlighter");
    this.pageHighlight.addEventListener("click", () => { void this.chooseTool("highlight"); });
    this.pageUnderline = document.win.createEl("button"); this.pageUnderline.type = "button";
    this.pageUnderline.setAttribute("aria-label", "Underline"); this.pageUnderline.title = "Underline the selection or activate underline mode";
    setIcon(this.pageUnderline, "underline");
    this.pageUnderline.addEventListener("click", () => { void this.chooseTool("underline"); });
    this.pageComment = document.win.createEl("button");
    this.pageComment.type = "button";
    this.pageComment.setAttribute("aria-label", "Comment");
    setIcon(this.pageComment, "message-square");
    this.pageComment.addEventListener("click", () => { void this.chooseTool("comment"); });
    this.tools.append(this.pageHighlight, this.pageUnderline, this.pageComment);
    this.sidebar = new AnnotationSidebar(document, (annotation, edit) => { void this.selectFromSidebar(annotation, edit).catch(error => callbacks.report(error instanceof Error ? error.message : String(error))); }, id => this.emphasize(this.activeId, id), annotation => { void this.removeFromSidebar(annotation); }, annotation => { void callbacks.copyReference?.(annotation).catch(error => callbacks.report(String(error))); });
    this.ui.navigationContainer = this.sidebar.element;
    this.ui.actionContainer = this.tools;
    this.sidebar.element.classList.toggle("marglow-mobile", mobile);
    this.notesButton = document.win.createEl("button");
    this.notesButton.className = "marglow-notes-button";
    this.notesButton.type = "button";
    this.notesButton.textContent = "Reading notes";
    this.notesButton.addEventListener("click", () => { void callbacks.toggleComments(this).catch(error => callbacks.report(String(error))); });
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
    root.addEventListener("pointerdown", event => { this.toolbarSelection = null; this.pointerStart = { x: event.clientX, y: event.clientY }; this.pointerActive = true; }, { signal });
    document.addEventListener("pointerup", () => {
      if (this.pointerActive) { this.pointerActive = false; window.clearTimeout(this.selectionTimer); this.selectionTimer = window.setTimeout(() => this.capture(), 0); }
    }, { capture: true, signal });
    document.addEventListener("pointercancel", () => { this.pointerActive = false; this.toolbarSelection = null; }, { signal });
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
      this.syncTextSelection();
      window.clearTimeout(this.selectionTimer);
      this.selectionTimer = window.setTimeout(() => this.capture(), 100);
    }, { signal });
    root.addEventListener("pointerup", event => {
      if ((event.target as Element).closest(".marglow-ui")) return;
      if (!document.getSelection()?.isCollapsed) { this.capture(); return; }
      if (this.pointerStart && Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 8) return;
      if (this.ui.hasDraft || this.ui.isBusy || (event.target as Element).closest("a, button, input")) return;
      const hits = this.hits(event.clientX, event.clientY);
      if (!hits.length) this.emphasize(null, null);
      if (hits.length === 1) this.open(hits[0]!.annotation, new DOMRect(event.clientX, event.clientY, 1, 1));
      else if (hits.length > 1) {
        const rect = new DOMRect(event.clientX, event.clientY, 1, 1);
        if (this.callbacks.isCommentsVisible(this)) {
          // All overlapping entries remain selectable in the sidebar.
          this.open(hits.find(hit => hit.annotation.id === this.activeId)?.annotation ?? hits[0]!.annotation, rect);
        } else this.ui.choose(rect, hits.map(hit => hit.annotation), annotation => this.open(annotation, rect));
      }
    }, { signal });
    root.addEventListener("pointermove", event => {
      if (event.pointerType === "touch" || this.pointerActive || this.hasTextSelection() || this.ui.hasDraft || this.ui.isBusy || (event.target as Element).closest(".marglow-ui")) { this.commentPreview.hide(); return; }
      const hits = this.hits(event.clientX, event.clientY);
      const hit = hits.find(hit => hit.annotation.id === this.activeId) ?? hits[0];
      this.emphasize(this.activeId, hit?.annotation.id ?? null);
      if (hit?.annotation.comment.trim()) this.commentPreview.show(hit.annotation, hit.rects.find(rect => event.clientY >= rect.top && event.clientY <= rect.bottom) ?? new DOMRect(event.clientX, event.clientY, 1, 1));
      else this.commentPreview.leave();
    }, { signal });
    root.addEventListener("pointerleave", () => { this.emphasize(this.activeId, null); this.commentPreview.leave(); }, { signal });
    root.addEventListener("scroll", () => { this.commentPreview.hide(); if (this.source.type !== "pdf") this.scheduleRender(); }, { capture: true, signal });
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
    this.resize = new ResizeObserver(() => {
      if (this.mobile && this.readingContainer && this.tools.offsetHeight) {
        const height = `${this.tools.offsetHeight}px`;
        if (this.readingContainer.style.getPropertyValue("--marglow-tools-height") !== height) this.readingContainer.style.setProperty("--marglow-tools-height", height);
      }
      this.scheduleRender();
    });
    this.resize.observe(root);
    this.resize.observe(this.tools);
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
      if (existing && this.callbacks.isCommentsVisible(this)) {
        this.open(existing.annotation, captured.rect); return;
      }
      this.ui.show(captured, this.actions(captured, existing), existing?.annotation);
      this.render();
    } catch (error) {
      this.callbacks.report(error instanceof Error ? error.message : String(error));
    }
  }

  private actions(selection: CapturedSelection, entry?: Entry) {
    let snapshot = entry;
    let annotation = entry?.annotation ?? createAnnotation(selection, this.preferredColor, "", this.preferredStyle);
    this.preview = entry ? null : annotation;
    this.emphasize(annotation.id, this.hoveredId, true);
    this.render();
    const save = async (updated: Annotation) => {
      if (this.disposed) throw new Error("The source view closed. Reopen it before saving.");
      const saved = await this.store.save(this.source, { ...updated, updatedAt: new Date().toISOString() }, snapshot?.raw);
      // Advance only to the exact snapshot committed by this action. External
      // edits after it must still reject a subsequent write from the open popup.
      snapshot = saved; annotation = saved.annotation;
      this.preview = null;
      this.activeId = updated.id;
      this.adapter.root.ownerDocument.getSelection()?.removeAllRanges();
      await this.refresh();
    };
    return {
      current: () => snapshot?.annotation,
      highlight: (color: Annotation["color"], comment = annotation.comment) => save({ ...annotation, color, comment }),
      comment: (comment: string) => save({ ...annotation, comment }),
      style: async (style: "highlight" | "underline", comment?: string) => {
        if (snapshot) this.checkStyle(snapshot, style);
        else {
          const existing = this.entries.find(item => (item.annotation.style ?? "highlight") === style && this.adapter.matches(item.annotation, selection));
          if (existing) { snapshot = existing; annotation = existing.annotation; }
        }
        await save({ ...annotation, style, comment: comment ?? annotation.comment });
      },
      ...(entry ? { delete: async () => {
        await this.removeEntry(snapshot!);
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
    this.preview = null;
    this.commentPreview.hide(); this.toolMode = null;
    this.emphasize(annotation.id, this.hoveredId, true);
    if (this.callbacks.isCommentsVisible(this)) {
      this.ui.close();
      return;
    }
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

  private selectionForTool(): CapturedSelection | null {
    const selection = this.currentSelection() ?? this.toolbarSelection;
    this.toolbarSelection = null;
    return selection;
  }

  private async chooseTool(mode: "highlight" | "underline" | "comment"): Promise<void> {
    const selection = this.selectionForTool();
    if (this.pageBusy || this.error || !await this.ui.finish()) return;
    if (selection) { await this.pageAction(selection, mode); return; }
    if (this.toolMode === mode) {
      this.toolMode = null;
      window.clearTimeout(this.selectionTimer);
      this.adapter.root.ownerDocument.getSelection()?.removeAllRanges();
      this.ui.close(); this.updatePageTools(); return;
    }
    const entry = this.entries.find(entry => entry.annotation.id === this.activeId);
    if (entry) {
      if (mode !== "comment") await this.changeSelected({ style: mode });
      else {
        const rect = this.adapter.locate(entry.annotation)?.[0] ?? this.tools.getBoundingClientRect();
        const selected = { quote: entry.annotation.quote, anchor: entry.annotation.anchor, rect };
        this.ui.showComment(selected, this.actions(selected, entry), entry.annotation, this.callbacks.isCommentsVisible(this) ? this.sidebar.editorHost(entry.annotation.id) : undefined);
      }
      return;
    }
    if (mode !== "comment") this.preferredStyle = mode;
    this.ui.close();
    this.toolMode = this.toolMode === mode ? null : mode;
    this.updatePageTools();
  }

  private checkStyle(entry: Entry, style: "highlight" | "underline"): void {
    if ((entry.annotation.style ?? "highlight") === style) return;
    const selection = { quote: entry.annotation.quote, anchor: entry.annotation.anchor, rect: this.tools.getBoundingClientRect() };
    if (this.entries.some(other => other.annotation.id !== entry.annotation.id && (other.annotation.style ?? "highlight") === style && this.adapter.matches(other.annotation, selection))) throw new Error(`This selection already has an ${style === "underline" ? "underline" : "highlight"}. Select that annotation to edit it.`);
  }

  private async changeSelected(change: { color?: Color; style?: "highlight" | "underline" }): Promise<void> {
    const entry = this.entries.find(entry => entry.annotation.id === this.activeId);
    if (!entry || this.pageBusy || this.error) return;
    this.pageBusy = true;
    try {
      if (change.style) this.checkStyle(entry, change.style);
      if (change.color === entry.annotation.color || change.style === (entry.annotation.style ?? "highlight")) return;
      await this.store.save(this.source, { ...entry.annotation, ...change, updatedAt: new Date().toISOString() }, entry.raw);
      this.toolMode = null;
      await this.refresh();
    } catch (error) { this.callbacks.report(error instanceof Error ? error.message : String(error)); }
    finally { this.pageBusy = false; this.updatePageTools(); }
  }

  private hasTextSelection(): boolean {
    const selection = this.adapter.root.ownerDocument.getSelection();
    return !!selection && !selection.isCollapsed && !!selection.anchorNode && !!selection.focusNode && this.adapter.root.contains(selection.anchorNode) && this.adapter.root.contains(selection.focusNode) && !(selection.anchorNode.parentElement?.closest(".marglow-ui, .marglow-overlay"));
  }

  private syncTextSelection(): void {
    const selecting = this.hasTextSelection();
    this.adapter.root.classList.toggle("marglow-selecting", selecting);
    if (selecting) this.commentPreview.hide();
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
      const host = entry && this.callbacks.isCommentsVisible(this) ? this.sidebar.editorHost(entry.annotation.id) : undefined;
      this.ui.showComment(selection, actions, entry?.annotation, host);
      this.render();
      return;
    }
    this.pageBusy = true;
    try { await actions.highlight(this.preferredColor); this.ui.close(); }
    catch (error) { this.callbacks.report(error instanceof Error ? error.message : String(error)); }
    finally { this.pageBusy = false; }
  }

  private updatePageTools(): void {
    const selected = !this.hasTextSelection() ? this.entries.find(entry => entry.annotation.id === this.activeId)?.annotation : undefined;
    if (selected) { this.preferredColor = selected.color; this.preferredStyle = selected.style ?? "highlight"; }
    this.tools.querySelectorAll<HTMLButtonElement>(".marglow-color").forEach(button => button.setAttribute("aria-pressed", String(button.classList.contains(`marglow-${this.preferredColor}`))));
    this.pageUnderline.setAttribute("aria-pressed", String(selected ? selected.style === "underline" : this.toolMode === "underline"));
    this.pageHighlight.setAttribute("aria-pressed", String(selected ? (selected.style ?? "highlight") === "highlight" : this.toolMode === "highlight"));
    this.pageComment.setAttribute("aria-pressed", String(this.toolMode === "comment"));
    this.pageHighlight.title = selected ? "Change selected annotation to highlight" : this.toolMode === "highlight" ? "Highlight mode on — select text, or click to turn off" : "Highlight the selection or activate highlight mode";
    this.pageUnderline.title = selected ? "Change selected annotation to underline" : this.toolMode === "underline" ? "Underline mode on — select text, or click to turn off" : "Underline the selection or activate underline mode";
    this.pageComment.title = selected ? "Edit the selected annotation's comment" : this.toolMode === "comment" ? "Select text to add a comment" : "Comment on the selection or select text next";
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
      await new Promise(resolve => window.setTimeout(resolve, 120));
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

  async navigateTo(annotation: Annotation): Promise<void> { await this.selectFromSidebar(annotation, false); }

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
    this.commentPreview.validate(annotations);
    for (const annotation of annotations) {
      const rects = this.adapter.locate(annotation);
      if (rects === null) { this.unlocated.add(annotation.id); continue; }
      located.push({ annotation, rects });
      const indicators = new Map<HTMLElement, DOMRect>();
      for (const rect of rects) {
        const host = this.adapter.overlayHost?.(rect) ?? root;
        const local = overlayRect(rect, host);
        const nodes = layers.get(host) ?? [];
        layers.set(host, nodes);
        const element = root.ownerDocument.win.createDiv();
        element.className = `marglow-highlight marglow-${annotation.color}${annotation.style === "underline" ? " marglow-underline" : ""}`;
        element.dataset.annotationId = annotation.id;
        element.dataset.comment = String(!!annotation.comment.trim());
        element.style.left = `${local.left}px`;
        element.style.top = `${local.top}px`;
        element.style.width = `${local.width}px`;
        element.style.height = `${local.height}px`;
        nodes.push(element);
        if (annotation.comment.trim()) indicators.set(host, rect);
      }
      for (const [host, rect] of indicators) {
        const local = overlayRect(rect, host), icon = root.ownerDocument.win.createSpan();
        icon.className = `marglow-comment-indicator marglow-${annotation.color}`; icon.dataset.annotationId = annotation.id;
        setReadingIcon(icon, "comment");
        const width = host === root ? host.scrollWidth : host.clientWidth;
        icon.style.left = `${Math.max(0, Math.min(local.left + local.width + 3, width - 16))}px`;
        icon.style.top = `${Math.max(0, local.top + (local.height - 16) / 2)}px`;
        layers.get(host)!.push(icon);
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
        overlay = root.ownerDocument.win.createDiv();
        overlay.className = "marglow-overlay";
        overlay.setAttribute("aria-hidden", "true");
        host.append(overlay); this.overlays.set(host, overlay);
      }
      if (overlay.parentElement !== host) host.append(overlay);
      // A PDF page is a clipping boundary, even if children overflow during zoom.
      overlay.style.width = `${host === root ? host.scrollWidth : host.clientWidth}px`;
      overlay.style.height = `${host === root ? host.scrollHeight : host.clientHeight}px`;
      overlay.replaceChildren(...nodes);
    }
    this.located = located;
    if (this.activeId && this.activeId !== this.preview?.id && !annotations.some(annotation => annotation.id === this.activeId)) this.activeId = null;
    this.sidebar.render(this.entries.map(entry => entry.annotation).sort((a, b) => {
      const position = (annotation: Annotation) => annotation.anchor.kind === "markdown" ? annotation.anchor.textStart : annotation.anchor.segments[0]!.page;
      return Number(this.unlocated.has(a.id)) - Number(this.unlocated.has(b.id)) || position(a) - position(b);
    }), this.unlocated, "");
    this.emphasize(this.activeId, this.hoveredId);
    this.syncTextSelection();
    this.tools.dataset.error = "false";
    const label = `Reading notes · ${this.entries.length}${this.unlocated.size ? ` · ${this.unlocated.size} unlocated` : ""}`;
    this.notesButton.setAttribute("aria-label", label);
    if (this.mobile) {
      this.notesButton.replaceChildren(); setIcon(this.notesButton, "marglow");
      const count = this.notesButton.ownerDocument.win.createSpan();
      count.className = "marglow-notes-count"; count.textContent = String(this.entries.length);
      count.setAttribute("aria-hidden", "true"); this.notesButton.append(count);
    } else this.notesButton.textContent = label;
    this.syncSidebarVisibility();
  }

  private hits(x: number, y: number): LocatedAnnotation[] {
    if (this.source.type === "pdf") this.located = this.entries.map(entry => ({ annotation: entry.annotation, rects: this.adapter.locate(entry.annotation) ?? [] }));
    const icons = new Set<string>();
    for (const overlay of this.overlays.values()) for (const icon of overlay.querySelectorAll<HTMLElement>(".marglow-comment-indicator")) {
      const rect = icon.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) icons.add(icon.dataset.annotationId!);
    }
    return this.located.filter(item => icons.has(item.annotation.id) || item.rects.some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom));
  }

  private emphasize(active: string | null, hovered: string | null, reveal = false): void {
    this.activeId = active; this.hoveredId = hovered;
    for (const overlay of this.overlays.values()) for (const node of overlay.children) {
      const element = node as HTMLElement;
      element.classList.toggle("is-active", element.dataset.annotationId === active);
      element.classList.toggle("is-hovered", element.dataset.annotationId === hovered);
    }
    this.sidebar.emphasize(active, hovered, reveal);
    this.updatePageTools();
  }

  get sidebarElement(): HTMLElement { return this.sidebar.element; }

  syncSidebarVisibility(reveal = false): void {
    const visible = this.callbacks.isCommentsVisible(this);
    this.notesButton.setAttribute("aria-expanded", String(visible));
    this.notesButton.title = visible ? "Hide reading notes" : "Show reading notes";
    if (visible && reveal) this.sidebar.emphasize(this.activeId, this.hoveredId, true);
  }

  private async selectFromSidebar(annotation: Annotation, edit: boolean): Promise<void> {
    if (!await this.ui.finish() || this.disposed || this.suspended || this.error) return;
    const entry = this.entries.find(entry => entry.annotation.id === annotation.id);
    if (!entry) return;
    this.preview = null;
    this.adapter.root.ownerDocument.getSelection()?.removeAllRanges();
    this.emphasize(annotation.id, this.hoveredId, true);
    if (edit) {
      const host = this.sidebar.editorHost(annotation.id);
      const selection = { quote: entry.annotation.quote, anchor: entry.annotation.anchor, rect: (host ?? this.sidebar.element).getBoundingClientRect() };
      this.ui.showComment(selection, this.actions(selection, entry), entry.annotation, host);
      return;
    }
    const token = ++this.navigation;
    await this.callbacks.revealSource();
    const navigated = await this.adapter.scrollTo?.(entry.annotation) ?? false;
    if (this.disposed || this.suspended || token !== this.navigation) return;
    this.render();
    if (!navigated) this.callbacks.report(this.unlocated.has(annotation.id) ? "This annotation is unlocated. Reassociate it from Reading notes." : "The document viewer could not load this annotation location. Reopen the source and try again.");

  }

  dispose(): void {
    this.disposed = true;
    this.navigation++;
    this.version++;
    if (this.frame !== undefined) this.adapter.root.ownerDocument.defaultView!.cancelAnimationFrame(this.frame);
    window.clearTimeout(this.selectionTimer);
    this.abort.abort();
    this.observer.disconnect();
    this.resize.disconnect();
    this.ui.dispose();
    this.commentPreview.dispose();
    for (const overlay of this.overlays.values()) overlay.remove();
    this.overlays.clear();
    this.readingContainer?.classList.remove("marglow-reading-container");
    this.readingContainer?.style.removeProperty("--marglow-tools-height");
    this.tools.remove();
    this.sidebar.dispose();
    this.adapter.root.classList.remove("marglow-source");
    this.adapter.root.classList.remove("marglow-selecting");
    this.adapter.dispose();
  }

  suspend(): void {
    this.suspended = true;
    this.tools.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = true; });
    for (const overlay of this.overlays.values()) overlay.replaceChildren();
    this.located = [];
  }
}
