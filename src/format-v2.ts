import { type Annotation, type Source, type Thought, newId } from "./model";
import { validMetadata, parseReadingNote, readingProperties, hasFreeWriting, type ReadingNote, type TextRange } from "./format";
import { NoteError } from "./note-error";

const ID = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/;
const START = "%% marglow:system:start %%";
const END = "%% marglow:system:end %%";
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const eolOf = (text: string) => text.includes("\r\n") ? "\r\n" : "\n";
const safe = (text: string) => text.replace(/%%/g, "&#37;&#37;");
const plain = (text: string) => text.replace(/&#37;&#37;/g, "%%");

/** Preserve offsets while excluding top-level code examples from structural markers. */
function structural(text: string): string {
  let fence: { char: string; count: number } | null = null;
  return text.replace(/[^\n]*(?:\n|$)/g, line => {
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const closing = new RegExp(`^ {0,3}${fence.char}{${fence.count},}\\s*$`).test(line);
      if (closing) fence = null;
      return line.replace(/[^\r\n]/g, " ");
    }
    if (opening) {
      fence = { char: opening[1]![0]!, count: opening[1]!.length };
      return line.replace(/[^\r\n]/g, " ");
    }
    return line;
  });
}

function headerValue(header: string, key: string): string {
  const matches = [...header.matchAll(new RegExp(`^${key}:[ \\t]*(.*?)\\r?$`, "gm"))];
  if (matches.length !== 1) throw new NoteError(`Missing or duplicate ${key}.`);
  const value = matches[0]![1]!;
  if (value.startsWith('"')) {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "string") throw new NoteError(`Invalid ${key}.`);
    return parsed;
  }
  return value.startsWith("'") && value.endsWith("'") ? value.slice(1, -1).replace(/''/g, "'") : value;
}

interface BodyBlock extends TextRange { content: string; callout: boolean }

function bodyBlocks(text: string): Map<string, BodyBlock> {
  const scanned = structural(text);
  const lines = [...text.matchAll(/[^\n]*(?:\n|$)/g)].filter(match => match[0].length);
  const blocks = new Map<string, BodyBlock>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const id = /^\^([a-zA-Z0-9-]+)\r?\n?$/.exec(scanned.slice(line.index, line.index + line[0].length))?.[1];
    if (!id) continue;
    if (blocks.has(id)) throw new NoteError(`Duplicate block ID: ${id}.`);
    let last = i - 1;
    while (last >= 0 && !lines[last]![0].trim()) last--;
    let first = last;
    while (first >= 0 && /^> ?/.test(lines[first]![0])) first--;
    first++;
    // Reserve all IDs, including user blocks, so a managed ID cannot collide.
    if (first > last) {
      blocks.set(id, { start: line.index, end: line.index + line[0].length, raw: line[0], content: "", callout: false });
      continue;
    }
    const contentLines = lines.slice(first, last + 1).map(item => item[0].replace(/\r?\n$/, "").replace(/^> ?/, ""));
    const callout = /^\[![a-zA-Z0-9-]+\][+-]?(?:\s.*)?$/.test(contentLines[0]!);
    if (callout) contentLines.shift();
    const start = lines[first]!.index;
    const end = line.index + line[0].length;
    blocks.set(id, { start, end, raw: text.slice(start, end), content: plain(contentLines.join(eolOf(text))), callout });
  }
  return blocks;
}

function validThought(value: unknown): value is Omit<Thought, "text"> {
  return record(value) && typeof value.id === "string" && ID.test(value.id) && typeof value.blockId === "string" && ID.test(value.blockId) &&
    typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt)) && typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt));
}

export function parseV2Note(text: string, allowMissingBodies = false): ReadingNote {
  try {
    if (/^(?:<{7}|={7}|>{7}|\|{7})(?:\s.*)?\r?$/m.test(text)) throw new NoteError("Resolve conflict markers before editing the reading note.");
    const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
    if (!header || headerValue(header, "annotation_schema") !== "2") throw new NoteError("Unsupported reading-note format version.");
    const documentId = headerValue(header, "annotation_document_id"), link = headerValue(header, "annotation_source"), type = headerValue(header, "annotation_source_type");
    if (!ID.test(documentId) || !/^\[\[[^\r\n]+\]\]$/.test(link) || (type !== "markdown" && type !== "pdf")) throw new NoteError("Invalid reading-note source metadata.");
    const scanned = structural(text);
    const starts = [...scanned.matchAll(/^%% marglow:system:start %%\r?$/gm)], ends = [...scanned.matchAll(/^%% marglow:system:end %%\r?$/gm)];
    if (starts.length !== 1 || ends.length !== 1 || starts[0]!.index >= ends[0]!.index) throw new NoteError("Missing or duplicate system data boundaries. The reading note has been preserved.");
    const systemStart = starts[0]!.index, systemEnd = ends[0]!.index + END.length;
    const system: TextRange = { start: systemStart, end: systemEnd, raw: text.slice(systemStart, systemEnd) };
    const body = text.slice(0, systemStart), blocks = bodyBlocks(body);
    const note: ReadingNote = { version: 2, documentId, source: { path: link.slice(2, -2), type }, entries: [], thoughts: [], missing: [], system };
    const ids = new Set<string>(), blockIds = new Set<string>();
    const metadata = [...system.raw.matchAll(/^%%\r?\nmarglow:record ([a-zA-Z0-9-]+)\r?\n([^\r\n]+)\r?\n%%\r?$/gm)];
    const without = metadata.reduceRight((result, item) => result.slice(0, item.index) + result.slice(item.index + item[0].length), system.raw);
    const unexpected = without.replace(/^%% marglow:system:(?:start|end) %%\r?$/gm, "").replace(/^#{1,6} [^\r\n]*\r?$/gm, "").trim();
    if (unexpected) throw new NoteError("Unrecognized or incomplete system data. The reading note has been preserved.");
    if (/^marglow:record\b/m.test(without) || /^marglow:record\b/m.test(scanned.slice(0, systemStart) + scanned.slice(systemEnd))) throw new NoteError("Broken or misplaced record metadata.");
    for (const item of metadata) {
      const value: unknown = JSON.parse(item[2]!);
      if (!record(value) || value.id !== item[1] || typeof value.id !== "string" || !ID.test(value.id) || ids.has(value.id)) throw new NoteError("Invalid or duplicate record ID.");
      ids.add(value.id);
      if (value.kind !== "annotation" && value.kind !== "thought") throw new NoteError("Unknown reading record type.");
      const kind: "annotation" | "thought" = value.kind === "annotation" ? "annotation" : "thought";
      if (value.kind === "annotation" ? !validMetadata(value) || typeof value.commentBlockId !== "string" || value.anchor.kind !== type : !validThought(value)) throw new NoteError(`Invalid metadata for ${value.id}.`);
      const keys = value.kind === "annotation" ? [value.blockId as string, value.commentBlockId as string] : [value.blockId as string];
      for (const id of keys) {
        if (blockIds.has(id)) throw new NoteError(`Duplicate record block ID: ${id}.`);
        blockIds.add(id);
      }
      const metaStart = systemStart + item.index;
      const metaRaw = item[0].replace(/\r$/, "");
      const meta: TextRange = { start: metaStart, end: metaStart + metaRaw.length, raw: metaRaw };
      const found = keys.map(id => blocks.get(id));
      const ranges = [...found.filter((block): block is BodyBlock => !!block), meta];
      const raw = JSON.stringify(ranges.map(range => range.raw));
      const missing = keys.filter(id => !blocks.has(id));
      if (missing.length) {
        note.missing.push({ id: value.id, kind, ranges, raw, missing });
        if (!allowMissingBodies) throw new NoteError(`Record body missing: ${value.id}. Open the reading note to repair it or confirm removal of the missing record.`);
        continue;
      }
      if (value.kind === "annotation") {
        const quote = found[0]!, comment = found[1]!;
        if (quote.callout || !quote.content.trim() || !comment.callout) throw new NoteError(`Damaged quotation or comment block: ${value.id}.`);
        const annotation = { ...value, quote: quote.content.replace(/\\([\\`*_[\]<>])/g, "$1"), comment: comment.content } as unknown as Annotation;
        note.entries.push({ annotation, start: quote.start, end: quote.end, raw, ranges });
      } else {
        const block = found[0]!;
        if (!block.callout || !block.content.trim()) throw new NoteError(`Damaged thought block: ${value.id}.`);
        note.thoughts.push({ thought: { ...value, text: block.content } as unknown as Thought, raw, ranges });
      }
    }
    for (const id of blocks.keys()) if (/^(?:ann|comment|thought)-/.test(id) && !blockIds.has(id)) throw new NoteError(`Orphaned record block: ${id}.`);
    if (/^oa:meta\r?$|^%% oa:(?:annotation|comment):/m.test(structural(body))) throw new NoteError("Mixed or orphaned legacy annotation data.");
    if (/^\^(?:ann|comment|thought)-/m.test(structural(text.slice(systemEnd)))) throw new NoteError("A reading record is outside the readable body.");
    note.entries.sort((a, b) => a.start - b.start);
    note.thoughts.sort((a, b) => a.ranges[0]!.start - b.ranges[0]!.start);
    Object.assign(note, readingProperties(text));
    const ranges = [...note.entries.flatMap(entry => entry.ranges!.slice(0, 2)), ...note.thoughts.map(entry => entry.ranges[0]!)];
    const outside = [...ranges].sort((a, b) => b.start - a.start).reduce((result, range) => result.slice(0, range.start) + result.slice(range.end), body);
    note.hasFreeNotes = hasFreeWriting(outside) || hasFreeWriting(text.slice(systemEnd));
    return note;
  } catch (error) {
    if (error instanceof NoteError) throw error;
    throw new NoteError("Malformed reading-note metadata. Its content has been preserved.");
  }
}

export function createV2Note(source: Source): string {
  const title = source.path.split("/").pop()!.replace(/\.(?:md|pdf)$/i, "").replace(/[\\`*_[\]<>]/g, "\\$&");
  const text = `---\nannotation_schema: 2\nannotation_document_id: ${newId("doc")}\nannotation_source: ${JSON.stringify(`[[${source.path}]]`)}\nannotation_source_type: ${source.type}\n---\n\n# ${title}\n\nSource: [[${source.path}]]\n\n## My notes\n\n\n## Reading records\n\n${START}\n\n## System data\n\n${END}\n`;
  parseV2Note(text);
  return text;
}

function metaBlock(value: Record<string, unknown>, eol: string): string {
  return ["%%", `marglow:record ${String(value.id)}`, JSON.stringify(value).replace(/%/g, "\\u0025"), "%%"].join(eol);
}
function quoteBlock(text: string, id: string, eol: string): string {
  const quoted = safe(text).replace(/[\\`*_[\]<>]/g, "\\$&").split(/\r?\n/).map(line => `> ${line}`).join(eol);
  return `${quoted}${eol}${eol}^${id}${eol}`;
}
function callout(text: string, title: string, id: string, eol: string): string {
  const body = text ? eol + safe(text).split(/\r?\n/).map(line => `> ${line}`).join(eol) : "";
  return `> [!note] ${title}${body}${eol}${eol}^${id}${eol}`;
}
function editedCallout(raw: string, text: string, id: string, eol: string): string {
  const header = raw.split(/\r?\n/)[0]!;
  const body = text ? eol + safe(text).split(/\r?\n/).map(line => `> ${line}`).join(eol) : "";
  return `${header}${body}${eol}${eol}^${id}${eol}`;
}

function patch(text: string, replacements: { start: number; end: number; value: string }[]): string {
  return [...replacements].sort((a, b) => b.start - a.start).reduce((result, change) => result.slice(0, change.start) + change.value + result.slice(change.end), text);
}
function append(text: string, note: ReadingNote, body: string, metadata: string): string {
  const eol = eolOf(text);
  const result = patch(text, [{ start: note.system!.start, end: note.system!.start, value: body + eol }, { start: note.system!.end - END.length, end: note.system!.end - END.length, value: metadata + eol + eol }]);
  parseV2Note(result);
  return result;
}
function annotationParts(annotation: Annotation, commentId: string, eol: string) {
  const { quote, comment, ...metadata } = annotation;
  const value = { ...metadata, commentBlockId: commentId, kind: "annotation" };
  if (!validMetadata(value) || !quote.trim()) throw new NoteError("Cannot save an invalid annotation.");
  return { bodies: [quoteBlock(quote, annotation.blockId, eol), callout(comment, "My comment", commentId, eol)], meta: metaBlock(value, eol) };
}
export function updateV2Entry(text: string, annotation: Annotation, expectedRaw?: string): string {
  const note = parseV2Note(text), entry = note.entries.find(item => item.annotation.id === annotation.id);
  if (expectedRaw !== undefined && (!entry || entry.raw !== expectedRaw)) throw new NoteError("This annotation changed while you were editing. Your input has been kept.");
  if (entry && (entry.annotation.blockId !== annotation.blockId || (annotation.commentBlockId && annotation.commentBlockId !== entry.annotation.commentBlockId))) throw new NoteError("Annotation block IDs cannot change.");
  const eol = eolOf(text), parts = annotationParts(annotation, entry?.annotation.commentBlockId ?? annotation.commentBlockId ?? newId("comment"), eol);
  if (!entry) return append(text, note, parts.bodies.join(eol), parts.meta);
  const ranges = entry.ranges!;
  const changes = [{ ...ranges[2]!, value: parts.meta }];
  if (annotation.quote !== entry.annotation.quote) changes.push({ ...ranges[0]!, value: parts.bodies[0]! });
  if (annotation.comment !== entry.annotation.comment) changes.push({ ...ranges[1]!, value: editedCallout(ranges[1]!.raw, annotation.comment, entry.annotation.commentBlockId!, eol) });
  const result = patch(text, changes);
  parseV2Note(result);
  return result;
}
export function deleteV2Entry(text: string, id: string, expectedRaw: string): string {
  const entry = parseV2Note(text).entries.find(item => item.annotation.id === id);
  if (!entry || entry.raw !== expectedRaw) throw new NoteError("This annotation changed. Reopen it before deleting.");
  const result = patch(text, entry.ranges!.map(range => ({ ...range, value: "" })));
  parseV2Note(result);
  return result;
}

export function updateThought(text: string, thought: Thought, expectedRaw?: string): string {
  const note = parseReadingNote(text);
  if (note.version !== 2) throw new NoteError("Upgrade this reading note to add whole-material thoughts.");
  if (!validThought(thought) || !thought.text.trim()) throw new NoteError("A thought needs text and a valid identity.");
  const entry = note.thoughts.find(item => item.thought.id === thought.id);
  if (expectedRaw !== undefined && (!entry || entry.raw !== expectedRaw)) throw new NoteError("This thought changed while you were editing. Your input has been kept.");
  if (entry && entry.thought.blockId !== thought.blockId) throw new NoteError("Thought block IDs cannot change.");
  const eol = eolOf(text), { text: body, ...metadata } = thought;
  const date = new Date(thought.createdAt).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const serialized = callout(body, date, thought.blockId, eol), meta = metaBlock({ ...metadata, kind: "thought" }, eol);
  if (!entry) return append(text, note, serialized, meta);
  const result = patch(text, [{ ...entry.ranges[0]!, value: editedCallout(entry.ranges[0]!.raw, body, thought.blockId, eol) }, { ...entry.ranges[1]!, value: meta }]);
  parseV2Note(result);
  return result;
}
export function deleteThought(text: string, id: string, expectedRaw: string): string {
  const entry = parseV2Note(text).thoughts.find(item => item.thought.id === id);
  if (!entry || entry.raw !== expectedRaw) throw new NoteError("This thought changed. Reopen it before deleting.");
  const result = patch(text, entry.ranges.map(range => ({ ...range, value: "" })));
  parseV2Note(result);
  return result;
}
export function removeMissingRecord(text: string, id: string, expectedRaw: string): string {
  const entry = parseV2Note(text, true).missing.find(item => item.id === id);
  if (!entry || entry.raw !== expectedRaw) throw new NoteError("The missing record changed. Review it again before removing it.");
  const result = patch(text, entry.ranges.map(range => ({ ...range, value: "" })));
  parseV2Note(result, true);
  return result;
}

export function upgradeReadingNote(text: string): string {
  const note = parseReadingNote(text);
  if (note.version === 2) return text;
  const eol = eolOf(text), metadata: string[] = [];
  const changes = note.entries.map(entry => {
    const parts = annotationParts(entry.annotation, newId("comment"), eol);
    metadata.push(parts.meta);
    const commentStart = `%% oa:comment:start ${entry.annotation.id} %%`;
    const commentEnd = `%% oa:comment:end ${entry.annotation.id} %%`;
    const start = entry.raw.indexOf(commentStart), end = entry.raw.indexOf(commentEnd) + commentEnd.length;
    // Remove only machine-owned regions. Preserve the original quote block and
    // any handwritten headings/prose interleaved with legacy entry boundaries.
    const withComment = entry.raw.slice(0, start) + parts.bodies[1] + entry.raw.slice(end);
    const value = withComment.replace(/^%%\r?\noa:meta\r?\n[^\r\n]+\r?\n%%\r?$/m, "")
      .replace(/^%% oa:annotation:(?:start|end) [a-zA-Z0-9-]+ %%\r?$/gm, "");
    return { ...entry, value };
  });
  const body = patch(text, changes).replace(/^annotation_schema:.*$/m, "annotation_schema: 2");
  const result = body + eol + START + eol + eol + "## System data" + eol + eol + metadata.join(eol + eol) + eol + eol + END + eol;
  const converted = parseV2Note(result);
  if (converted.documentId !== note.documentId || converted.entries.length !== note.entries.length || note.entries.some((entry, index) => {
    const saved = converted.entries[index]!.annotation;
    return saved.id !== entry.annotation.id || saved.blockId !== entry.annotation.blockId || saved.quote !== entry.annotation.quote || saved.comment !== entry.annotation.comment;
  })) throw new NoteError("The upgrade could not preserve the existing records.");
  return result;
}

export function recordReference(notePath: string, source: Source, entry: Annotation | Thought): string {
  if (/[\r\n#|[\]]/.test(notePath + source.path)) throw new NoteError("This filename cannot be used in a native reference. Rename it before copying a link.");
  const path = notePath.replace(/\.md$/i, "");
  const ids = "quote" in entry ? [entry.blockId, ...(entry.comment ? [entry.commentBlockId] : [])] : [entry.blockId];
  if (ids.some(id => !id || !ID.test(id))) throw new NoteError("Upgrade this reading note before copying its quotation and comment together.");
  return `Source: [[${source.path}]]\n\n` + ids.map(id => `![[${path}#^${id}]]`).join("\n\n");
}
