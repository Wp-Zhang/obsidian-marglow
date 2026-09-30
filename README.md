# Marglow

English · [简体中文](docs/README.zh-CN.md)

Marglow adds in-place highlights and comments to Markdown and PDF reading in Obsidian. Each source has an editable Markdown reading note in its directory’s `_marglow/` folder; your source document stays unchanged.

The name combines **margin** and **glow**.

## Status

**0.1.8 is an initial development build**, not a Community Plugins release. Mac integration has been checked in Obsidian 1.8.10 using an isolated test Vault. iOS-compatible runtime code and touch controls are included, but **iOS device acceptance is still pending**. PDF integration uses Obsidian viewer internals and may require updates when the host viewer changes.

The Markdown page toolbar stays flush with the top of the reading pane. A persistent page toolbar offers color selection, icon tools for Highlight, Underline, and Comment, and Reading notes. Choose a color before selecting text; activate Highlight to mark subsequent selections, or Comment to write on the next selection. Click the active tool again to turn it off. Floating selection tools remain available.

## Features

- Delete a selected annotation with `Delete`, `Backspace`, or Mac `Cmd + Delete`. Text inputs retain normal editing shortcuts. Cards also show Delete at the bottom right on hover or keyboard focus; touch controls remain visible. Deleting removes the highlight and its comment together.
- Selected annotations have a distinct solid outline; hovering uses a lighter dashed outline.
- A per-document **Comments** sidebar with quotes, comments, bidirectional hover, click-to-jump, and comment editing. Comments opens as a native Obsidian right-sidebar tab beside Outline and Backlinks, and follows the active Markdown/PDF document. Obsidian controls its sizing and mobile drawer.
- Independent background highlights and underlines. Each uses the four colors; the same range can contain one of each without replacing the other. Older entries without a style remain background highlights.
- Four highlight colors and a lightweight comment composer, directly beside a text selection.
- Markdown **Reading view**, including selections across formatting and paragraphs.
- Text-selectable PDFs, with multiple page segments under one annotation and page-attached highlights that follow scrolling, zoom, and rotation.
- Independent overlapping annotations; exact selections reuse an existing annotation of the same style.
- Autosave comments when clicking or tapping outside the composer. Save/cancel buttons, `Cmd + Enter`, and `Esc` are available.
- A companion `_marglow/source.md.annotations.md` or `_marglow/source.pdf.annotations.md` note containing readable quotes, comments, stable block IDs, and hidden positioning metadata.
- Direct comment edits and complete-entry deletions in the companion note reflected in the source view.
- Manual reassociation of unlocated annotations and relinking a reading note to a replacement source.
- Local file validation and updates that preserve handwritten notes and unrelated entries.

Windows, Markdown editing-view annotations, OCR, dedicated Copy link/Copy quote actions, PDF write-back, and advanced annotation dashboards are outside this initial scope.

## Install a development build

Requires Node.js 22 or later for building and Obsidian 1.8.10 or later for running. No Node.js runtime is required inside Obsidian or on iOS.

Packaging also uses the system `zip` command, included with macOS and the Ubuntu CI runner.

```sh
npm ci
npm run check
npm run package
```

Copy the **contents** of `dist/marglow/` into `<your-test-vault>/.obsidian/plugins/marglow/`. The plugin directory must contain `main.js`, `manifest.json`, and `styles.css` directly. Reload Obsidian and enable Marglow under **Settings → Community plugins**.

For iOS, place those same three files in the target Vault's plugin directory using your existing file-management or sync workflow, then enable the plugin on the device. Whether hidden configuration folders are transferred depends on that workflow; Marglow does not configure it. Use a dedicated test Vault for initial verification.

## Use

1. Open a Markdown note in **Reading view**, or open a PDF with a selectable text layer.
2. Select text, then pick a color or choose **Comment**. There is no need to open a reading note first.
3. Write a comment and save explicitly or click/tap outside. Cancel discards the current unsaved edit; saving an empty existing comment keeps its highlight.
4. Click highlighted text to change its color, edit/remove its comment, or delete the annotation. For overlaps, choose an entry from the short list.
5. Open **Comments** to review annotations. Hover either side to identify its counterpart; click its quote to navigate, or click the comment itself to edit directly inside its card. Inline editing supports Save/Cancel, outside-click autosave, and `Cmd + Enter`/`Esc`; failed or stale writes keep the draft. Each card shows its last update time; hover the time for creation and update details. Unlocated entries remain listed.
6. Use the **Reading notes** button or command to open the companion note. Edit comments between their markers, add your own notes outside annotation entries, or remove a complete entry.

Navigation uses verified quotation/context matches. Clicking a sidebar quote loads distant Markdown sections or PDF pages before aligning the annotation. Clicking a source annotation opens the comments tab and scrolls to its card. Ambiguous or missing locations remain unlocated instead of being guessed. Virtual-section and PDF viewer internals stay isolated in their adapters and are checked for compatibility.

New reading notes live in an ordinary `_marglow/` subfolder of each source directory. Root-level sources use `_marglow/` at the Vault root. Source extensions stay in note names to distinguish Markdown from PDF. Existing sidecar notes remain supported and are edited in place. You can move an existing reading note into `_marglow/` through Obsidian; its source metadata keeps the association. Keep one canonical reading note per source.

Reading notes are created only when the first annotation is saved. To delete an entry manually, remove everything from its `oa:annotation:start` marker through the matching `oa:annotation:end` marker. Keep metadata and IDs intact when editing just a comment.

Native references to a saved quote work as ordinary Obsidian block links:

```markdown
[[folder/_marglow/source.md.annotations#^ann-<saved-id>]]
```

Use an actual block ID from the companion note, not the placeholder above. Removing an annotation also removes its block reference target. Other edits and reassociation keep its ID stable.

### Commands

All command names have the `Marglow:` prefix in the command palette.

| Command | Purpose |
| --- | --- |
| Open comments sidebar | Open the native Marglow comments tab |
| Open reading notes | Open the companion note for the current source |
| Open source document | Open the source referenced by the current reading note |
| Reassociate an annotation | Choose an entry, select replacement text in its source, then press Reassociate |
| Cancel reassociation | Cancel the pending replacement selection |
| Relink reading notes to a source document | From a reading note, explicitly choose a replacement source of the same type |

## Data and synchronization

The companion Markdown note is the **only persistent annotation store**. There is no separate JSON database. Source Markdown and PDFs are never rewritten to add annotations or block IDs.

File synchronization and cross-device conflicts belong to your chosen sync tool. Marglow does not implement merging, last-writer arbitration, conflict-copy selection, or deletion tombstones. It reloads current file content and refuses unsafe writes when it finds broken boundaries, malformed metadata, duplicate IDs, or conflict markers. A sync tool can restore older content or produce a structurally invalid merge; resolve that file through your normal workflow.

Do not remove or alter generated metadata to edit a comment. If a note needs repair, open it from the Reading notes button and repair its structure before retrying. An existing unrelated note at the companion filename will not be overwritten.

## Development and verification

```sh
npm run dev          # Watch and rebuild main.js
npm run typecheck    # TypeScript validation
npm test             # Persistence, anchoring, PDF geometry, and UI tests
npm run check        # Type checking and tests
npm run package      # Build installable files in dist/marglow/
npm run smoke:mac    # Actual Obsidian smoke test in an isolated local Vault
```

The Mac smoke test requires Obsidian at `/Applications/Obsidian.app` or an `OBSIDIAN_BIN` executable override. It creates its own application profile and Vault under ignored `dev/`, checks their identity before operating, and closes its own test process afterward. It does not install into or modify a personal Vault.

See [the manual acceptance checklist](docs/TESTING.md) for device-specific verification and [AGENTS.md](AGENTS.md) for development principles. The detailed design document remains local under ignored `dev/` and is not included in Git.

The runtime has no bundled third-party dependencies beyond the Obsidian API supplied by the host. Development references are used for API research only; their code is not shipped.
