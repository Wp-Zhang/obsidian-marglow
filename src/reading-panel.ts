import { Platform, type TFile } from "obsidian";
import { AnnotationUI } from "./ui";
import { AnnotationSidebar } from "./sidebar";
import { type Annotation, type Source, createThought } from "./model";
import { type ReadingNote, type ThoughtEntry } from "./format";
import { AnnotationStore } from "./store";
import type { AnnotationSession } from "./session";
import { labelIconButton } from "./action-icons";

export interface ReadingPanelActions {
  store: AnnotationStore;
  report(this: void, message: string): void;
  openNote(this: void, source: Source): Promise<void>;
  upgrade(this: void, source: Source): Promise<void>;
  copy(this: void, source: Source, id: string, thought: boolean): Promise<void>;
  navigate(this: void, source: Source, annotation: Annotation): Promise<void>;
  removeMissing(this: void, source: Source): Promise<void>;
  hasSource(this: void, source: Source): boolean;
}

/** A note context also works when no document adapter is mounted or the source is missing. */
export class ReadingPanel {
  private source: Source | null = null;
  private session: AnnotationSession | null = null;
  private ui: AnnotationUI | null = null;
  private ownsUi = false;
  private note: ReadingNote | null = null;
  private file: TFile | null = null;
  private epoch = 0;
  private showAll = false;
  private signature = "";
  private disposed = false;
  private localSidebar: AnnotationSidebar | null = null;

  constructor(private element: HTMLElement, private actions: ReadingPanelActions) {}
  get context(): Source | null { return this.source ? { ...this.source } : null; }

  async setContext(source: Source | null, session: AnnotationSession | null): Promise<boolean> {
    if (this.disposed) return false;
    if (this.source?.path === source?.path && this.session === session) { await this.refresh(); return true; }
    if (this.ui && !await this.ui.finish()) return false;
    if (this.ownsUi) this.ui?.dispose();
    this.localSidebar?.dispose(); this.localSidebar = null;
    this.source = source ? { ...source } : null; this.session = session; this.showAll = false; this.signature = "";
    this.ownsUi = !session;
    this.ui = source ? session?.ui ?? new AnnotationUI(this.element.ownerDocument, Platform.isMobile, this.actions.report, () => { this.element.ownerDocument.defaultView!.setTimeout(() => { void this.refresh(); }, 0); }) : null;
    await this.refresh();
    return true;
  }

  async refresh(): Promise<void> {
    if (this.disposed) return;
    if (this.ui?.hasDraft || this.ui?.isBusy) return;
    const epoch = ++this.epoch, source = this.source;
    if (!source) {
      this.element.replaceChildren();
      const hint = this.element.ownerDocument.win.createEl("p"); hint.className = "marglow-comments-idle";
      hint.textContent = "Open a Markdown document, PDF, or reading note."; this.element.append(hint); return;
    }
    try {
      const loaded = await this.actions.store.load(source);
      if (epoch !== this.epoch || this.ui?.hasDraft) return;
      this.note = loaded.note; this.file = loaded.file;
      const signature = JSON.stringify([loaded.file?.path, loaded.note?.version, loaded.note?.documentId, loaded.note?.title, loaded.note?.status, loaded.note?.hasFreeNotes, this.actions.hasSource(source), loaded.note?.entries.map(entry => entry.raw), loaded.note?.thoughts.map(entry => entry.raw)]);
      if (signature !== this.signature) { this.signature = signature; this.render(); }
    } catch (error) {
      if (epoch !== this.epoch || this.ui?.hasDraft) return;
      this.signature = "";
      this.element.replaceChildren();
      const document = this.element.ownerDocument;
      const status = document.win.createEl("p"); status.className = "marglow-sidebar-status";
      status.textContent = String(error instanceof Error ? error.message : error); this.element.append(status);
      this.button(this.element, "Open reading note to repair", () => this.actions.openNote(source));
      this.button(this.element, "Review missing records", () => this.actions.removeMissing(source));
      if (this.session) this.element.append(this.session.sidebarElement);
    }
  }

  private button(parent: HTMLElement, text: string, action: () => void | Promise<void>): HTMLButtonElement {
    const button = parent.ownerDocument.win.createEl("button"); button.type = "button"; button.textContent = text;
    button.addEventListener("click", () => { void Promise.resolve().then(action).catch(error => this.actions.report(String(error instanceof Error ? error.message : error))); });
    parent.append(button); return button;
  }

  private render(): void {
    const source = this.source!;
    const document = this.element.ownerDocument;
    this.element.replaceChildren(); this.element.classList.toggle("marglow-mobile", Platform.isMobile);
    const header = document.win.createDiv(); header.className = "marglow-reading-header";
    const title = document.win.createEl("strong"); title.textContent = this.note?.title || source.path.split("/").pop()!.replace(/\.(md|pdf)$/i, ""); title.title = source.path;
    header.append(title);
    const openLabel = this.file ? "Open complete note" : "Create reading note";
    const open = this.button(header, openLabel, async () => { if (!this.file) await this.actions.store.create(source); await this.actions.openNote(source); });
    labelIconButton(open, openLabel, "open-note");
    const folder = source.path.includes("/") ? source.path.slice(0, source.path.lastIndexOf("/")) : "";
    if (folder) { const path = document.win.createEl("p"); path.className = "marglow-comments-source-folder"; path.textContent = folder; path.title = source.path; header.append(path); }
    if (!this.actions.hasSource(source)) { const missing = document.win.createEl("p"); missing.className = "marglow-sidebar-status"; missing.textContent = "Source missing. Your reading note has been retained."; header.append(missing); }
    const meta = document.win.createDiv(); meta.className = "marglow-reading-meta";
    const status = document.win.createEl("select"); status.setAttribute("aria-label", "Reading status"); status.title = "Reading status";
    for (const [value, label] of [["", "Set status"], ["reading", "Reading"], ["read", "Read"], ...(![undefined, "", "reading", "read"].includes(this.note?.status) ? [[this.note!.status!, `Unrecognized: ${this.note!.status!}`]] : [])]) {
      const option = document.win.createEl("option"); option.value = value!; option.textContent = label!; status.append(option);
    }
    status.value = this.note?.status ?? "";
    status.dataset.status = status.value;
    const expected = this.note ? { documentId: this.note.documentId, status: this.note.status } : undefined;
    status.addEventListener("change", () => {
      const value = status.value;
      if (value !== "" && value !== "reading" && value !== "read") return;
      status.disabled = true;
      void (async () => { if (!await this.ui!.finish()) { status.value = this.note?.status ?? ""; return; } await this.actions.store.setStatus(source, value, expected); await this.refresh(); })().catch(error => { status.value = this.note?.status ?? ""; this.actions.report(String(error)); }).finally(() => { status.disabled = false; });
    });
    meta.append(status); header.append(meta);
    if (this.note?.hasFreeNotes) { const hint = this.button(meta, "Personal notes", () => this.actions.openNote(source)); hint.className = "marglow-text-action"; hint.title = "Open your free writing in the complete note"; }
    if (this.note?.version === 1) this.button(header, "Upgrade reading note", () => this.actions.upgrade(source)).className = "marglow-upgrade-action marglow-text-action";
    this.element.append(header);
    const thoughts = document.win.createDiv(); thoughts.className = "marglow-thought-section";
    const controls = document.win.createDiv(); controls.className = "marglow-sidebar-header";
    const label = document.win.createEl("strong"); label.textContent = "Thoughts"; controls.append(label);
    const count = document.win.createSpan(); count.className = "marglow-section-count"; count.textContent = String(this.note?.thoughts.length ?? 0); controls.append(count);
    const add = this.button(controls, "Add thought", () => this.addThought()); labelIconButton(add, "Add thought", "plus"); thoughts.append(controls);
    const list = document.win.createDiv(); list.className = "marglow-thought-list"; thoughts.append(list);
    const entries = [...(this.note?.thoughts ?? [])].sort((a, b) => Date.parse(b.thought.createdAt) - Date.parse(a.thought.createdAt));
    for (const entry of this.showAll ? entries : entries.slice(0, 2)) {
      const card = document.win.createEl("article"); card.className = "marglow-thought-card"; card.dataset.thoughtId = entry.thought.id;
      const date = document.win.createEl("time"); date.className = "marglow-comment-time"; date.dateTime = entry.thought.createdAt; date.textContent = new Date(entry.thought.createdAt).toLocaleString(undefined, { ...(new Date(entry.thought.createdAt).getFullYear() !== new Date().getFullYear() ? { year: "numeric" as const } : {}), month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); date.title = new Date(entry.thought.createdAt).toLocaleString();
      const content = this.button(card, entry.thought.text, () => this.editThought(entry, card)); content.className = "marglow-thought-text";
      const footer = document.win.createDiv(); footer.className = "marglow-record-footer";
      const buttons = document.win.createDiv(); buttons.className = "marglow-record-actions";
      labelIconButton(this.button(buttons, "Copy reference", () => this.actions.copy(source, entry.thought.id, true)), "Copy reference", "copy");
      const remove = this.button(buttons, "Delete thought", async () => {
        if (!await this.ui!.finish()) return;
        await this.actions.store.removeThought(source, entry.thought.id, entry.raw, this.note!.documentId); await this.refresh();
      });
      labelIconButton(remove, "Delete thought", "delete"); remove.classList.add("marglow-comment-delete");
      footer.append(date, buttons); card.append(footer); list.append(card);
    }
    if (entries.length > 2) this.button(list, this.showAll ? "Show recent thoughts" : "Show all thoughts", () => { this.showAll = !this.showAll; this.render(); }).className = "marglow-text-action";
    this.element.append(thoughts);
    if (this.session) this.element.append(this.session.sidebarElement);
    else {
      this.localSidebar?.dispose();
      this.localSidebar = new AnnotationSidebar(document, (annotation, edit) => {
        if (edit) void this.editComment(annotation).catch(error => this.actions.report(String(error)));
        else void this.actions.navigate(source, annotation).catch(error => this.actions.report(String(error)));
      }, () => {}, annotation => {
        void (async () => { if (!await this.ui!.finish()) return; const entry = this.note!.entries.find(item => item.annotation.id === annotation.id)!; await this.actions.store.remove(source, annotation.id, entry.raw); await this.refresh(); })().catch(error => this.actions.report(String(error)));
      }, annotation => { void this.actions.copy(source, annotation.id, false).catch(error => this.actions.report(String(error))); });
      this.localSidebar.element.classList.toggle("marglow-mobile", Platform.isMobile);
      this.localSidebar.render(this.note?.entries.map(entry => entry.annotation) ?? [], new Set(), "");
      this.element.append(this.localSidebar.element);
    }
    this.ui!.navigationContainer = this.element;
  }

  async addThought(): Promise<void> {
    if (!this.source || !this.ui || !await this.ui.finish()) return;
    if (this.note?.version === 1) { await this.actions.upgrade(this.source); return; }
    const source = { ...this.source }, documentId = this.note?.documentId;
    const thought = createThought();
    const host = this.element.ownerDocument.win.createDiv(); host.className = "marglow-thought-card";
    host.dataset.marglowDraft = "true";
    this.element.querySelector(".marglow-thought-list")!.prepend(host);
    let savedTime: string | undefined;
    this.ui.showThought(host, "", async text => {
      savedTime ??= new Date().toISOString();
      await this.actions.store.saveThought(source, { ...thought, text, createdAt: savedTime, updatedAt: savedTime }, undefined, documentId);
    });
  }

  private async editThought(entry: ThoughtEntry, host: HTMLElement): Promise<void> {
    const source = { ...this.source! }, documentId = this.note!.documentId;
    if (!await this.ui!.finish() || this.source?.path !== source.path || !host.isConnected) return;
    this.ui!.showThought(host, entry.thought.text, text => this.actions.store.saveThought(source, { ...entry.thought, text, updatedAt: new Date().toISOString() }, entry.raw, documentId), true);
  }

  private async editComment(annotation: Annotation): Promise<void> {
    const entry = this.note!.entries.find(item => item.annotation.id === annotation.id)!;
    const source = { ...this.source! };
    if (!await this.ui!.finish() || this.source?.path !== source.path) return;
    const host = this.localSidebar!.editorHost(annotation.id)!;
    this.ui!.showComment({ quote: annotation.quote, anchor: annotation.anchor, rect: host.getBoundingClientRect() }, {
      highlight: async (color, comment = annotation.comment) => { await this.actions.store.save(source, { ...annotation, color, comment, updatedAt: new Date().toISOString() }, entry.raw); },
      comment: async text => { await this.actions.store.save(source, { ...annotation, comment: text, updatedAt: new Date().toISOString() }, entry.raw); },
    }, annotation, host);
  }

  async finish(): Promise<boolean> { return await this.ui?.finish() ?? true; }
  dispose(): void { this.disposed = true; this.epoch++; if (this.ownsUi) this.ui?.dispose(); this.localSidebar?.dispose(); }
}
