import type { App, TFile } from "obsidian";
import type { Annotation, Source, Thought } from "./model";
import { NoteError, createReadingNote, deleteEntry, isReadingNote, parseReadingNote, replaceSource, updateEntry, setReadingStatus, type ReadingNote, type Entry } from "./format";
import { updateThought, deleteThought, upgradeReadingNote, removeMissingRecord } from "./format-v2";

export function readingNotePath(sourcePath: string): string {
  const slash = sourcePath.lastIndexOf("/");
  const directory = slash < 0 ? "" : sourcePath.slice(0, slash + 1);
  return `${directory}_marglow/${sourcePath.slice(slash + 1)}.annotations.md`;
}

export interface LoadedNote {
  file: TFile | null;
  note: ReadingNote | null;
}

export class AnnotationStore {
  constructor(private app: App) {}

  private resolveSource(source: Source, note: TFile): Source {
    const exact = this.app.vault.getFileByPath(source.path);
    if (exact) return { ...source, path: exact.path };
    const linkpath = source.path.split("|")[0]!.split("#")[0]!;
    const file = this.app.metadataCache.getFirstLinkpathDest(linkpath, note.path);
    return { ...source, path: file?.path ?? linkpath };
  }

  async readNote(file: TFile): Promise<ReadingNote> {
    const note = parseReadingNote(await this.app.vault.read(file));
    const sameIdentity = this.app.vault.getMarkdownFiles().filter(candidate => this.app.metadataCache.getFileCache(candidate)?.frontmatter?.annotation_document_id === note.documentId);
    if (sameIdentity.length > 1) throw new NoteError("Multiple reading notes share this document ID. Keep one canonical note before editing.");
    note.source = this.resolveSource(note.source, file);
    return note;
  }

  private candidates(source: Source): TFile[] {
    const matches = this.app.vault.getMarkdownFiles().filter(file => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const link: unknown = frontmatter?.annotation_source;
      return frontmatter?.annotation_schema !== undefined && typeof link === "string" && link.startsWith("[[") && link.endsWith("]]") &&
        this.resolveSource({ ...source, path: link.slice(2, -2) }, file).path === source.path;
    });
    for (const path of [readingNotePath(source.path), `${source.path}.annotations.md`]) {
      const expected = this.app.vault.getFileByPath(path);
      if (expected && !matches.includes(expected)) matches.unshift(expected);
    }
    return matches;
  }

  async load(source: Source): Promise<LoadedNote> {
    const file = this.findFile(source);
    if (!file) return { file: null, note: null };
    const note = await this.readNote(file);
    if (note.source.path !== source.path || note.source.type !== source.type) throw new NoteError("The companion filename is occupied by a note for another source. It will not be overwritten.");
    return { file, note };
  }

  findFile(source: Source): TFile | null {
    const candidates = this.candidates(source);
    if (candidates.length > 1) throw new NoteError("Multiple reading notes reference this source. Keep one canonical note before editing annotations.");
    return candidates[0] ?? null;
  }

  private async ensureNoteFolder(path: string): Promise<void> {
    const folder = path.slice(0, path.lastIndexOf("/"));
    const existing = this.app.vault.getAbstractFileByPath(folder);
    if (existing) {
      if (!("children" in existing)) throw new NoteError("The _marglow folder path is occupied by a file. It will not be overwritten.");
      return;
    }
    try { await this.app.vault.createFolder(folder); }
    catch (error) {
      const created = this.app.vault.getAbstractFileByPath(folder);
      if (!created || !("children" in created)) throw error;
    }
  }

  async save(source: Source, annotation: Annotation, expectedRaw?: string): Promise<Entry> {
    const { file, note } = await this.load(source);
    if (!file) {
      if (expectedRaw !== undefined) throw new NoteError("The reading note was deleted while you were editing. Your input has been kept.");
      // Create the first note with its annotation in one write, without an empty intermediate note.
      const path = readingNotePath(source.path);
      await this.ensureNoteFolder(path);
      const content = updateEntry(createReadingNote(source), annotation);
      await this.app.vault.create(path, content);
      return parseReadingNote(content).entries.find(entry => entry.annotation.id === annotation.id)!;
    }
    const content = await this.app.vault.process(file, current => {
      const parsed = parseReadingNote(current);
      if (parsed.documentId !== note!.documentId) throw new NoteError("The reading note's identity changed while you were editing.");
      if (this.resolveSource(parsed.source, file).path !== source.path || parsed.source.type !== source.type) throw new NoteError("The note's source changed while you were editing.");
      if (expectedRaw === undefined && parsed.entries.some(entry => entry.annotation.id === annotation.id)) throw new NoteError("This annotation already exists. Reopen it before saving.");
      return updateEntry(current, annotation, expectedRaw);
    });
    return parseReadingNote(content).entries.find(entry => entry.annotation.id === annotation.id)!;
  }

  async create(source: Source): Promise<TFile> {
    const { file } = await this.load(source);
    if (file) return file;
    if (!this.app.vault.getFileByPath(source.path)) throw new NoteError("The source document is missing. No reading note was created.");
    const path = readingNotePath(source.path);
    await this.ensureNoteFolder(path);
    return this.app.vault.create(path, createReadingNote(source));
  }

  async setStatus(source: Source, status: "" | "reading" | "read", expected?: { documentId: string; status?: string }): Promise<void> {
    const loaded = await this.load(source);
    if (!loaded.file) {
      if (expected) throw new NoteError("The reading note was deleted. Its status was not changed.");
      if (!status) return;
      if (!this.app.vault.getFileByPath(source.path)) throw new NoteError("The source document is missing.");
      const path = readingNotePath(source.path); await this.ensureNoteFolder(path);
      await this.app.vault.create(path, setReadingStatus(createReadingNote(source), status)); return;
    }
    await this.app.vault.process(loaded.file, current => {
      const note = parseReadingNote(current);
      if (note.documentId !== (expected?.documentId ?? loaded.note!.documentId) || this.resolveSource(note.source, loaded.file!).path !== source.path || (expected && note.status !== expected.status)) throw new NoteError("The reading note or its status changed. Refresh before trying again.");
      return setReadingStatus(current, status);
    });
  }

  async saveThought(source: Source, thought: Thought, expectedRaw?: string, documentId?: string): Promise<void> {
    const { file, note } = await this.load(source);
    if (!file) {
      if (expectedRaw !== undefined || documentId !== undefined) throw new NoteError("The reading note was deleted. Your input has been kept.");
      if (!this.app.vault.getFileByPath(source.path)) throw new NoteError("The source document is missing. Your input has been kept.");
      const path = readingNotePath(source.path);
      await this.ensureNoteFolder(path);
      await this.app.vault.create(path, updateThought(createReadingNote(source), thought));
      return;
    }
    await this.app.vault.process(file, current => {
      const parsed = parseReadingNote(current);
      if (parsed.documentId !== (documentId ?? note!.documentId) || this.resolveSource(parsed.source, file).path !== source.path) throw new NoteError("The reading note's identity or source changed. Your input has been kept.");
      const existing = parsed.thoughts.find(entry => entry.thought.id === thought.id);
      if (expectedRaw === undefined && existing) {
        if (existing.thought.blockId === thought.blockId && existing.thought.text === thought.text && existing.thought.createdAt === thought.createdAt) return current;
        throw new NoteError("This thought already exists with different content. Your input has been kept.");
      }
      return updateThought(current, thought, expectedRaw);
    });
  }

  async removeThought(source: Source, id: string, expectedRaw: string, documentId: string): Promise<void> {
    const { file } = await this.load(source);
    if (!file) throw new NoteError("The reading note no longer exists.");
    await this.app.vault.process(file, current => {
      const note = parseReadingNote(current);
      if (note.documentId !== documentId || this.resolveSource(note.source, file).path !== source.path) throw new NoteError("The reading note's identity or source changed.");
      return deleteThought(current, id, expectedRaw);
    });
  }

  async upgrade(file: TFile, expected: string, converted = upgradeReadingNote(expected)): Promise<TFile> {
    const original = parseReadingNote(expected), target = parseReadingNote(converted);
    if (original.version !== 1 || target.version !== 2 || original.documentId !== target.documentId || original.source.path !== target.source.path) throw new NoteError("Invalid reading-note upgrade.");
    if (target.thoughts.length || original.entries.length !== target.entries.length || original.entries.some((entry, index) => {
      const before = entry.annotation, after = target.entries[index]!.annotation;
      return before.id !== after.id || before.blockId !== after.blockId || before.quote !== after.quote || before.comment !== after.comment || before.color !== after.color || before.style !== after.style || before.createdAt !== after.createdAt || before.updatedAt !== after.updatedAt || JSON.stringify(before.anchor) !== JSON.stringify(after.anchor);
    })) throw new NoteError("The upgrade must preserve all existing annotation content and IDs.");
    await this.load((await this.readNote(file)).source);
    if (await this.app.vault.read(file) !== expected) throw new NoteError("The reading note changed. Review a new upgrade preview.");
    const backupPath = `${file.path}.v1.bak`;
    const backup = this.app.vault.getAbstractFileByPath(backupPath);
    if (backup) throw new NoteError("The upgrade backup path is occupied. Preserve or move that backup before retrying.");
    const savedBackup = await this.app.vault.create(backupPath, expected);
    if (await this.app.vault.read(savedBackup) !== expected) throw new NoteError("Could not verify the upgrade backup. The reading note was not changed.");
    await this.app.vault.process(file, current => {
      if (current !== expected) throw new NoteError("The reading note changed after the preview. Its original backup was retained.");
      return converted;
    });
    const saved = await this.app.vault.read(file);
    parseReadingNote(saved);
    if (saved !== converted) throw new NoteError("The upgraded note changed during verification. The backup has been retained.");
    return savedBackup;
  }

  async removeMissing(file: TFile, id: string, expectedRaw: string, documentId: string): Promise<void> {
    await this.app.vault.process(file, current => {
      const note = parseReadingNote(current, true);
      if (note.documentId !== documentId) throw new NoteError("The reading note's identity changed.");
      return removeMissingRecord(current, id, expectedRaw);
    });
  }

  async remove(source: Source, id: string, expectedRaw: string): Promise<void> {
    const { file, note: original } = await this.load(source);
    if (!file) throw new NoteError("The reading note no longer exists.");
    await this.app.vault.process(file, current => {
      const note = parseReadingNote(current);
      if (note.documentId !== original!.documentId) throw new NoteError("The reading note's identity changed before deletion.");
      if (this.resolveSource(note.source, file).path !== source.path || note.source.type !== source.type) throw new NoteError("The note's source changed before deletion.");
      return deleteEntry(current, id, expectedRaw);
    });
  }

  async relink(file: TFile, source: Source): Promise<void> {
    const snapshot = parseReadingNote(await this.app.vault.read(file));
    const targetSource = this.app.vault.getFileByPath(source.path);
    if (!targetSource) throw new NoteError("The replacement source no longer exists.");
    if (targetSource.extension === "md" && isReadingNote(await this.app.vault.read(targetSource))) throw new NoteError("A reading note cannot be used as a source document.");
    const candidates = this.candidates(source).filter(candidate => candidate.path !== file.path);
    if (candidates.length) throw new NoteError("This source already has a reading note. Relinking would create an ambiguous association.");
    const target = readingNotePath(source.path);
    if (file.path !== target && this.app.vault.getAbstractFileByPath(target)) throw new NoteError("The destination is occupied; no file was changed.");
    await this.ensureNoteFolder(target);
    await this.app.vault.process(file, current => {
      const note = parseReadingNote(current);
      if (note.documentId !== snapshot.documentId || note.source.path !== snapshot.source.path) throw new NoteError("The note's source changed before relinking.");
      return replaceSource(current, source);
    });
    if (file.path !== target) await this.app.fileManager.renameFile(file, target);
  }

  async renameSource(oldPath: string, newPath: string): Promise<void> {
    const notes = this.app.vault.getMarkdownFiles().filter(file => {
      const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const source: unknown = metadata?.annotation_source;
      if (metadata?.annotation_schema === undefined || typeof source !== "string") return (file.path === `${oldPath}.annotations.md` || file.path === readingNotePath(oldPath));
      const raw = source.slice(2, -2);
      const linked = this.resolveSource({ path: raw, type: "markdown" }, file).path;
      return linked === oldPath || linked.startsWith(`${oldPath}/`) || linked === newPath || linked.startsWith(`${newPath}/`) || (file.path === `${oldPath}.annotations.md` || file.path === readingNotePath(oldPath));
    });
    for (const file of notes) {
      const text = await this.app.vault.read(file);
      const parsed = parseReadingNote(text);
      parsed.source = this.resolveSource(parsed.source, file);
      let path = parsed.source.path;
      if (path === oldPath || path.startsWith(`${oldPath}/`)) path = newPath + path.slice(oldPath.length);
      else if (path !== newPath) continue;
      const source = { ...parsed.source, path };
      await this.app.vault.process(file, current => replaceSource(current, source));
      // Keep legacy sidecars in their original layout until the user moves them.
      const target = file.path === `${oldPath}.annotations.md` || file.path === `${path}.annotations.md` ? `${path}.annotations.md` : readingNotePath(path);
      if (file.path !== target) {
        if (this.app.vault.getAbstractFileByPath(target)) throw new NoteError("The reading-note destination is occupied. The existing note was retained with its updated source link.");
        if (target === readingNotePath(path)) await this.ensureNoteFolder(target);
        await this.app.fileManager.renameFile(file, target);
      }
    }
  }
}
