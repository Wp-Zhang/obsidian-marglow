import { COLORS, type Annotation, type Source, type Thought, newId } from "./model";
import { NoteError } from "./note-error";
import { createV2Note, parseV2Note, updateV2Entry, deleteV2Entry } from "./format-v2";

export { NoteError } from "./note-error";

export interface TextRange { start: number; end: number; raw: string }

export interface Entry {
  annotation: Annotation;
  start: number;
  end: number;
  raw: string;
  ranges?: TextRange[];
}

export interface ThoughtEntry { thought: Thought; raw: string; ranges: TextRange[] }
export interface MissingRecord { id: string; kind: "annotation" | "thought"; raw: string; ranges: TextRange[]; missing: string[] }

export interface ReadingNote {
  version: 1 | 2;
  source: Source;
  documentId: string;
  entries: Entry[];
  thoughts: ThoughtEntry[];
  missing: MissingRecord[];
  system?: TextRange;
  title?: string;
  status?: string;
  hasFreeNotes?: boolean;
}

const ID = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const conflict = /^(?:<{7}|={7}|>{7}|\|{7})(?:\s.*)?\r?$/m;

export function readingProperties(text: string): { title?: string; status?: string } {
  const header = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const optional = (key: string) => {
    const matches = [...header.matchAll(new RegExp(`^${key}:[ \\t]*(.*?)\\r?$`, "gm"))];
    if (matches.length > 1) throw new NoteError(`Duplicate ${key} in reading note.`);
    return matches.length ? headerValue(header, key) : undefined;
  };
  return { title: optional("marglow_title"), status: optional("marglow_status") };
}

export function hasFreeWriting(text: string): boolean {
  return !!text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").replace(/^Source:.*$/m, "").replace(/^#{1,6} [^\r\n]*\r?$/gm, "").trim();
}

export function setReadingStatus(text: string, status: "" | "reading" | "read"): string {
  parseReadingNote(text);
  const header = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text)![0];
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const pattern = /^marglow_status:[^\r\n]*(?:\r?\n|$)/m;
  const line = status ? `marglow_status: ${JSON.stringify(status)}${eol}` : "";
  const updated = pattern.test(header) ? header.replace(pattern, line) : header.replace(/\r?\n---(?:\r?\n|$)$/, `${eol}${line}---${eol}`);
  const result = updated + text.slice(header.length);
  parseReadingNote(result);
  return result;
}

export function isReadingNote(text: string): boolean {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
  return header !== undefined && /^annotation_schema:/m.test(header);
}

function headerValue(header: string, key: string): string {
  const matches = [...header.matchAll(new RegExp(`^${key}:[ \\t]*(.*?)\\r?$`, "gm"))];
  if (matches.length !== 1) throw new NoteError(`Missing or duplicate ${key} in reading note.`);
  const raw = matches[0]![1]!;
  if (raw.startsWith('"')) {
    const result: unknown = JSON.parse(raw);
    if (typeof result !== "string") throw new NoteError(`Invalid ${key}.`);
    return result;
  }
  return raw.startsWith("'") && raw.endsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : raw;
}

export function validMetadata(value: unknown): value is Omit<Annotation, "quote" | "comment"> {
  if (!record(value) || typeof value.id !== "string" || !ID.test(value.id) || typeof value.blockId !== "string" || !ID.test(value.blockId)) return false;
  if (value.commentBlockId !== undefined && (typeof value.commentBlockId !== "string" || !ID.test(value.commentBlockId))) return false;
  if (!COLORS.some(color => color === value.color) || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return false;
  if (!Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.updatedAt)) || !record(value.anchor)) return false;
  if (value.style !== undefined && value.style !== "highlight" && value.style !== "underline") return false;
  const anchor = value.anchor;
  if (anchor.kind === "markdown") {
    return Number.isInteger(anchor.textStart) && finite(anchor.textStart) && anchor.textStart >= 0 && typeof anchor.prefix === "string" && typeof anchor.suffix === "string";
  }
  if (anchor.kind !== "pdf" || typeof anchor.sourceFingerprint !== "string" || !anchor.sourceFingerprint || !Array.isArray(anchor.segments) || !anchor.segments.length) return false;
  let previousPage = 0;
  return anchor.segments.every((segment: unknown) => {
    if (!record(segment) || !Number.isInteger(segment.page) || !finite(segment.page) || segment.page <= previousPage || typeof segment.quote !== "string" || !segment.quote.trim() || !Array.isArray(segment.rects) || !segment.rects.length) return false;
    previousPage = segment.page;
    return segment.rects.every((rect: unknown) => Array.isArray(rect) && rect.length === 4 && rect.every(finite) && rect[2]! > rect[0]! && rect[3]! > rect[1]!);
  });
}

function safeText(text: string): string {
  return text.replace(/%%/g, "&#37;&#37;");
}

function plainText(text: string): string {
  return text.replace(/&#37;&#37;/g, "%%");
}

export function createLegacyReadingNote(source: Source): string {
  return `---\nannotation_schema: 1\nannotation_document_id: ${newId("doc")}\nannotation_source: ${JSON.stringify(`[[${source.path}]]`)}\nannotation_source_type: ${source.type}\n---\n\n# Reading notes\n\nSource: [[${source.path}]]\n\n## My notes\n\n\n## Annotations\n`;
}

export function serializeAnnotation(annotation: Annotation, eol = "\n"): string {
  const { quote, comment, ...metadata } = annotation;
  if (!validMetadata(metadata) || !quote.trim()) throw new NoteError("Cannot save an invalid annotation.");
  // Escape percent signs inside hidden JSON so context cannot close an Obsidian comment.
  const json = JSON.stringify(metadata).replace(/%/g, "\\u0025");
  const quoted = safeText(quote).replace(/[\\`*_[\]<>]/g, "\\$&").split(/\r?\n/).map(line => `> ${line}`).join("\n");
  return [
    `%% oa:annotation:start ${annotation.id} %%`, "",
    "%%", "oa:meta", json, "%%", "", quoted, "", `^${annotation.blockId}`, "",
    `%% oa:comment:start ${annotation.id} %%`, "", safeText(comment), "",
    `%% oa:comment:end ${annotation.id} %%`, "", `%% oa:annotation:end ${annotation.id} %%`,
  ].join("\n").replace(/\r?\n/g, eol);
}

export function parseReadingNote(text: string, allowMissingBodies = false): ReadingNote {
  const version = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
  if (version && /^annotation_schema:\s*2\s*$/m.test(version)) return parseV2Note(text, allowMissingBodies);
  try {
    if (conflict.test(text)) throw new NoteError("Resolve the conflict markers in the reading note before editing annotations.");
    const headerMatch = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    if (!headerMatch) throw new NoteError("The companion file is not a Marglow reading note; it will not be overwritten.");
    const header = headerMatch[1]!;
    if (headerValue(header, "annotation_schema") !== "1") throw new NoteError("Unsupported reading-note format version.");
    const documentId = headerValue(header, "annotation_document_id");
    const link = headerValue(header, "annotation_source");
    const type = headerValue(header, "annotation_source_type");
    if (!ID.test(documentId) || !/^\[\[[^\r\n]+\]\]$/.test(link) || (type !== "markdown" && type !== "pdf")) throw new NoteError("Invalid reading-note source metadata.");
    const source: Source = { path: link.slice(2, -2), type };
    const entries: Entry[] = [];
    const ids = new Set<string>();
    const blocks = new Set<string>();
    const marker = /^%% oa:annotation:(start|end) (.*?) %%\r?$/gm;
    let open: { id: string; start: number } | null = null;
    let count = 0;
    for (const match of text.matchAll(marker)) {
      count++;
      const id = match[2]!;
      if (!ID.test(id)) throw new NoteError("Invalid annotation identifier.");
      if (match[1] === "start") {
        if (open) throw new NoteError("Nested or broken annotation boundaries.");
        open = { id, start: match.index };
        continue;
      }
      if (!open || open.id !== id) throw new NoteError("Broken annotation boundaries; no annotations have been deleted.");
      const end = match.index + match[0].replace(/\r$/, "").length;
      const raw = text.slice(open.start, end);
      const metaMatches = [...raw.matchAll(/^%%\r?\noa:meta\r?\n([^\r\n]+)\r?\n%%\r?$/gm)];
      if (metaMatches.length !== 1) throw new NoteError(`Missing or duplicate metadata for ${id}.`);
      const metadata: unknown = JSON.parse(metaMatches[0]![1]!);
      if (!validMetadata(metadata) || metadata.id !== id || metadata.anchor.kind !== source.type) throw new NoteError(`Invalid metadata for ${id}.`);
      if (ids.has(id) || blocks.has(metadata.blockId)) throw new NoteError("Duplicate annotation or block IDs. Resolve the duplicate entries before editing.");
      const commentStart = `%% oa:comment:start ${id} %%`;
      const commentEnd = `%% oa:comment:end ${id} %%`;
      const starts = [...raw.matchAll(new RegExp(`^${commentStart}\\r?$`, "gm"))];
      const ends = [...raw.matchAll(new RegExp(`^${commentEnd}\\r?$`, "gm"))];
      if (starts.length !== 1 || ends.length !== 1 || starts[0]!.index >= ends[0]!.index) throw new NoteError(`Broken comment boundaries for ${id}.`);
      const bodyStart = metaMatches[0]!.index + metaMatches[0]![0].length;
      const body = raw.slice(bodyStart, starts[0]!.index);
      const blockLines = [...body.matchAll(/^\^([a-zA-Z0-9-]+)\r?$/gm)];
      if (blockLines.length !== 1 || blockLines[0]![1] !== metadata.blockId) throw new NoteError(`Missing or changed block ID for ${id}.`);
      const quote = plainText(body.split(/\r?\n/).filter(line => line.startsWith("> ") || line === ">").map(line => line.replace(/^> ?/, "").replace(/\\([\\`*_[\]<>])/g, "$1")).join("\n"));
      if (!quote.trim()) throw new NoteError(`Missing quotation for ${id}.`);
      const comment = plainText(raw.slice(starts[0]!.index + starts[0]![0].length, ends[0]!.index).replace(/^\r?\n\r?\n/, "").replace(/\r?\n\r?\n$/, ""));
      ids.add(id);
      blocks.add(metadata.blockId);
      entries.push({ start: open.start, end, raw, annotation: { ...metadata, quote, comment } });
      open = null;
    }
    const allMarkerLines = text.match(/^%% oa:annotation:.*$/gm)?.length ?? 0;
    if (open || count !== allMarkerLines) throw new NoteError("Broken annotation boundaries; repair the note before editing.");
    // A lone surviving metadata or block marker must not be mistaken for deletion.
    const outside = entries.reduceRight((result, entry) => result.slice(0, entry.start) + result.slice(entry.end), text);
    if (/^oa:meta\r?$|^%% oa:(?:annotation|comment):|^\^ann-[a-zA-Z0-9-]+\r?$/m.test(outside)) throw new NoteError("Orphaned annotation metadata; repair the entry boundaries.");
    return { source, documentId, entries, version: 1, thoughts: [], missing: [], ...readingProperties(text), hasFreeNotes: hasFreeWriting(outside) };
  } catch (error) {
    if (error instanceof NoteError) throw error;
    throw new NoteError("The reading note contains malformed metadata. Its content has been preserved.");
  }
}

export function updateEntry(text: string, annotation: Annotation, expectedRaw?: string): string {
  const note = parseReadingNote(text);
  if (note.version === 2) return updateV2Entry(text, annotation, expectedRaw);
  const entry = note.entries.find(entry => entry.annotation.id === annotation.id);
  if (expectedRaw !== undefined && (!entry || entry.raw !== expectedRaw)) throw new NoteError("This annotation changed while you were editing it. Your input has been kept; reopen the annotation before saving.");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const serialized = serializeAnnotation(annotation, eol);
  const result = entry ? text.slice(0, entry.start) + serialized + text.slice(entry.end) : text + eol + serialized + eol;
  parseReadingNote(result);
  return result;
}

export function deleteEntry(text: string, id: string, expectedRaw: string): string {
  if (parseReadingNote(text).version === 2) return deleteV2Entry(text, id, expectedRaw);
  const entry = parseReadingNote(text).entries.find(entry => entry.annotation.id === id);
  if (!entry || entry.raw !== expectedRaw) throw new NoteError("This annotation changed. Reopen it before deleting.");
  const result = text.slice(0, entry.start) + text.slice(entry.end);
  parseReadingNote(result);
  return result;
}

export function createReadingNote(source: Source): string { return createV2Note(source); }

export function replaceSource(text: string, source: Source): string {
  const note = parseReadingNote(text);
  if (note.source.type !== source.type) throw new NoteError("Cannot change a reading note to a different document type.");
  const headerEnd = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text)![0].length;
  const updatedHeader = text.slice(0, headerEnd).replace(/^annotation_source:.*$/m, `annotation_source: ${JSON.stringify(`[[${source.path}]]`)}`);
  const body = text.slice(headerEnd).replace(`Source: [[${note.source.path}]]`, `Source: [[${source.path}]]`);
  return updatedHeader + body;
}
