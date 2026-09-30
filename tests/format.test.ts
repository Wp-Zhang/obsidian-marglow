import { describe, expect, it } from "vitest";
import { createReadingNote, deleteEntry, isReadingNote, parseReadingNote, replaceSource, serializeAnnotation, updateEntry } from "../src/format";
import { annotation, source } from "./helpers";

describe("Markdown annotation persistence", () => {
  it("round-trips readable comments, literal quotations, and hidden-comment delimiters", () => {
    const entry = annotation();
    entry.quote = "A [link] with *stars* and %% hidden delimiters\nnext > line";
    entry.comment = "## My thought\n\n[[Another note]]\n%% oa:annotation:start ann-impostor %%\n100%";
    entry.anchor = { kind: "markdown", textStart: 0, prefix: "before %%", suffix: "%% after" };
    const text = updateEntry(createReadingNote(source), entry);
    expect(parseReadingNote(text).entries[0]!.annotation).toEqual(entry);
    expect(text).toContain("^ann-test-001");
    expect(text).toContain("\\u0025\\u0025");
  });

  it("changes only the target block and preserves user text and unrelated entries byte for byte", () => {
    const second = annotation("ann-test-002");
    const prefix = createReadingNote(source).replace("## My notes", "My handwritten notes — 世界\n\n## My notes");
    const initial = updateEntry(updateEntry(prefix, annotation()), second) + "\nPersonal ending\n";
    const parsed = parseReadingNote(initial);
    const edited = updateEntry(initial, { ...annotation(), comment: "Edited" }, parsed.entries[0]!.raw);
    expect(edited.startsWith(prefix)).toBe(true);
    expect(edited.endsWith("\nPersonal ending\n")).toBe(true);
    expect(parseReadingNote(edited).entries[1]!.raw).toBe(parsed.entries[1]!.raw);
  });

  it("keeps stable IDs when a comment is removed and deletes only a complete entry", () => {
    const initial = updateEntry(createReadingNote(source), annotation());
    const original = parseReadingNote(initial).entries[0]!;
    const edited = updateEntry(initial, { ...annotation(), comment: "" }, original.raw);
    const result = parseReadingNote(edited).entries[0]!;
    expect(result.annotation.comment).toBe("");
    expect(result.annotation.id).toBe(original.annotation.id);
    expect(result.annotation.quote).toBe(original.annotation.quote);
    expect(parseReadingNote(deleteEntry(edited, result.annotation.id, result.raw)).entries).toEqual([]);
  });

  it("reads a direct Markdown comment edit without relying on a timestamp change", () => {
    const initial = updateEntry(createReadingNote(source), annotation());
    expect(parseReadingNote(initial.replace("My thought.", "Changed directly in Obsidian.")).entries[0]!.annotation.comment).toBe("Changed directly in Obsidian.");
  });

  it("rejects stale edit and delete snapshots instead of overwriting an external change", () => {
    const initial = updateEntry(createReadingNote(source), annotation());
    const snapshot = parseReadingNote(initial).entries[0]!.raw;
    const externallyEdited = initial.replace("My thought.", "External edit");
    expect(() => updateEntry(externallyEdited, annotation(), snapshot)).toThrow(/changed/);
    expect(() => deleteEntry(externallyEdited, annotation().id, snapshot)).toThrow(/changed/);
  });

  it("preserves CRLF throughout local updates", () => {
    const initial = updateEntry(createReadingNote(source), annotation()).replace(/\n/g, "\r\n");
    const edited = updateEntry(initial, { ...annotation(), comment: "First\nSecond" }, parseReadingNote(initial).entries[0]!.raw);
    expect(edited.replace(/\r\n/g, "")).not.toContain("\n");
    expect(parseReadingNote(edited).entries[0]!.annotation.comment).toBe("First\r\nSecond");
  });

  it.each([
    ["conflict markers", (text: string) => text + "\n<<<<<<< local\nchanged\n=======\nother\n>>>>>>> remote\n"],
    ["duplicate IDs", (text: string) => text + "\n" + serializeAnnotation(annotation())],
    ["broken boundary", (text: string) => text.replace("%% oa:annotation:end ann-test-001 %%", "")],
    ["orphaned metadata", (text: string) => text.replace(/^%% oa:annotation:.*\n?/gm, "")],
    ["malformed JSON", (text: string) => text.replace('"color":"yellow"', '"color":')],
    ["changed block ID", (text: string) => text.replace("^ann-test-001", "^ann-other")],
    ["unknown color", (text: string) => text.replace('"color":"yellow"', '"color":"purple"')],
    ["unsupported format", (text: string) => text.replace("annotation_schema: 1", "annotation_schema: 9")],
  ])("rejects %s while leaving the original text untouched", (_label, corrupt) => {
    const text = corrupt(updateEntry(createReadingNote(source), annotation()));
    const before = text;
    expect(() => parseReadingNote(text)).toThrow();
    expect(() => updateEntry(text, annotation())).toThrow();
    expect(text).toBe(before);
  });

  it("does not mistake format examples in an ordinary note for its frontmatter", () => {
    const ordinary = "---\ntitle: Notes\n---\n\n```\nannotation_schema: 1\n```";
    expect(isReadingNote(ordinary)).toBe(false);
    expect(() => updateEntry(ordinary, annotation())).toThrow();
  });

  it("changes only the source header on reassociation and preserves identity and user prose", () => {
    const initial = updateEntry(createReadingNote(source), annotation()) + "\nKeep this [[personal link]].";
    const updated = replaceSource(initial, { ...source, path: "Moved/renamed.md" });
    expect(parseReadingNote(updated).source.path).toBe("Moved/renamed.md");
    expect(parseReadingNote(updated).documentId).toBe(parseReadingNote(initial).documentId);
    expect(parseReadingNote(updated).entries[0]!.raw).toBe(parseReadingNote(initial).entries[0]!.raw);
    expect(updated).toContain("Keep this [[personal link]].");
  });

  it("stores all PDF page segments under one ID and rejects invalid geometry", () => {
    const entry = annotation();
    entry.anchor = { kind: "pdf", sourceFingerprint: "sha256-example", segments: [
      { page: 1, quote: "First", rects: [[10, 20, 30, 40]] }, { page: 2, quote: "Second", rects: [[30, 40, 50, 60]] },
    ] };
    const text = updateEntry(createReadingNote({ path: "paper.pdf", type: "pdf" }), entry);
    expect(parseReadingNote(text).entries[0]!.annotation.anchor).toEqual(entry.anchor);
    expect(() => parseReadingNote(text.replace("[10,20,30,40]", "[10,20,0,40]"))).toThrow();
  });
});
