import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { AnnotationSession } from "./session";
import type { Source } from "./model";
import { ReadingPanel, type ReadingPanelActions } from "./reading-panel";

export const COMMENTS_VIEW = "marglow-comments";

/** Obsidian owns docking, resizing, tabs, and mobile presentation. */
export class CommentsView extends ItemView {
  readonly panel: ReadingPanel;
  constructor(leaf: WorkspaceLeaf, actions: ReadingPanelActions) { super(leaf); this.panel = new ReadingPanel(this.contentEl, actions); }
  getViewType(): string { return COMMENTS_VIEW; }
  getDisplayText(): string { return "Marglow reading notes"; }
  getIcon(): string { return "marglow"; }

  async setContext(source: Source | null, session: AnnotationSession | null): Promise<boolean> {
    this.contentEl.classList.add("marglow-comments-view");
    return this.panel.setContext(source, session);
  }

  async onClose(): Promise<void> { this.panel.dispose(); this.contentEl.replaceChildren(); }
}
