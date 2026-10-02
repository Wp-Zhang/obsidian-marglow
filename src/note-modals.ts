import { Modal, type App } from "obsidian";

export class UpgradeNoteModal extends Modal {
  constructor(app: App, private before: string, private after: string, private count: number, private upgrade: () => Promise<void>) { super(app); }
  onOpen(): void {
    this.titleEl.textContent = "Upgrade reading note";
    this.contentEl.classList.add("marglow-upgrade-preview");
    const document = this.contentEl.ownerDocument;
    const explanation = document.win.createEl("p");
    explanation.textContent = `Move ${this.count} annotations' metadata to the end, preserve quotations and IDs, and make comments editable and reusable. An original .v1.bak file will be kept. Update Marglow on all reading devices before upgrading.`;
    this.contentEl.append(explanation);
    for (const [label, text] of [["Before", this.before], ["After", this.after]]) {
      const heading = document.win.createEl("h3"); heading.textContent = label!;
      const preview = document.win.createEl("textarea"); preview.readOnly = true; preview.value = text!; preview.setAttribute("aria-label", `${label} upgrade`);
      this.contentEl.append(heading, preview);
    }
    const error = document.win.createEl("p"); error.setAttribute("role", "alert");
    const controls = document.win.createDiv(); controls.className = "marglow-composer-actions";
    const save = document.win.createEl("button"); save.textContent = "Upgrade and keep backup"; save.className = "mod-cta";
    const cancel = document.win.createEl("button"); cancel.textContent = "Cancel"; cancel.addEventListener("click", () => this.close());
    save.addEventListener("click", () => {
      save.disabled = cancel.disabled = true;
      void this.upgrade().then(() => this.close()).catch(reason => { error.textContent = String(reason instanceof Error ? reason.message : reason); }).finally(() => { save.disabled = cancel.disabled = false; });
    });
    controls.append(save, cancel); this.contentEl.append(error, controls);
  }
  onClose(): void { this.contentEl.replaceChildren(); }
}

export class ConfirmNoteRemoval extends Modal {
  constructor(app: App, private id: string, private remove: () => Promise<void>) { super(app); }
  onOpen(): void {
    this.titleEl.textContent = "Remove missing record";
    const document = this.contentEl.ownerDocument;
    const text = document.win.createEl("p"); text.textContent = `Remove the remaining body blocks and metadata for ${this.id}? Its highlight and references will no longer be available. You can instead cancel and repair the reading note.`;
    const error = document.win.createEl("p"); error.setAttribute("role", "alert");
    const remove = document.win.createEl("button"); remove.textContent = "Remove record"; remove.className = "mod-warning";
    const cancel = document.win.createEl("button"); cancel.textContent = "Cancel"; cancel.addEventListener("click", () => this.close());
    remove.addEventListener("click", () => { remove.disabled = cancel.disabled = true; void this.remove().then(() => this.close()).catch(reason => { error.textContent = String(reason instanceof Error ? reason.message : reason); }).finally(() => { remove.disabled = cancel.disabled = false; }); });
    this.contentEl.append(text, error, remove, cancel);
  }
  onClose(): void { this.contentEl.replaceChildren(); }
}

export class ReadingHomeModal extends Modal {
  constructor(app: App, private basesAvailable: boolean, private create: (path: string, bases: boolean) => Promise<void>) { super(app); }
  onOpen(): void {
    this.titleEl.textContent = "Create reading home";
    const document = this.contentEl.ownerDocument;
    const label = document.win.createEl("label"); label.textContent = "Note path";
    const input = document.win.createEl("input"); input.type = "text"; input.value = "Marglow reading.md"; input.setAttribute("aria-label", "Reading home path"); label.append(input);
    const option = document.win.createEl("label");
    const checkbox = document.win.createEl("input"); checkbox.type = "checkbox"; checkbox.disabled = !this.basesAvailable;
    option.append(checkbox, document.createTextNode(" Include a Bases table (requires Obsidian 1.9+ and the Bases core plugin)."));
    const error = document.win.createEl("p"); error.setAttribute("role", "alert");
    const save = document.win.createEl("button"); save.textContent = "Create"; save.className = "mod-cta";
    const cancel = document.win.createEl("button"); cancel.textContent = "Cancel"; cancel.addEventListener("click", () => this.close());
    save.addEventListener("click", () => { save.disabled = cancel.disabled = true; void this.create(input.value, checkbox.checked).then(() => this.close()).catch(reason => { error.textContent = String(reason instanceof Error ? reason.message : reason); }).finally(() => { save.disabled = cancel.disabled = false; }); });
    this.contentEl.append(label, option, error, save, cancel);
  }
  onClose(): void { this.contentEl.replaceChildren(); }
}
