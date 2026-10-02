import { describe, expect, it } from "vitest";
import { createReadingNote, createLegacyReadingNote, deleteEntry, parseReadingNote, replaceSource, updateEntry, setReadingStatus } from "../src/format";
import { deleteThought, recordReference, removeMissingRecord, updateThought, upgradeReadingNote } from "../src/format-v2";
import { createThought } from "../src/model";
import { annotation, source } from "./helpers";

describe("editable reading notes", () => {
  it("preserves manually formatted body blocks when only a highlight color changes", () => {
    const text = updateEntry(createReadingNote(source), annotation()).replace('[!note] My comment', '[!tip]- My own title');
    const entry = parseReadingNote(text).entries[0]!;
    const result = parseReadingNote(updateEntry(text, { ...entry.annotation, color: 'pink' }, entry.raw)).entries[0]!;
    expect(result.ranges![0]!.raw).toBe(entry.ranges![0]!.raw);
    expect(result.ranges![1]!.raw).toBe(entry.ranges![1]!.raw);
    expect(result.annotation.color).toBe('pink');
  });

  it("does not mistake an empty optional property for the next header line", () => {
    const text = createReadingNote(source).replace('annotation_source:', 'marglow_status:\nannotation_source:');
    const note = parseReadingNote(text);
    expect(note.status).toBe(''); expect(note.source.path).toBe(source.path);
    const updated = setReadingStatus(text, 'read');
    expect(parseReadingNote(updated).status).toBe('read'); expect(parseReadingNote(updated).source.path).toBe(source.path);
  });

  it("preserves unrecognized optional status and unknown user properties until an explicit change", () => {
    const text = createReadingNote(source).replace('annotation_source:', 'marglow_status: paused\nmy_own_property: preserve-me\nannotation_source:');
    expect(parseReadingNote(text).status).toBe('paused');
    const updated = setReadingStatus(text, '');
    expect(updated).toContain('my_own_property: preserve-me'); expect(parseReadingNote(updated).status).toBeUndefined();
  });

  it("rejects orphaned metadata fragments even when all readable blocks have disappeared", () => {
    let text = updateEntry(createReadingNote(source), annotation());
    const entry = parseReadingNote(text).entries[0]!;
    for (const range of [...entry.ranges!.slice(0, 2)].sort((a, b) => b.start - a.start)) text = text.slice(0, range.start) + text.slice(range.end);
    text = text.replace(/^marglow:record.*\n/m, '');
    expect(() => parseReadingNote(text)).toThrow(/system data/);
    expect(() => updateEntry(text, annotation())).toThrow();
  });

  it("copies quote-only records without pretending later comments update the pasted reference", () => {
    const text = updateEntry(createReadingNote(source), { ...annotation(), comment: '' });
    const entry = parseReadingNote(text).entries[0]!;
    const reference = recordReference('_marglow/Article.md.annotations.md', source, entry.annotation);
    expect(reference.match(/!\[\[/g)).toHaveLength(1);
    const updated = parseReadingNote(updateEntry(text, { ...entry.annotation, comment: 'Added later.' }, entry.raw)).entries[0]!.annotation;
    expect(updated.commentBlockId).toBe(entry.annotation.commentBlockId);
    expect(reference).not.toContain(updated.commentBlockId);
  });
  it("puts only readable blocks and IDs in the body, and round-trips rich comments", () => {
    const item = { ...annotation(), quote: "A [link] and *stars* %%\nnext > line", comment: "First paragraph.\n\n- [[Another note]]\n- 100%\n%% example %%" };
    const text = updateEntry(createReadingNote(source), item);
    const note = parseReadingNote(text), saved = note.entries[0]!.annotation;
    expect(note.version).toBe(2);
    expect(saved.quote).toBe(item.quote); expect(saved.comment).toBe(item.comment);
    expect(saved.commentBlockId).toMatch(/^comment-/);
    expect(text.slice(0, note.system!.start)).not.toMatch(/oa:|marglow:record|"anchor"/);
    expect(recordReference("_marglow/Article.md.annotations.md", source, saved)).toContain(`#^${saved.commentBlockId}`);
  });

  it("keeps unrelated prose, metadata and body blocks byte-for-byte when a record changes", () => {
    let text = updateEntry(updateEntry(createReadingNote(source), annotation()), annotation("ann-second"));
    text = text.replace("## My notes", "My own heading 世界\n\n## My notes") + "\nA personal ending.\n";
    const note = parseReadingNote(text), second = note.entries[1]!.raw;
    const edited = updateEntry(text, { ...note.entries[0]!.annotation, comment: "A changed comment." }, note.entries[0]!.raw);
    expect(parseReadingNote(edited).entries[1]!.raw).toBe(second);
    expect(edited).toContain("My own heading 世界"); expect(edited.endsWith("\nA personal ending.\n")).toBe(true);
  });

  it("reads external edits without a timestamp change and preserves a cleared comment's ID", () => {
    const initial = updateEntry(createReadingNote(source), annotation());
    const changed = initial.replace("My thought.", "Changed in the native editor.");
    const entry = parseReadingNote(changed).entries[0]!;
    expect(entry.annotation.comment).toBe("Changed in the native editor.");
    const cleared = parseReadingNote(updateEntry(changed, { ...entry.annotation, comment: "" }, entry.raw)).entries[0]!.annotation;
    expect(cleared.id).toBe(entry.annotation.id); expect(cleared.commentBlockId).toBe(entry.annotation.commentBlockId);
    expect(cleared.comment).toBe("");
  });

  it("rejects stale snapshots from either body or metadata and leaves current input untouched", () => {
    const initial = updateEntry(createReadingNote(source), annotation());
    const entry = parseReadingNote(initial).entries[0]!;
    for (const external of [initial.replace("My thought.", "External."), initial.replace('"color":"yellow"', '"color":"pink"')]) {
      expect(() => updateEntry(external, { ...entry.annotation, comment: "Local." }, entry.raw)).toThrow(/changed/);
      expect(() => deleteEntry(external, entry.annotation.id, entry.raw)).toThrow(/changed/);
    }
  });

  it("keeps every other record and both source types unchanged when removing a complete annotation", () => {
    const text = updateEntry(updateEntry(createReadingNote(source), annotation()), annotation("ann-second"));
    const first = parseReadingNote(text).entries[0]!;
    const result = deleteEntry(text, first.annotation.id, first.raw);
    expect(parseReadingNote(result).entries.map(item => item.annotation.id)).toEqual(["ann-second"]);
    expect(result).not.toContain(first.annotation.commentBlockId);
  });

  it("does not interpret missing readable blocks as deletion and allows explicit cleanup", () => {
    const text = updateEntry(createReadingNote(source), annotation());
    const entry = parseReadingNote(text).entries[0]!;
    const range = entry.ranges![0]!;
    const missing = text.slice(0, range.start) + text.slice(range.end);
    expect(() => parseReadingNote(missing)).toThrow(/body missing/);
    expect(() => updateEntry(missing, annotation())).toThrow();
    const damaged = parseReadingNote(missing, true).missing[0]!;
    const repaired = removeMissingRecord(missing, damaged.id, damaged.raw);
    expect(parseReadingNote(repaired).entries).toHaveLength(0);
    expect(repaired).not.toContain(entry.annotation.commentBlockId);
    expect(() => removeMissingRecord(text, damaged.id, damaged.raw)).toThrow(/changed/);
  });

  it("does not interpret IDs in fenced examples as records", () => {
    const template = createReadingNote(source).replace("## My notes", "```md\n^ann-example-only\n%% marglow:system:start %%\n```\n\n## My notes");
    expect(parseReadingNote(updateEntry(template, annotation())).entries).toHaveLength(1);
  });

  it("keeps IDs when body blocks are reordered and source links are renamed", () => {
    const text = updateEntry(updateEntry(createReadingNote(source), annotation()), annotation("ann-second"));
    const entries = parseReadingNote(text).entries;
    const range = entries[0]!.ranges![1]!;
    const without = text.slice(0, range.start) + text.slice(range.end);
    const reordered = without.replace("## My notes", range.raw + "\n## My notes");
    expect(parseReadingNote(reordered).entries[0]!.annotation.comment).toBe(annotation().comment);
    const renamed = replaceSource(reordered, { ...source, path: "Moved/Article.md" });
    expect(parseReadingNote(renamed).entries.map(item => item.annotation.id)).toEqual(entries.map(item => item.annotation.id));
  });

  it.each(["\n", "\r\n"])("preserves line endings for body and footer updates (%j)", eol => {
    const text = updateEntry(createReadingNote(source), annotation()).replace(/\r?\n/g, eol);
    const entry = parseReadingNote(text).entries[0]!;
    const updated = updateEntry(text, { ...entry.annotation, comment: "First\n\nSecond" }, entry.raw);
    const saved = parseReadingNote(updated).entries[0]!.annotation;
    expect(saved.comment).toBe(["First", "", "Second"].join(eol));
    if (eol === "\r\n") expect(updated.replace(/\r\n/g, "")).not.toContain("\n");
    const added = updateThought(updated, { ...createThought(), text: "New thought\n\nSecond paragraph" });
    expect(parseReadingNote(added).thoughts).toHaveLength(1);
    if (eol === "\r\n") expect(added.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("appends thoughts without annotations and preserves previous dates and native references", () => {
    const first = { ...createThought(), text: "My first interpretation.\n\n[[Question]]" };
    const second = { ...createThought(), text: "A later revision." };
    const text = updateThought(updateThought(createReadingNote(source), first), second);
    const note = parseReadingNote(text);
    expect(note.entries).toHaveLength(0); expect(note.thoughts.map(item => item.thought.text)).toEqual([first.text, second.text]);
    expect(recordReference("_marglow/Article.md.annotations.md", source, first)).toContain(`#^${first.id}`);
    const edited = updateThought(text, { ...first, text: "Adjusted." }, note.thoughts[0]!.raw);
    expect(parseReadingNote(edited).thoughts[1]!.raw).toBe(note.thoughts[1]!.raw);
    expect(parseReadingNote(deleteThought(edited, first.id, parseReadingNote(edited).thoughts[0]!.raw)).thoughts).toHaveLength(1);
  });

  it("moves legacy metadata without losing IDs, handwritten prose or comment meaning", () => {
    const old = updateEntry(updateEntry(createLegacyReadingNote(source), annotation()), annotation("ann-second")) + "\nMy personal ending 世界.\n";
    const upgraded = upgradeReadingNote(old), note = parseReadingNote(upgraded);
    expect(note.version).toBe(2); expect(note.documentId).toBe(parseReadingNote(old).documentId);
    expect(note.entries.map(item => item.annotation.blockId)).toEqual(parseReadingNote(old).entries.map(item => item.annotation.blockId));
    expect(note.entries.map(item => item.annotation.comment)).toEqual(parseReadingNote(old).entries.map(item => item.annotation.comment));
    expect(upgraded).toContain("My personal ending 世界."); expect(upgraded.slice(0, note.system!.start)).not.toContain("oa:meta");
    expect(upgradeReadingNote(upgraded)).toBe(upgraded);
  });

  it("preserves handwriting inside legacy entry boundaries instead of discarding unparsed prose", () => {
    let old = updateEntry(createLegacyReadingNote(source), annotation());
    old = old.replace('%% oa:comment:start', 'A personal interpretation beside the quote.\n\n%% oa:comment:start')
      .replace('%% oa:annotation:end', 'An interleaved closing thought.\n\n%% oa:annotation:end');
    const converted = upgradeReadingNote(old);
    expect(converted).toContain('A personal interpretation beside the quote.');
    expect(converted).toContain('An interleaved closing thought.');
    const before = parseReadingNote(old).entries[0]!.annotation, after = parseReadingNote(converted).entries[0]!.annotation;
    expect(after.quote).toBe(before.quote); expect(after.comment).toBe(before.comment); expect(after.blockId).toBe(before.blockId);
  });

  it.each([
    ["duplicate ID", (text: string) => text.replace("^ann-test-001", "^ann-test-001\n\n> Duplicate\n\n^ann-test-001")],
    ["orphan block", (text: string) => text.replace("## My notes", "> Orphan\n\n^thought-orphan\n\n## My notes")],
    ["missing footer", (text: string) => text.replace("%% marglow:system:end %%", "")],
    ["unknown kind", (text: string) => text.replace('"kind":"annotation"', '"kind":"unknown"')],
    ["malformed metadata", (text: string) => text.replace('"color":"yellow"', '"color":')],
    ["duplicate footer", (text: string) => text + "\n%% marglow:system:start %%\n"],
  ])("preserves and refuses writes for %s", (_name, corrupt) => {
    const original = corrupt(updateEntry(createReadingNote(source), annotation()));
    expect(() => parseReadingNote(original)).toThrow(); expect(() => updateEntry(original, annotation())).toThrow();
  });
});
