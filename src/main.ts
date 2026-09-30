import { Component, FuzzySuggestModal, MarkdownRenderer, MarkdownView, Notice, Platform, Plugin, type TFile, type View } from "obsidian";
import { AnnotationStore, readingNotePath } from "./store";
import { isReadingNote, parseReadingNote, type Entry } from "./format";
import { MarkdownAdapter } from "./markdown-adapter";
import { PdfAdapter } from "./pdf-adapter";
import { AnnotationSession, type SessionCallbacks } from "./session";
import { CommentsView, COMMENTS_VIEW } from "./comments-view";
import type { Source } from "./model";

interface Mounted {
  session: AnnotationSession;
  owner: Component;
  revision: string;
}

class AnnotationPicker extends FuzzySuggestModal<Entry> {
  constructor(plugin: MarglowPlugin, private entries: Entry[], private select: (entry: Entry) => void) {
    super(plugin.app);
    this.setPlaceholder("Choose the annotation to reassociate");
  }
  getItems(): Entry[] { return this.entries; }
  getItemText(entry: Entry): string { return `${entry.annotation.quote} ${entry.annotation.comment}`; }
  onChooseItem(entry: Entry): void { this.select(entry); }
}

class SourcePicker extends FuzzySuggestModal<TFile> {
  constructor(plugin: MarglowPlugin, private files: TFile[], private select: (file: TFile) => void) {
    super(plugin.app);
    this.setPlaceholder("Choose the replacement source document");
  }
  getItems(): TFile[] { return this.files; }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.select(file); }
}

export default class MarglowPlugin extends Plugin {
  private sourceRenames = new Set<{ oldPath: string; newPath: string }>();
  private commentsSource: View | null = null;
  private store!: AnnotationStore;
  private mounted = new Map<View, Mounted>();
  private reconcileTimer: ReturnType<typeof setTimeout> | undefined;
  private epoch = 0;
  private running = false;
  private rerun = false;
  private stopped = false;
  private pending: { source: Source; entry: Entry } | null = null;
  private lastMessage = "";
  private lastMessageTime = 0;

  onload(): void {
    this.store = new AnnotationStore(this.app);
    this.registerView(COMMENTS_VIEW, leaf => new CommentsView(leaf));
    this.addCommand({ id: "open-comments", name: "Open comments sidebar", callback: () => { void this.openComments().catch(error => this.report(String(error))); } });
    const schedule = () => this.schedule();
    this.registerEvent(this.app.workspace.on("layout-change", schedule));
    this.registerEvent(this.app.workspace.on("active-leaf-change", schedule));
    this.registerEvent(this.app.workspace.on("file-open", schedule));
    this.registerEvent(this.app.vault.on("modify", file => {
      if ("extension" in file && (file.extension === "md" || file.extension === "pdf")) {
        for (const mounted of this.mounted.values()) void mounted.session.refresh();
        this.schedule();
      }
    }));
    this.registerEvent(this.app.vault.on("create", () => { for (const mounted of this.mounted.values()) void mounted.session.refresh(); }));
    this.registerEvent(this.app.vault.on("delete", () => { for (const mounted of this.mounted.values()) void mounted.session.refresh(); this.schedule(); }));
    this.registerEvent(this.app.metadataCache.on("changed", () => { for (const mounted of this.mounted.values()) void mounted.session.refresh(); }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      for (const mounted of this.mounted.values()) {
        if (mounted.session.source.path === oldPath || mounted.session.source.path.startsWith(`${oldPath}/`)) mounted.session.suspend();
      }
      const newPath = file.path;
      const operation = { oldPath, newPath };
      this.sourceRenames.add(operation);
      // Folder moves emit rename events before all child paths and link updates settle.
      void (async () => {
        await new Promise(resolve => setTimeout(resolve, 120));
        if (!this.stopped) await this.store.renameSource(oldPath, newPath);
      })().catch(error => this.report(error instanceof Error ? error.message : String(error))).finally(() => { this.sourceRenames.delete(operation); this.schedule(); });
    }));
    this.addCommand({ id: "open-reading-note", name: "Open reading notes", callback: () => { void this.openCurrentNote().catch(error => this.report(String(error))); } });
    this.addCommand({ id: "open-source", name: "Open source document", callback: () => { void this.openSource().catch(error => this.report(String(error))); } });
    this.addCommand({ id: "reassociate-annotation", name: "Reassociate an annotation", callback: () => { void this.pickReassociation().catch(error => this.report(String(error))); } });
    this.addCommand({ id: "cancel-reassociation", name: "Cancel reassociation", callback: () => { this.pending = null; this.report("Reassociation cancelled."); } });
    this.addCommand({ id: "relink-source", name: "Relink reading notes to a source document", callback: () => { void this.pickSource().catch(error => this.report(String(error))); } });
    this.app.workspace.onLayoutReady(schedule);
  }

  private report(message: string): void {
    if (message === this.lastMessage && Date.now() - this.lastMessageTime < 3000) return;
    this.lastMessage = message;
    this.lastMessageTime = Date.now();
    new Notice(`Marglow: ${message}`, 7000);
  }

  private schedule(): void {
    if (this.stopped) return;
    this.epoch++;
    clearTimeout(this.reconcileTimer);
    this.reconcileTimer = setTimeout(() => { void this.reconcile(); }, 80);
  }

  private async reconcile(): Promise<void> {
    if (this.running) { this.rerun = true; return; }
    this.running = true;
    const epoch = this.epoch;
    try {
      const views = [...this.app.workspace.getLeavesOfType("markdown"), ...this.app.workspace.getLeavesOfType("pdf")].map(leaf => leaf.view);
      const candidates = new Map<View, { file: TFile; root: HTMLElement; source: Source; revision: string }>();
      for (const view of views) {
        const file = (view as View & { file?: TFile }).file;
        if (!file || !this.app.vault.getFileByPath(file.path)) continue;
        if ([...this.sourceRenames].some(rename => [rename.oldPath, rename.newPath].some(path => file.path === path || file.path.startsWith(`${path}/`)))) continue;
        const type = file.extension === "pdf" ? "pdf" : file.extension === "md" ? "markdown" : null;
        if (!type || type === "markdown" && (!(view instanceof MarkdownView) || view.getMode() !== "preview")) continue;
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (frontmatter?.annotation_schema) continue;
        const root = type === "markdown" ? view.containerEl.querySelector<HTMLElement>(".markdown-preview-view") : view.containerEl.querySelector<HTMLElement>(".view-content");
        if (!root) continue;
        candidates.set(view, { file, root, source: { path: file.path, type }, revision: `${file.path}:${file.stat.mtime}:${file.stat.size}` });
      }
      for (const [view, mounted] of this.mounted) {
        const candidate = candidates.get(view);
        if (candidate && candidate.revision === mounted.revision && candidate.root === mounted.session.adapter.root) continue;
        mounted.session.suspend();
        if (!await mounted.session.ui.finish()) continue;
        mounted.session.dispose();
        this.removeChild(mounted.owner);
        this.mounted.delete(view);
      }
      for (const [view, candidate] of candidates) {
        if (this.mounted.has(view) || this.stopped || epoch !== this.epoch) continue;
        const owner = new Component();
        this.addChild(owner);
        try {
          let adapter: MarkdownAdapter | PdfAdapter;
          if (candidate.source.type === "markdown") {
            const source = await this.app.vault.read(candidate.file);
            if (isReadingNote(source)) { this.removeChild(owner); continue; }
            const rendered = candidate.root.ownerDocument.createElement("div");
            await MarkdownRenderer.render(this.app, source, rendered, candidate.file.path, owner);
            adapter = new MarkdownAdapter(candidate.root, rendered);
          } else {
            const bytes = await this.app.vault.readBinary(candidate.file);
            const digest = await crypto.subtle.digest("SHA-256", bytes);
            const fingerprint = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
            adapter = new PdfAdapter(candidate.root, view, fingerprint);
          }
          if (this.stopped || epoch !== this.epoch || !candidate.root.isConnected) { this.removeChild(owner); continue; }
          const callbacks: SessionCallbacks = {
            isActive: () => this.app.workspace.activeLeaf?.view === view || (this.app.workspace.activeLeaf?.view.getViewType() === COMMENTS_VIEW && this.commentsSource === view),
            openComments: session => { void this.openComments(session).catch(error => this.report(String(error))); },
            report: message => this.report(message),
            openNote: source => this.openNote(source),
            cancelReassociation: () => { this.pending = null; },
            onUiClosed: () => this.schedule(),
            isReassociating: () => this.pending?.source.path === candidate.source.path,
            reassociate: async selection => {
              if (!this.pending || this.pending.source.path !== candidate.source.path) throw new Error("Reassociation was cancelled.");
              const pending = this.pending;
              await this.store.save(pending.source, { ...pending.entry.annotation, quote: selection.quote, anchor: selection.anchor, updatedAt: new Date().toISOString() }, pending.entry.raw);
              this.pending = null;
              candidate.root.ownerDocument.getSelection()?.removeAllRanges();
              await this.mounted.get(view)?.session.refresh();
            },
          };
          const session = new AnnotationSession(candidate.source, adapter, this.store, Platform.isMobile, callbacks);
          this.mounted.set(view, { session, owner, revision: candidate.revision });
        } catch (error) {
          this.removeChild(owner);
          this.report(error instanceof Error ? error.message : String(error));
        }
      }
      this.syncComments();
    } finally {
      this.running = false;
      if (this.rerun || epoch !== this.epoch) { this.rerun = false; this.schedule(); }
    }
  }

  private syncComments(): void {
    const active = this.app.workspace.activeLeaf?.view;
    // Focusing the comments tab must retain its source document association.
    const root = this.app.workspace.activeLeaf?.getRoot();
    if (active?.getViewType() !== COMMENTS_VIEW && root !== this.app.workspace.rightSplit && root !== this.app.workspace.leftSplit) this.commentsSource = active ?? null;
    const session = this.commentsSource ? this.mounted.get(this.commentsSource)?.session ?? null : null;
    for (const leaf of this.app.workspace.getLeavesOfType(COMMENTS_VIEW)) {
      if (leaf.view instanceof CommentsView) leaf.view.setSession(session);
    }
  }

  private async openComments(session?: AnnotationSession): Promise<void> {
    const active = this.app.workspace.activeLeaf?.view;
    const target = session ?? (active?.getViewType() === COMMENTS_VIEW ? (this.commentsSource ? this.mounted.get(this.commentsSource)?.session : undefined) : (active ? this.mounted.get(active)?.session : undefined));
    if (target) this.commentsSource = [...this.mounted].find(([, mounted]) => mounted.session === target)?.[0] ?? null;
    const existing = this.app.workspace.getLeavesOfType(COMMENTS_VIEW)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!existing) await leaf.setViewState({ type: COMMENTS_VIEW, active: true });
    if (leaf.view instanceof CommentsView) {
      leaf.view.setSession(target ?? null);
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  private async sourceForCurrentFile(): Promise<Source | null> {
    const file = this.app.workspace.getActiveFile();
    if (!file) return null;
    if (file.extension === "pdf") return { path: file.path, type: "pdf" };
    if (file.extension !== "md") return null;
    const text = await this.app.vault.read(file);
    return isReadingNote(text) ? (await this.store.readNote(file)).source : { path: file.path, type: "markdown" };
  }

  private async openCurrentNote(): Promise<void> {
    const source = await this.sourceForCurrentFile();
    if (source) await this.openNote(source);
  }

  private async openNote(source: Source): Promise<void> {
    // Opening a damaged default note should remain possible so users can repair it.
    const defaultFile = this.app.vault.getFileByPath(readingNotePath(source.path)) ?? this.app.vault.getFileByPath(`${source.path}.annotations.md`);
    const file = defaultFile ?? (await this.store.load(source)).file;
    if (!file) { this.report("Create a highlight or comment first to start reading notes."); return; }
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  private async openSource(): Promise<void> {
    const source = await this.sourceForCurrentFile();
    if (!source) return;
    const file = this.app.vault.getFileByPath(source.path);
    if (!file) { this.report("The source document is missing. Your reading note has been retained."); return; }
    await this.app.workspace.getLeaf("tab").openFile(file, { state: { mode: "preview" } });
  }

  private async pickReassociation(): Promise<void> {
    const source = await this.sourceForCurrentFile();
    if (!source) return;
    const { note } = await this.store.load(source);
    if (!note?.entries.length) { this.report("There are no annotations to reassociate."); return; }
    const file = this.app.vault.getFileByPath(source.path);
    if (!file) { this.report("The source document is missing. Restore it before reassociating an annotation."); return; }
    new AnnotationPicker(this, note.entries, entry => {
      this.pending = { source, entry };
      void this.app.workspace.getLeaf(false).openFile(file, { state: { mode: "preview" } }).then(() => this.report("Select replacement text, then press Reassociate."));
    }).open();
  }

  private async pickSource(): Promise<void> {
    const noteFile = this.app.workspace.getActiveFile();
    if (!noteFile || noteFile.extension !== "md") return;
    const text = await this.app.vault.read(noteFile);
    if (!isReadingNote(text)) { this.report("Open the reading note you want to relink first."); return; }
    const note = parseReadingNote(text);
    const extension = note.source.type === "pdf" ? "pdf" : "md";
    const files = this.app.vault.getFiles().filter(file => file.extension === extension && !this.app.metadataCache.getFileCache(file)?.frontmatter?.annotation_schema);
    new SourcePicker(this, files, file => {
      void this.store.relink(noteFile, { path: file.path, type: note.source.type }).then(() => this.report("Source link updated. Reassociate any unlocated annotations as needed.")).catch(error => this.report(String(error)));
    }).open();
  }

  onunload(): void {
    this.stopped = true;
    this.epoch++;
    clearTimeout(this.reconcileTimer);
    for (const mounted of this.mounted.values()) { mounted.session.ui.close(); mounted.session.dispose(); }
    this.mounted.clear();
    this.app.workspace.detachLeavesOfType(COMMENTS_VIEW);
  }
}
