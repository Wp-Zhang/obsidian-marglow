import type { Annotation, Source } from "../src/model";

export const source: Source = { path: "Research/article.md", type: "markdown" };

export function annotation(id = "ann-test-001"): Annotation {
  return { id, blockId: id, color: "yellow", quote: "A meaningful passage.", comment: "My thought.",
    anchor: { kind: "markdown", textStart: 7, prefix: "Before ", suffix: " After" },
    createdAt: "2026-09-30T02:00:00Z", updatedAt: "2026-09-30T02:00:00Z" };
}
