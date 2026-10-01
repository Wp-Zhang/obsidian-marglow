# Marglow

![Marglow — a glowing page and a spark of insight](assets/marglow-banner.png)

English · [简体中文](docs/README.zh-CN.md)

Highlight, underline, and comment on Markdown and PDFs without leaving your reading flow in Obsidian. Marglow keeps your annotations in editable Markdown reading notes while leaving source documents unchanged.

The name combines **margin** and **glow**.

## Status

**0.2.5 is a public beta**, available from [GitHub Releases](https://github.com/Wp-Zhang/obsidian-marglow/releases/tag/0.2.5). Tested on Mac and iOS, including physical iOS device testing. Marglow has passed the official Obsidian Community Plugins review.

## Features

- Background highlights and underlines in four colors, with optional comments.
- Markdown **Reading view**, including selections across formatting and paragraphs.
- Text-selectable PDFs, including selections across pages.
- A native Obsidian **Comments** sidebar with inline editing, timestamps, and navigation between annotations and their cards.
- Overlapping annotations, with distinct selected and hovered states.
- Editable Markdown reading notes, with quotes you can reference using ordinary Obsidian block links.
- Manual reassociation for annotations whose source text has moved or changed.
- Local storage, no network services, and compatibility with your existing Vault sync workflow.

## Screenshots

**Markdown: highlight, underline, and edit comments in the sidebar.**

![Markdown highlights and an underline with inline sidebar comment editing](assets/screenshots/markdown-comments.png)

**PDF: read a paper with your annotations alongside it.** Shown with Vaswani et al., [Attention Is All You Need](https://arxiv.org/abs/1706.03762v5); the comments are demonstration reading notes.

![PDF highlights and underlines in Attention Is All You Need, linked to sidebar comments](assets/screenshots/pdf-comments.png)

## Installation

Requires **Obsidian 1.8.10 or later**. Mac and iOS are the supported platforms for this beta.

### Community Plugins (recommended)

1. Open **Settings → Community plugins → Browse**.
2. Search for **Marglow**, then select **Install** and **Enable**.

The same steps work on Mac and iOS. If Marglow is not visible yet, refresh the plugin list after the directory updates.

### Manual installation

1. Download `marglow-0.2.5.zip` from the [release page](https://github.com/Wp-Zhang/obsidian-marglow/releases/tag/0.2.5) and extract it.
2. Copy `main.js`, `manifest.json`, and `styles.css` from the extracted `marglow/` folder into `<vault>/.obsidian/plugins/marglow/`.
3. Reload Obsidian and enable **Marglow** under **Settings → Community plugins**.

On iOS, transfer the same three files to your Vault’s plugin directory using your file manager or sync workflow, then enable Marglow on the device. Some sync tools do not transfer the hidden `.obsidian/` configuration folder automatically.

### BRAT

With [BRAT](https://github.com/TfTHacker/obsidian42-brat), add `Wp-Zhang/obsidian-marglow` or select `0.2.5` explicitly.

Start in a test Vault. Report problems through [GitHub Issues](https://github.com/Wp-Zhang/obsidian-marglow/issues/new/choose), including app/plugin versions, device, reproduction steps, and a sample with private content removed.

## Use

1. Open a Markdown note in **Reading view** or a PDF with selectable text.
2. Select text and choose a color for a highlight, or use the Underline or Comment tool. You can also activate a toolbar tool before selecting text; click the active tool again to turn it off.
3. Write a comment and save, or click/tap outside to save automatically. Cancel discards the current unsaved edit. On Mac, use `Cmd + Enter` to save and `Esc` to cancel.
4. Click an existing annotation to select it. With the sidebar hidden, its floating tools let you edit it. With the sidebar visible, its matching card is selected and scrolled into view without a popup; edit the comment in its card or change the selected annotation’s color using the toolbar. Choose overlapping entries in the sidebar, or in the floating picker when the sidebar is hidden.
5. Click **Reading notes** (an icon with a count on mobile) to toggle the native **Comments** sidebar. Clicking annotations does not open it automatically. Click a sidebar quote to jump to the source, or comment text to edit in place.

Delete a selected annotation with `Delete`, `Backspace`, or Mac `Cmd + Delete`, or use its trash icon. Deleting an annotation removes both its mark and comment; clearing only the comment keeps the mark. Text inputs retain normal editing shortcuts. Unsaved comments remain available if saving fails.

Annotations that cannot be located remain in the sidebar. Use **Reassociate an annotation** to attach one to replacement text; Marglow does not guess ambiguous locations.

## Reading notes and synchronization

A reading note is created when you save the first annotation. New notes live in the source directory’s ordinary `_marglow/` subfolder:

```text
article.md
paper.pdf
_marglow/
  article.md.annotations.md
  paper.pdf.annotations.md
```

Existing companion notes remain supported in their original locations. Keep one reading note per source.

Use **Marglow: Open reading notes** to edit the Markdown file directly. You can edit comments between their markers and add your own notes outside annotation entries. Keep generated metadata and IDs intact. To delete an entry manually, remove everything from its `oa:annotation:start` marker through the matching `oa:annotation:end` marker.

Saved quotes support ordinary Obsidian block references:

```markdown
[[folder/_marglow/article.md.annotations#^ann-<saved-id>]]
```

Replace the placeholder with the actual block ID from the reading note. Editing or reassociating an annotation keeps its ID; deleting it removes the reference target.

Reading notes are the only persistent annotation store. Marglow never rewrites source Markdown or PDFs. Your sync tool handles file transfer and cross-device conflicts. If a reading note contains conflict markers, duplicate IDs, or damaged metadata, Marglow pauses unsafe writes until the file is repaired. Unrelated notes and handwritten content are preserved.

### Commands

All command names have the `Marglow:` prefix in the command palette.

| Command | Purpose |
| --- | --- |
| Open comments sidebar | Open the native comments tab |
| Open reading notes | Open the current source’s companion Markdown note |
| Open source document | Open the source linked to the current reading note |
| Reassociate an annotation | Choose an entry, select replacement text, then press Reassociate |
| Cancel reassociation | Cancel the pending replacement selection |
| Relink reading notes to a source document | Choose a replacement source of the same type from a reading note |

## Limitations

- Markdown editing views and scanned PDFs without a text layer are not supported.
- Windows has not been verified for this beta.
- Annotations stay in reading notes; they are not embedded into PDFs or source Markdown.
- PDF integration depends on Obsidian’s viewer internals, so host updates may require compatibility fixes.
- Dedicated Copy link and Copy quote actions are not yet available; use block references from the reading note.

## Development

Building requires Node.js 22 or later and the system `zip` command. Node.js is not required to run the plugin.

```sh
npm ci
npm run check        # Type checking, lint, and tests
npm run package      # Installable files in dist/marglow/
```

Install the contents of `dist/marglow/` in a dedicated test Vault using the manual installation steps above. `npm run dev` watches and rebuilds during development.

Numeric version tags trigger GitHub Actions to build, attest, and publish release files. ZIP downloads are for manual installation; Obsidian downloads the three plugin files.

For host integration checks, use `npm run smoke:mac`, `npm run smoke:mobile`, and `npm run smoke:webkit`. See [testing instructions and the device checklist](docs/TESTING.md) for setup and recorded verification, and [AGENTS.md](AGENTS.md) for development principles.

## License

[MIT](LICENSE).
