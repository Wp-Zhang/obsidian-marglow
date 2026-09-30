import type { App, TFile } from "obsidian";
import { describe, expect, it } from "vitest";
import { AnnotationStore } from "../src/store";
import { createReadingNote, parseReadingNote, updateEntry } from "../src/format";
import { annotation, source } from "./helpers";

function fixture() {
  const files = new Map<string, { file: TFile; text: string }>();
  const writes: string[] = [];
  let beforeProcess: (() => void) | undefined;
  const put = (path: string, text: string) => {
    const file = { path, extension: path.split(".").pop(), stat: { size: text.length, mtime: 1 } } as TFile;
    files.set(path, { file, text });
    return file;
  };
  put(source.path, "# Source\n\nImmutable original bytes.\n");
  const app = {
    vault: {
      getMarkdownFiles: () => [...files.values()].map(item => item.file).filter(file => file.extension === "md"),
      getFileByPath: (path: string) => files.get(path)?.file ?? null,
      getAbstractFileByPath: (path: string) => files.get(path)?.file ?? null,
      read: async (file: TFile) => files.get(file.path)!.text,
      create: async (path: string, text: string) => { if (files.has(path)) throw new Error("File exists"); writes.push(path); return put(path, text); },
      process: async (file: TFile, update: (text: string) => string) => {
        beforeProcess?.(); beforeProcess = undefined;
        const text = update(files.get(file.path)!.text);
        writes.push(file.path); files.get(file.path)!.text = text; return text;
      },
    },
    metadataCache: { getFirstLinkpathDest: (path: string, from: string) => path ? files.get(path)?.file ?? files.get(`${path}.md`)?.file ?? null : files.get(from)?.file ?? null, getFileCache: (file: TFile) => {
      const text = files.get(file.path)!.text;
      try {
        const note = parseReadingNote(text);
        return { frontmatter: { annotation_schema: 1, annotation_source: `[[${note.source.path}]]` } };
      } catch { return {}; }
    } },
    fileManager: { renameFile: async (file: TFile, path: string) => { const item = files.get(file.path)!; files.delete(file.path); file.path = path; files.set(path, item); } },
  } as unknown as App;
  return { store: new AnnotationStore(app), files, writes, put, setBeforeProcess: (hook: () => void) => { beforeProcess = hook; } };
}

describe("safe companion-note storage", () => {
  it("creates the first note atomically without touching source bytes", async () => {
    const { store, files, writes } = fixture();
    const original = files.get(source.path)!.text;
    await store.save(source, annotation());
    expect(writes).toEqual([`${source.path}.annotations.md`]);
    expect(files.get(source.path)!.text).toBe(original);
    expect((await store.load(source)).note!.entries).toHaveLength(1);
  });

  it("uses current content when unrelated prose changes between reading and writing", async () => {
    const { store, files, setBeforeProcess } = fixture();
    await store.save(source, annotation());
    const original = (await store.load(source)).note!.entries[0]!;
    setBeforeProcess(() => { files.get(`${source.path}.annotations.md`)!.text += "\nNew handwritten paragraph."; });
    await store.save(source, { ...annotation(), comment: "Edited" }, original.raw);
    expect(files.get(`${source.path}.annotations.md`)!.text).toContain("New handwritten paragraph.");
  });

  it("refuses to overwrite a concurrently edited annotation and retains external content", async () => {
    const { store, files, setBeforeProcess } = fixture();
    await store.save(source, annotation());
    const snapshot = (await store.load(source)).note!.entries[0]!.raw;
    setBeforeProcess(() => { const file = files.get(`${source.path}.annotations.md`)!; file.text = file.text.replace("My thought.", "External thought."); });
    await expect(store.save(source, { ...annotation(), comment: "Local thought." }, snapshot)).rejects.toThrow(/changed/);
    expect(files.get(`${source.path}.annotations.md`)!.text).toContain("External thought.");
  });

  it("protects an ordinary note occupying the default companion filename", async () => {
    const { store, put, writes } = fixture();
    put(`${source.path}.annotations.md`, "My unrelated personal note.");
    await expect(store.save(source, annotation())).rejects.toThrow();
    expect(writes).toEqual([]);
  });

  it("does not resurrect a note deleted during an open edit", async () => {
    const { store, files } = fixture();
    await store.save(source, annotation());
    const snapshot = (await store.load(source)).note!.entries[0]!.raw;
    files.delete(`${source.path}.annotations.md`);
    await expect(store.save(source, annotation(), snapshot)).rejects.toThrow(/deleted/);
    expect(files.has(`${source.path}.annotations.md`)).toBe(false);
  });

  it("finds a manually moved companion by source metadata and rejects multiple candidates", async () => {
    const { store, put } = fixture();
    const text = updateEntry(createReadingNote(source), annotation());
    put("Moved/notes.md", text);
    expect((await store.load(source)).file!.path).toBe("Moved/notes.md");
    put("Other/duplicate.md", text);
    await expect(store.load(source)).rejects.toThrow(/Multiple/);
  });

  it("renames a companion while preserving identifiers and user notes", async () => {
    const { store, files } = fixture();
    await store.save(source, annotation());
    files.get(`${source.path}.annotations.md`)!.text += "\nMy summary.";
    await store.renameSource(source.path, "Moved/new.md");
    const note = parseReadingNote(files.get("Moved/new.md.annotations.md")!.text);
    expect(note.source.path).toBe("Moved/new.md");
    expect(note.entries[0]!.annotation.id).toBe(annotation().id);
    expect(files.get("Moved/new.md.annotations.md")!.text).toContain("My summary.");
  });

  it("does not overwrite a note at the new destination during a rename", async () => {
    const { store, files, put } = fixture();
    await store.save(source, annotation());
    put("Moved/new.md.annotations.md", "Existing user content.");
    await expect(store.renameSource(source.path, "Moved/new.md")).rejects.toThrow(/occupied/);
    expect(files.get("Moved/new.md.annotations.md")!.text).toBe("Existing user content.");
    expect(files.has(`${source.path}.annotations.md`)).toBe(true);
  });

  it("explicitly relinks a missing source while preserving annotations and free notes", async () => {
    const { store, files, put } = fixture();
    await store.save(source, annotation());
    const file = files.get(`${source.path}.annotations.md`)!.file;
    files.get(file.path)!.text += "\nA handwritten summary.";
    files.delete(source.path);
    put("Replacement.md", "New source content.");
    await store.relink(file, { type: "markdown", path: "Replacement.md" });
    const note = parseReadingNote(files.get("Replacement.md.annotations.md")!.text);
    expect(note.source.path).toBe("Replacement.md");
    expect(note.entries[0]!.annotation.id).toBe(annotation().id);
    expect(files.get("Replacement.md.annotations.md")!.text).toContain("A handwritten summary.");
  });

  it("rejects relinking to a source with another reading note", async () => {
    const { store, files, put } = fixture();
    await store.save(source, annotation());
    put("Replacement.md", "Source content.");
    put("Replacement.md.annotations.md", createReadingNote({ type: "markdown", path: "Replacement.md" }));
    const file = files.get(`${source.path}.annotations.md`)!.file;
    const before = files.get(file.path)!.text;
    await expect(store.relink(file, { type: "markdown", path: "Replacement.md" })).rejects.toThrow(/already has/);
    expect(files.get(file.path)!.text).toBe(before);
  });

  it("resolves shortened or aliased native source links without losing the companion", async () => {
    const { store, put } = fixture();
    put("Replacement.md", "A source.");
    put("Moved/reading.md", updateEntry(createReadingNote({ path: "Replacement|My source", type: "markdown" }), annotation()));
    const loaded = await store.load({ path: "Replacement.md", type: "markdown" });
    expect(loaded.file!.path).toBe("Moved/reading.md");
    expect(loaded.note!.source.path).toBe("Replacement.md");
    await store.save({ path: "Replacement.md", type: "markdown" }, { ...annotation(), comment: "Updated after a native link rewrite" }, loaded.note!.entries[0]!.raw);
  });

  it("rejects using a reading note as its own source even before metadata indexing", async () => {
    const { store, files } = fixture();
    await store.save(source, annotation());
    const file = files.get(`${source.path}.annotations.md`)!.file;
    const before = files.get(file.path)!.text;
    await expect(store.relink(file, { type: "markdown", path: file.path })).rejects.toThrow(/cannot be used/);
    expect(files.get(file.path)!.text).toBe(before);
  });
});
