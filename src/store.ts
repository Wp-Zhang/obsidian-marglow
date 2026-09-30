import type { App, TFile } from "obsidian";
import type { Annotation, Source } from "./model";
import { NoteError, createReadingNote, deleteEntry, isReadingNote, parseReadingNote, replaceSource, updateEntry, type ReadingNote } from "./format";

export interface LoadedNote {
  file: TFile | null;
  note: ReadingNote | null;
}

export class AnnotationStore {
  constructor(private app: App) {}

  private resolveSource(source: Source, note: TFile): Source {
    const linkpath = source.path.split("|")[0]!.split("#")[0]!;
    const file = this.app.metadataCache.getFirstLinkpathDest(linkpath, note.path);
    return { ...source, path: file?.path ?? linkpath };
  }

  async readNote(file: TFile): Promise<ReadingNote> {
    const note = parseReadingNote(await this.app.vault.read(file));
    note.source = this.resolveSource(note.source, file);
    return note;
  }

  private candidates(source: Source): TFile[] {
    const matches = this.app.vault.getMarkdownFiles().filter(file => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const link = frontmatter?.annotation_source;
      return frontmatter?.annotation_schema === 1 && typeof link === "string" && link.startsWith("[[") && link.endsWith("]]") &&
        this.resolveSource({ ...source, path: link.slice(2, -2) }, file).path === source.path;
    });
    const expected = this.app.vault.getFileByPath(`${source.path}.annotations.md`);
    if (expected && !matches.includes(expected)) matches.unshift(expected);
    return matches;
  }

  async load(source: Source): Promise<LoadedNote> {
    const candidates = this.candidates(source);
    if (candidates.length > 1) throw new NoteError("Multiple reading notes reference this source. Keep one canonical note before editing annotations.");
    const file = candidates[0];
    if (!file) return { file: null, note: null };
    const note = await this.readNote(file);
    if (note.source.path !== source.path || note.source.type !== source.type) throw new NoteError("The companion filename is occupied by a note for another source. It will not be overwritten.");
    return { file, note };
  }

  async save(source: Source, annotation: Annotation, expectedRaw?: string): Promise<void> {
    let { file } = await this.load(source);
    if (!file) {
      if (expectedRaw !== undefined) throw new NoteError("The reading note was deleted while you were editing. Your input has been kept.");
      // Create the first note with its annotation in one write, without an empty intermediate note.
      await this.app.vault.create(`${source.path}.annotations.md`, updateEntry(createReadingNote(source), annotation));
      return;
    }
    await this.app.vault.process(file, current => {
      const parsed = parseReadingNote(current);
      if (this.resolveSource(parsed.source, file!).path !== source.path || parsed.source.type !== source.type) throw new NoteError("The note's source changed while you were editing.");
      if (expectedRaw === undefined && parsed.entries.some(entry => entry.annotation.id === annotation.id)) throw new NoteError("This annotation already exists. Reopen it before saving.");
      return updateEntry(current, annotation, expectedRaw);
    });
  }

  async remove(source: Source, id: string, expectedRaw: string): Promise<void> {
    const { file } = await this.load(source);
    if (!file) throw new NoteError("The reading note no longer exists.");
    await this.app.vault.process(file, current => {
      const note = parseReadingNote(current);
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
    const target = `${source.path}.annotations.md`;
    if (file.path !== target && this.app.vault.getAbstractFileByPath(target)) throw new NoteError("The destination is occupied; no file was changed.");
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
      const source = metadata?.annotation_source;
      if (metadata?.annotation_schema !== 1 || typeof source !== "string") return file.path === `${oldPath}.annotations.md`;
      const raw = source.slice(2, -2);
      const linked = this.resolveSource({ path: raw, type: "markdown" }, file).path;
      return linked === oldPath || linked.startsWith(`${oldPath}/`) || linked === newPath || linked.startsWith(`${newPath}/`) || file.path === `${oldPath}.annotations.md`;
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
      const target = `${path}.annotations.md`;
      if (file.path !== target) {
        if (this.app.vault.getAbstractFileByPath(target)) throw new NoteError("The reading-note destination is occupied. The existing note was retained with its updated source link.");
        await this.app.fileManager.renameFile(file, target);
      }
    }
  }
}
