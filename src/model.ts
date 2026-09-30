export const COLORS = ["yellow", "green", "blue", "pink"] as const;
export type Color = (typeof COLORS)[number];
export type Rect = [number, number, number, number];

export interface MarkdownAnchor {
  kind: "markdown";
  // Offsets in the complete rendered-text index, not Markdown source offsets.
  textStart: number;
  prefix: string;
  suffix: string;
}

export interface PdfSegment {
  page: number;
  quote: string;
  rects: Rect[];
}

export interface PdfAnchor {
  kind: "pdf";
  sourceFingerprint: string;
  segments: PdfSegment[];
}

export type Anchor = MarkdownAnchor | PdfAnchor;

export interface Annotation {
  id: string;
  blockId: string;
  color: Color;
  quote: string;
  comment: string;
  anchor: Anchor;
  createdAt: string;
  updatedAt: string;
}

export interface Source {
  path: string;
  type: "markdown" | "pdf";
}

export interface CapturedSelection {
  quote: string;
  anchor: Anchor;
  rect: DOMRect;
}

export interface LocatedAnnotation {
  annotation: Annotation;
  rects: DOMRect[];
}

export interface DocumentAdapter {
  root: HTMLElement;
  capture(selection: Selection): CapturedSelection | null;
  locate(annotation: Annotation): DOMRect[] | null;
  overlayHost?(rect: DOMRect): HTMLElement | null;
  matches(annotation: Annotation, selection: CapturedSelection): boolean;
  refreshLayout(): void;
  scrollTo?(annotation: Annotation): boolean;
  dispose(): void;
}

export function newId(prefix = "ann"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createAnnotation(selection: CapturedSelection, color: Color, comment = ""): Annotation {
  const id = newId();
  const now = new Date().toISOString();
  return { id, blockId: id, color, quote: selection.quote, anchor: selection.anchor, comment, createdAt: now, updatedAt: now };
}
