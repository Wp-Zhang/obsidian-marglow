import type { App, TFile } from "obsidian";
import { describe, expect, it } from "vitest";
import { AnnotationStore, readingNotePath } from "../src/store";
import { createReadingNote, createLegacyReadingNote, parseReadingNote, updateEntry } from "../src/format";
import { createThought } from "../src/model";
import { annotation, source } from "./helpers";

function fixture() {
  const files = new Map<string, { file: TFile; text: string }>();
  const writes: string[] = [];
  const folders = new Map<string, { path: string; children: unknown[] }>();
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
      getAbstractFileByPath: (path: string) => files.get(path)?.file ?? folders.get(path) ?? null,
      createFolder: async (path: string) => { if (files.has(path) || folders.has(path)) throw new Error("Path exists"); const folder = { path, children: [] }; folders.set(path, folder); return folder; },
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
      const header = /^---\n([\s\S]*?)\n---/.exec(text)?.[1];
      if (!header) return {};
      const schema = /^annotation_schema: (.*)$/m.exec(header)?.[1], id = /^annotation_document_id: (.*)$/m.exec(header)?.[1], link = /^annotation_source: (.*)$/m.exec(header)?.[1];
      return { frontmatter: { annotation_schema: schema === undefined ? undefined : Number(schema), annotation_document_id: id, annotation_source: link?.startsWith('"') ? JSON.parse(link) as unknown : link } };
    } },
    fileManager: { renameFile: async (file: TFile, path: string) => { const item = files.get(file.path)!; files.delete(file.path); file.path = path; files.set(path, item); } },
  } as unknown as App;
  return { store: new AnnotationStore(app), files, writes, put, setBeforeProcess: (hook: () => void) => { beforeProcess = hook; } };
}

describe("safe companion-note storage", () => {
  it("returns each committed snapshot for repeated popup edits and still rejects a later external edit", async () => {
    const {store,files}=fixture();
    const first=await store.save(source,annotation());
    const colored=await store.save(source,{...first.annotation,color:'blue'},first.raw);
    const styled=await store.save(source,{...colored.annotation,style:'underline'},colored.raw);
    expect(styled.annotation.color).toBe('blue');expect(styled.annotation.style).toBe('underline');
    expect(styled.annotation.commentBlockId).toBe(first.annotation.commentBlockId);expect(styled.annotation.blockId).toBe(first.annotation.blockId);
    const file=files.get(readingNotePath(source.path))!;file.text=file.text.replace('My thought.','Edited outside the popup.');
    await expect(store.save(source,{...styled.annotation,color:'pink'},styled.raw)).rejects.toThrow(/changed/);
    expect(file.text).toContain('Edited outside the popup.');
  });
  it("creates the first note atomically without touching source bytes", async () => {
    const { store, files, writes } = fixture();
    const original = files.get(source.path)!.text;
    await store.save(source, annotation());
    expect(writes).toEqual([readingNotePath(source.path)]);
    expect(files.get(source.path)!.text).toBe(original);
    expect((await store.load(source)).note!.entries).toHaveLength(1);
  });

  it("uses current content when unrelated prose changes between reading and writing", async () => {
    const { store, files, setBeforeProcess } = fixture();
    await store.save(source, annotation());
    const original = (await store.load(source)).note!.entries[0]!;
    setBeforeProcess(() => { files.get(readingNotePath(source.path))!.text += "\nNew handwritten paragraph."; });
    await store.save(source, { ...annotation(), comment: "Edited" }, original.raw);
    expect(files.get(readingNotePath(source.path))!.text).toContain("New handwritten paragraph.");
  });

  it("refuses to overwrite a concurrently edited annotation and retains external content", async () => {
    const { store, files, setBeforeProcess } = fixture();
    await store.save(source, annotation());
    const snapshot = (await store.load(source)).note!.entries[0]!.raw;
    setBeforeProcess(() => { const file = files.get(readingNotePath(source.path))!; file.text = file.text.replace("My thought.", "External thought."); });
    await expect(store.save(source, { ...annotation(), comment: "Local thought." }, snapshot)).rejects.toThrow(/changed/);
    expect(files.get(readingNotePath(source.path))!.text).toContain("External thought.");
  });

  it("protects an ordinary note occupying the default companion filename", async () => {
    const { store, put, writes } = fixture();
    put(readingNotePath(source.path), "My unrelated personal note.");
    await expect(store.save(source, annotation())).rejects.toThrow();
    expect(writes).toEqual([]);
  });

  it("does not resurrect a note deleted during an open edit", async () => {
    const { store, files } = fixture();
    await store.save(source, annotation());
    const snapshot = (await store.load(source)).note!.entries[0]!.raw;
    files.delete(readingNotePath(source.path));
    await expect(store.save(source, annotation(), snapshot)).rejects.toThrow(/deleted/);
    expect(files.has(readingNotePath(source.path))).toBe(false);
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
    files.get(readingNotePath(source.path))!.text += "\nMy summary.";
    await store.renameSource(source.path, "Moved/new.md");
    const note = parseReadingNote(files.get(readingNotePath("Moved/new.md"))!.text);
    expect(note.source.path).toBe("Moved/new.md");
    expect(note.entries[0]!.annotation.id).toBe(annotation().id);
    expect(files.get(readingNotePath("Moved/new.md"))!.text).toContain("My summary.");
  });

  it("does not overwrite a note at the new destination during a rename", async () => {
    const { store, files, put } = fixture();
    await store.save(source, annotation());
    put(readingNotePath("Moved/new.md"), "Existing user content.");
    await expect(store.renameSource(source.path, "Moved/new.md")).rejects.toThrow(/occupied/);
    expect(files.get(readingNotePath("Moved/new.md"))!.text).toBe("Existing user content.");
    expect(files.has(readingNotePath(source.path))).toBe(true);
  });

  it("explicitly relinks a missing source while preserving annotations and free notes", async () => {
    const { store, files, put } = fixture();
    await store.save(source, annotation());
    const file = files.get(readingNotePath(source.path))!.file;
    files.get(file.path)!.text += "\nA handwritten summary.";
    files.delete(source.path);
    put("Replacement.md", "New source content.");
    await store.relink(file, { type: "markdown", path: "Replacement.md" });
    const note = parseReadingNote(files.get(readingNotePath("Replacement.md"))!.text);
    expect(note.source.path).toBe("Replacement.md");
    expect(note.entries[0]!.annotation.id).toBe(annotation().id);
    expect(files.get(readingNotePath("Replacement.md"))!.text).toContain("A handwritten summary.");
  });

  it("rejects relinking to a source with another reading note", async () => {
    const { store, files, put } = fixture();
    await store.save(source, annotation());
    put("Replacement.md", "Source content.");
    put(readingNotePath("Replacement.md"), createReadingNote({ type: "markdown", path: "Replacement.md" }));
    const file = files.get(readingNotePath(source.path))!.file;
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
    const file = files.get(readingNotePath(source.path))!.file;
    const before = files.get(file.path)!.text;
    await expect(store.relink(file, { type: "markdown", path: file.path })).rejects.toThrow(/cannot be used/);
    expect(files.get(file.path)!.text).toBe(before);
  });
});

describe("new reading-note storage", () => {
  it("creates an empty note only on an explicit action and reuses it", async () => {
    const { store, writes } = fixture();
    expect((await store.load(source)).file).toBeNull(); expect(writes).toHaveLength(0);
    const file = await store.create(source);
    expect((await store.load(source)).note!.entries).toHaveLength(0);
    expect(await store.create(source)).toBe(file); expect(writes).toHaveLength(1);
  });

  it("saves a first thought atomically and retries the same record without duplication", async () => {
    const { store, writes, files } = fixture();
    const thought = { ...createThought(), text: "A whole-material thought." };
    await store.saveThought(source, thought); expect(writes).toHaveLength(1);
    await store.saveThought(source, thought);
    const note = (await store.load(source)).note!;
    expect(note.thoughts).toHaveLength(1); expect(note.entries).toHaveLength(0);
    expect(files.get(source.path)!.text).toContain("Immutable original bytes.");
    await expect(store.saveThought(source, { ...thought, text: "Different input." })).rejects.toThrow(/different/);
  });

  it("keeps a missing-source note editable and rejects stale thought edits", async () => {
    const { store, files } = fixture();
    const thought = { ...createThought(), text: "An earlier idea." }; await store.saveThought(source, thought);
    const note = (await store.load(source)).note!; files.delete(source.path);
    await store.saveThought(source, { ...thought, text: "A later idea." }, note.thoughts[0]!.raw, note.documentId);
    await expect(store.saveThought(source, { ...thought, text: "Stale." }, note.thoughts[0]!.raw, note.documentId)).rejects.toThrow(/changed/);
    expect((await store.load(source)).note!.thoughts[0]!.thought.text).toBe("A later idea.");
  });

  it("discovers unknown versions at moved locations and does not create a duplicate", async () => {
    const { store, put, writes } = fixture();
    put("Moved/unknown.md", createReadingNote(source).replace("annotation_schema: 2", "annotation_schema: 99"));
    await expect(store.save(source, annotation())).rejects.toThrow(/Unsupported/); expect(writes).toHaveLength(0);
  });

  it("can open a moved damaged note for repair while all normal writes remain paused", async () => {
    const { store, put, writes } = fixture();
    const note = updateEntry(createReadingNote(source), annotation());
    const file = put("Moved/damaged.md", note.replace("^ann-test-001", ""));
    expect(store.findFile(source)).toBe(file);
    await expect(store.load(source)).rejects.toThrow(/body missing/);
    await expect(store.save(source, annotation())).rejects.toThrow(); expect(writes).toHaveLength(0);
  });

  it("rejects duplicate document identity even when source links differ", async () => {
    const { store, put } = fixture();
    const text = createReadingNote(source); put("A.md", text); put("B.md", text.replace(source.path, "Other.md"));
    await expect(store.load(source)).rejects.toThrow(/document ID/);
  });

  it("upgrades explicitly, verifies a full original backup, and preserves old reference IDs", async () => {
    const { store, put, files } = fixture();
    const old = updateEntry(createLegacyReadingNote(source), annotation()) + "\nHandwritten content.\n";
    const file = put(readingNotePath(source.path), old);
    const backup = await store.upgrade(file, old);
    expect(backup.extension).toBe("bak"); expect(files.get(backup.path)!.text).toBe(old);
    const note = (await store.load(source)).note!;
    expect(note.version).toBe(2); expect(note.entries[0]!.annotation.blockId).toBe(annotation().blockId);
    expect(files.get(file.path)!.text).toContain("Handwritten content.");
  });

  it("does not change the original on stale previews, occupied backups, or a concurrent edit", async () => {
    for (const situation of ["stale", "occupied", "concurrent"]) {
      const { store, put, files, setBeforeProcess } = fixture();
      const old = updateEntry(createLegacyReadingNote(source), annotation());
      const file = put(readingNotePath(source.path), old);
      if (situation === "stale") files.get(file.path)!.text += "\nExternal edit.";
      if (situation === "occupied") put(`${file.path}.v1.bak`, "Unrelated backup.");
      if (situation === "concurrent") setBeforeProcess(() => { files.get(file.path)!.text += "\nExternal edit."; });
      await expect(store.upgrade(file, old)).rejects.toThrow();
      expect(parseReadingNote(files.get(file.path)!.text).version).toBe(1);
      if (situation !== "occupied") expect(files.get(file.path)!.text).toContain("External edit.");
    }
  });

  it("changes only explicit reading status and protects concurrent property edits", async () => {
    const { store, files } = fixture();
    await store.create(source);
    const note = (await store.load(source)).note!; expect(note.status).toBeUndefined();
    await store.setStatus(source, "reading", { documentId: note.documentId });
    expect((await store.load(source)).note!.status).toBe("reading");
    await expect(store.setStatus(source, "read", { documentId: note.documentId })).rejects.toThrow(/changed/);
    await store.setStatus(source, "", { documentId: note.documentId, status: "reading" });
    expect(files.get(readingNotePath(source.path))!.text).not.toContain("marglow_status:");
  });
});

it("keeps legacy sidecars canonical without creating a second note", async () => {
  const { store, put, files } = fixture();
  const path = `${source.path}.annotations.md`;
  put(path, updateEntry(createReadingNote(source), annotation()));
  const entry = (await store.load(source)).note!.entries[0]!;
  await store.save(source, { ...entry.annotation, comment: "Legacy edited" }, entry.raw);
  expect(files.get(path)!.text).toContain("Legacy edited");
  expect(files.has(readingNotePath(source.path))).toBe(false);
  await store.renameSource(source.path, "Moved/new.md");
  expect(files.has("Moved/new.md.annotations.md")).toBe(true);
});

it("does not overwrite a file occupying the _marglow directory", async () => {
  const { store, put, writes, files } = fixture();
  put("Research/_marglow", "Unrelated file");
  await expect(store.save(source, annotation())).rejects.toThrow(/occupied/);
  expect(writes).toEqual([]);
  expect(files.get("Research/_marglow")!.text).toBe("Unrelated file");
});

it("separates matching Markdown/PDF names and root sources", async () => {
  const { store, put, files } = fixture();
  put("Research/article.pdf", "PDF bytes");
  put("Root.md", "Markdown bytes");
  await store.save(source, annotation());
  await store.save({ path: "Research/article.pdf", type: "pdf" }, { ...annotation("ann-pdf"), anchor: { kind: "pdf", sourceFingerprint: "fingerprint", segments: [{ page: 1, quote: annotation().quote, rects: [[0, 0, 10, 10]] }] } });
  await store.save({ path: "Root.md", type: "markdown" }, annotation("ann-root"));
  expect(files.has("Research/_marglow/article.md.annotations.md")).toBe(true);
  expect(files.has("Research/_marglow/article.pdf.annotations.md")).toBe(true);
  expect(files.has("_marglow/Root.md.annotations.md")).toBe(true);
});

it("pauses writes when both layouts contain notes for the source", async () => {
  const { store, put, writes } = fixture();
  const text = updateEntry(createReadingNote(source), annotation());
  put(`${source.path}.annotations.md`, text);
  put(readingNotePath(source.path), text);
  await expect(store.save(source, annotation())).rejects.toThrow(/Multiple/);
  expect(writes).toEqual([]);
});
