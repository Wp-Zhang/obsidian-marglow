import { addIcon, Component, FuzzySuggestModal, MarkdownRenderer, MarkdownView, Notice, Platform, Plugin, requireApiVersion, normalizePath, type TFile, View } from "obsidian";
import marglowIcon from "../assets/marglow-icon.svg";
import { AnnotationStore } from "./store";
import { isReadingNote, parseReadingNote, type Entry } from "./format";
import { MarkdownAdapter } from "./markdown-adapter";
import { PdfAdapter } from "./pdf-adapter";
import { AnnotationSession, type SessionCallbacks } from "./session";
import { CommentsView, COMMENTS_VIEW } from "./comments-view";
import type { Source } from "./model";
import type { Annotation } from "./model";
import { recordReference, upgradeReadingNote } from "./format-v2";
import { UpgradeNoteModal, ConfirmNoteRemoval, ReadingHomeModal } from "./note-modals";

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

class MissingRecordPicker extends FuzzySuggestModal<string> {
  constructor(plugin: MarglowPlugin, private ids: string[], private choose: (id: string) => void) { super(plugin.app); this.setPlaceholder("Choose a record whose body is missing"); }
  getItems(): string[] { return this.ids; }
  getItemText(id: string): string { return id; }
  onChooseItem(id: string): void { this.choose(id); }
}

export default class MarglowPlugin extends Plugin {
  private sourceRenames = new Set<{ oldPath: string; newPath: string }>();
  private commentsSource: View | null = null;
  private readingSource: Source | null = null;
  private store!: AnnotationStore;
  private mounted = new Map<View, Mounted>();
  private reconcileTimer: number | undefined;
  private epoch = 0;
  private running = false;
  private rerun = false;
  private stopped = false;
  private pending: { source: Source; entry: Entry } | null = null;
  private lastMessage = "";
  private lastMessageTime = 0;

  onload(): void {
    addIcon("marglow", marglowIcon);
    this.store = new AnnotationStore(this.app);
    this.registerView(COMMENTS_VIEW, leaf => new CommentsView(leaf, {
      store: this.store, report: message => this.report(message),
      openNote: source => this.openNote(source), upgrade: source => this.upgradeNote(source),
      copy: (source, id, thought) => this.copyReference(source, id, thought),
      navigate: (source, annotation) => this.navigateAnnotation(source, annotation),
      removeMissing: source => this.reviewMissing(source),
      hasSource: source => !!this.app.vault.getFileByPath(source.path),
    }));
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
        await new Promise(resolve => window.setTimeout(resolve, 120));
        if (!this.stopped) await this.store.renameSource(oldPath, newPath);
      })().catch(error => this.report(error instanceof Error ? error.message : String(error))).finally(() => { this.sourceRenames.delete(operation); this.schedule(); });
    }));
    this.addCommand({ id: "open-reading-note", name: "Open reading notes", callback: () => { void this.openCurrentNote().catch(error => this.report(String(error))); } });
    this.addCommand({ id: "create-reading-note", name: "Create reading note", callback: () => { void this.createCurrentNote().catch(error => this.report(String(error))); } });
    this.addCommand({ id: "add-thought", name: "Add whole-material thought", callback: () => { void this.addCurrentThought().catch(error => this.report(String(error))); } });
    this.addCommand({ id: "upgrade-reading-note", name: "Upgrade reading note format", callback: () => { void this.sourceForCurrentFile().then(source => source ? this.upgradeNote(source) : undefined).catch(error => this.report(String(error))); } });
    this.addCommand({ id: "review-missing-records", name: "Review missing reading records", callback: () => { void this.reviewMissing().catch(error => this.report(String(error))); } });
    this.addCommand({ id: "create-reading-home", name: "Create reading home", callback: () => { new ReadingHomeModal(this.app, requireApiVersion("1.9.0"), (path, bases) => this.createReadingHome(path, bases)).open(); } });
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, info) => {
      const file = info.file;
      if (!file || !this.app.metadataCache.getFileCache(file)?.frontmatter?.annotation_schema) return;
      menu.addItem(item => item.setTitle("Copy record reference").setIcon("link").onClick(() => {
        void (async () => {
          const text = await this.app.vault.read(file), note = parseReadingNote(text);
          const offset = editor.posToOffset(editor.getCursor());
          const entry = note.entries.find(candidate => candidate.ranges?.some(range => offset >= range.start && offset <= range.end) || (note.version === 1 && offset >= candidate.start && offset <= candidate.end));
          const thought = note.thoughts.find(candidate => candidate.ranges.some(range => offset >= range.start && offset <= range.end));
          if (!entry && !thought) throw new Error("Place the cursor inside a saved quotation, comment, or thought first.");
          await this.copyReference(note.source, entry?.annotation.id ?? thought!.thought.id, !!thought);
        })().catch(error => this.report(String(error)));
      }));
    }));
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
    window.clearTimeout(this.reconcileTimer);
    this.reconcileTimer = window.setTimeout(() => { void this.reconcile(); }, 80);
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
            const rendered = candidate.root.ownerDocument.win.createDiv();
            await MarkdownRenderer.render(this.app, source, rendered, candidate.file.path, owner);
            adapter = new MarkdownAdapter(candidate.root, rendered, (view as MarkdownView).previewMode);
          } else {
            const bytes = await this.app.vault.readBinary(candidate.file);
            const digest = await crypto.subtle.digest("SHA-256", bytes);
            const fingerprint = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
            adapter = new PdfAdapter(candidate.root, view, fingerprint);
          }
          if (this.stopped || epoch !== this.epoch || !candidate.root.isConnected) { this.removeChild(owner); continue; }
          const callbacks: SessionCallbacks = {
            isActive: () => {
              const active = this.app.workspace.getActiveViewOfType(View);
              return active === view || (active?.getViewType() === COMMENTS_VIEW && this.commentsSource === view);
            },
            toggleComments: session => this.toggleComments(session),
            isCommentsVisible: session => this.commentsVisible(session),
            revealSource: () => this.app.workspace.revealLeaf(view.leaf),
            report: message => this.report(message),
            cancelReassociation: () => { this.pending = null; },
            onUiClosed: () => this.schedule(),
            copyReference: annotation => this.copyReference(candidate.source, annotation.id, false),
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
      await this.syncComments();
    } finally {
      this.running = false;
      if (this.rerun || epoch !== this.epoch) { this.rerun = false; this.schedule(); }
    }
  }

  private async syncComments(): Promise<void> {
    const active = this.app.workspace.getActiveViewOfType(View);
    // Focusing the comments tab must retain its source document association.
    const root = active?.leaf.getRoot();
    if (active?.getViewType() !== COMMENTS_VIEW && root !== this.app.workspace.rightSplit && root !== this.app.workspace.leftSplit) {
      this.commentsSource = active ?? null;
      try { this.readingSource = await this.sourceForCurrentFile(); }
      catch {
        const file = this.app.workspace.getActiveFile(), metadata = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : null;
        const link: unknown = metadata?.annotation_source, type: unknown = metadata?.annotation_source_type;
        this.readingSource = typeof link === "string" && link.startsWith("[[") && link.endsWith("]]") && (type === "markdown" || type === "pdf") ? { path: link.slice(2, -2), type } : null;
      }
    }
    const session = (this.commentsSource ? this.mounted.get(this.commentsSource)?.session : null) ?? [...this.mounted.values()].find(item => item.session.source.path === this.readingSource?.path)?.session ?? null;
    for (const leaf of this.app.workspace.getLeavesOfType(COMMENTS_VIEW)) {
      if (leaf.view instanceof CommentsView) await leaf.view.setContext(this.readingSource, session);
    }
    for (const mounted of this.mounted.values()) mounted.session.syncSidebarVisibility();
  }

  private commentsVisible(session: AnnotationSession): boolean {
    return this.app.workspace.getLeavesOfType(COMMENTS_VIEW).some(leaf => {
      const root = leaf.getRoot();
      if (root === this.app.workspace.rightSplit && this.app.workspace.rightSplit.collapsed) return false;
      if (root === this.app.workspace.leftSplit && this.app.workspace.leftSplit.collapsed) return false;
      return leaf.view instanceof CommentsView && leaf.view.contentEl.contains(session.sidebarElement) && leaf.view.containerEl.isShown();
    });
  }

  private async toggleComments(session: AnnotationSession): Promise<void> {
    if (!await session.ui.finish()) return;
    if (!this.commentsVisible(session)) { await this.openComments(session); return; }
    const leaf = this.app.workspace.getLeavesOfType(COMMENTS_VIEW).find(leaf => leaf.view instanceof CommentsView && leaf.view.contentEl.contains(session.sidebarElement));
    if (!leaf) return;
    const root = leaf.getRoot();
    if (root === this.app.workspace.rightSplit) this.app.workspace.rightSplit.collapse();
    else if (root === this.app.workspace.leftSplit) this.app.workspace.leftSplit.collapse();
    else leaf.detach();
    const source = [...this.mounted].find(([, mounted]) => mounted.session === session)?.[0];
    if (source) await this.app.workspace.revealLeaf(source.leaf);
    session.syncSidebarVisibility();
  }

  private async openComments(session?: AnnotationSession): Promise<CommentsView | null> {
    const active = this.app.workspace.getActiveViewOfType(View);
    const target = session ?? (active?.getViewType() === COMMENTS_VIEW ? (this.commentsSource ? this.mounted.get(this.commentsSource)?.session : undefined) : (active ? this.mounted.get(active)?.session : undefined));
    if (target && !await target.ui.finish()) return null;
    if (target) this.commentsSource = [...this.mounted].find(([, mounted]) => mounted.session === target)?.[0] ?? null;
    const source = target?.source ?? await this.sourceForCurrentFile() ?? this.readingSource;
    this.readingSource = source;
    const existing = this.app.workspace.getLeavesOfType(COMMENTS_VIEW)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return null;
    if (!existing) await leaf.setViewState({ type: COMMENTS_VIEW, active: true });
    if (leaf.view instanceof CommentsView) {
      if (!await leaf.view.setContext(source, target ?? [...this.mounted.values()].find(item => item.session.source.path === source?.path)?.session ?? null)) return null;
    }
    await this.app.workspace.revealLeaf(leaf);
    target?.syncSidebarVisibility(true);
    return leaf.view instanceof CommentsView ? leaf.view : null;
  }

  private async sourceForCurrentFile(): Promise<Source | null> {
    const active = this.app.workspace.getActiveViewOfType(View);
    if (active instanceof CommentsView) return active.panel.context;
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
    const file = this.store.findFile(source);
    if (!file) { this.report("Add a thought or annotation, or use Create reading note first."); return; }
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  private async createCurrentNote(): Promise<void> {
    const source = await this.sourceForCurrentFile();
    if (!source) return;
    const file = await this.store.create(source);
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  private async createReadingHome(path: string, bases: boolean): Promise<void> {
    if (!path.trim() || path.startsWith("/") || path.split(/[\\/]/).some(part => part === "..") || !path.endsWith(".md")) throw new Error("Choose a relative Markdown note path inside this Vault.");
    const normalized = normalizePath(path.trim());
    if (this.app.vault.getAbstractFileByPath(normalized)) throw new Error("That path is occupied. Choose another name; the existing file will be preserved.");
    const parent = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
    if (parent && !this.app.vault.getAbstractFileByPath(parent)) await this.app.vault.createFolder(parent);
    const table = '```base\nfilters:\n  and:\n    - "annotation_schema != null"\nformulas:\n  material: "if(marglow_title, marglow_title, file.name)"\nproperties:\n  formula.material:\n    displayName: Material\n  annotation_source:\n    displayName: Source\n  marglow_status:\n    displayName: Status\n  file.mtime:\n    displayName: Modified\nviews:\n  - type: table\n    name: All\n    order: [formula.material, annotation_source, marglow_status, file.mtime]\n  - type: table\n    name: Reading\n    filters: \'marglow_status == "reading"\'\n    order: [formula.material, annotation_source, marglow_status, file.mtime]\n  - type: table\n    name: Read\n    filters: \'marglow_status == "read"\'\n    order: [formula.material, annotation_source, marglow_status, file.mtime]\n```';
    const query = '```query\n[annotation_schema]\n```';
    const content = `# Reading\n\nAdd links to your Inbox and current question notes here.\n\n## Reading notes\n\n${bases ? table : query}\n\nModified times describe file edits, not reading dates.\n`;
    const file = await this.app.vault.create(normalized, content);
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  private async addCurrentThought(): Promise<void> {
    const view = await this.openComments();
    await view?.panel.addThought();
  }

  private async upgradeNote(source: Source): Promise<void> {
    for (const mounted of this.mounted.values()) if (mounted.session.source.path === source.path && !await mounted.session.ui.finish()) return;
    for (const leaf of this.app.workspace.getLeavesOfType(COMMENTS_VIEW)) if (leaf.view instanceof CommentsView && leaf.view.panel.context?.path === source.path && !await leaf.view.panel.finish()) return;
    const { file, note } = await this.store.load(source);
    if (!file || !note) { this.report("Create a reading note first."); return; }
    if (note.version === 2) { this.report("This reading note already uses the new format."); return; }
    const original = await this.app.vault.read(file), converted = upgradeReadingNote(original);
    new UpgradeNoteModal(this.app, original, converted, note.entries.length, async () => {
      const backup = await this.store.upgrade(file, original, converted);
      this.report(`Reading note upgraded. Original backup: ${backup.path}`);
      for (const mounted of this.mounted.values()) void mounted.session.refresh();
      this.schedule();
    }).open();
  }

  private async copyReference(source: Source, id: string, thought: boolean): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(COMMENTS_VIEW)) if (leaf.view instanceof CommentsView && !await leaf.view.panel.finish()) throw new Error("Finish saving the current input before copying a reference.");
    const { file, note } = await this.store.load(source);
    const entry = thought ? note?.thoughts.find(item => item.thought.id === id)?.thought : note?.entries.find(item => item.annotation.id === id)?.annotation;
    if (!file || !note || !entry) throw new Error("This saved record no longer exists. Refresh the reading note.");
    const reference = recordReference(file.path, note.source, entry);
    const document = this.app.workspace.getActiveViewOfType(View)?.containerEl.ownerDocument ?? window.document;
    await document.defaultView!.navigator.clipboard.writeText(reference);
    this.report("Reference copied. Paste it into your note.");
  }

  private async navigateAnnotation(source: Source, annotation: Annotation): Promise<void> {
    const file = this.app.vault.getFileByPath(source.path);
    if (!file) throw new Error("The source document is missing. The reading record has been retained.");
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { state: { mode: "preview" } });
    this.schedule();
    for (let attempt = 0; attempt < 60; attempt++) {
      const session = this.mounted.get(leaf.view)?.session;
      if (session) { await session.refresh(); await session.navigateTo(annotation); return; }
      await new Promise(resolve => window.setTimeout(resolve, 50));
    }
    throw new Error("The source view could not load. Reopen it and try again.");
  }

  private async reviewMissing(source?: Source): Promise<void> {
    let file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md" || !isReadingNote(await this.app.vault.read(file))) {
      source ??= await this.sourceForCurrentFile() ?? undefined;
      if (!source) return;
      file = this.store.findFile(source);
      if (!file) throw new Error("Open the reading note file before reviewing missing records.");
    }
    const selected = file, note = parseReadingNote(await this.app.vault.read(file), true);
    if (!note.missing.length) { this.report("There are no missing reading records."); return; }
    new MissingRecordPicker(this, note.missing.map(item => item.id), id => {
      const record = note.missing.find(item => item.id === id)!;
      new ConfirmNoteRemoval(this.app, id, async () => { await this.store.removeMissing(selected, id, record.raw, note.documentId); this.schedule(); }).open();
    }).open();
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
    window.clearTimeout(this.reconcileTimer);
    for (const mounted of this.mounted.values()) { mounted.session.ui.close(); mounted.session.dispose(); }
    this.mounted.clear();
  }
}
