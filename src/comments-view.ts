import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { AnnotationSession } from "./session";

export const COMMENTS_VIEW = "marglow-comments";

/** Obsidian owns docking, resizing, tabs, and mobile presentation. */
export class CommentsView extends ItemView {
  private session: AnnotationSession | null = null;
  constructor(leaf: WorkspaceLeaf) { super(leaf); }
  getViewType(): string { return COMMENTS_VIEW; }
  getDisplayText(): string { return "Marglow comments"; }
  getIcon(): string { return "message-square"; }

  setSession(session: AnnotationSession | null): void {
    if (this.session === session && this.contentEl.childElementCount) return;
    this.session = session;
    this.contentEl.replaceChildren();
    this.contentEl.classList.add("marglow-comments-view");
    if (session) {
      const source = this.contentEl.ownerDocument.createElement("div");
      source.className = "marglow-comments-source";
      source.textContent = session.source.path;
      this.contentEl.append(source, session.sidebarElement);
    } else {
      const empty = this.contentEl.ownerDocument.createElement("p");
      empty.textContent = "Open a Markdown document in Reading view or a PDF to see its annotations.";
      this.contentEl.append(empty);
    }
  }

  async onClose(): Promise<void> { this.contentEl.replaceChildren(); this.session = null; }
}
