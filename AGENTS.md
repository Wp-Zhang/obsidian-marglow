# Marglow Development Guidelines

Marglow is an Obsidian plugin for highlighting and commenting on Markdown and PDF documents. The project has an initial development build; distinguish implemented behavior, automated checks, and remaining device verification.

## Core Design Principles

1. **Keep reading uninterrupted.** Users should select text, highlight or comment in place, and continue reading without opening or maintaining another note first. Preserve selection and scroll position throughout the interaction.
2. **Use a consistent interaction model.** Markdown and PDF share annotation actions, colors, and comment behavior. Adapt their presentation to mouse and touch input without changing the underlying model.
3. **Stay local first.** The plugin itself does not call network services. Annotation data belongs to the user's local Vault and remains readable by ordinary tools and scripts.
4. **Preserve source documents.** Never rewrite source Markdown, insert block IDs into it, or write annotation objects into a PDF as part of the MVP.
5. **Treat Markdown reading notes as the single source of truth.** Store readable quotations, comments, stable identifiers, and necessary anchor metadata in one companion Markdown note beside each source document. Do not maintain a separate JSON annotation store or allow caches to override the note.
6. **Remain independent of synchronization tools.** File transport, cross-device merging, conflict copies, and version selection belong to the user's existing sync tool. Do not implement provider-specific integrations, cross-device merge algorithms, timestamp arbitration, deletion tombstones, or sync version caches.
7. **Keep the MVP focused.** Prioritize creating, displaying, editing, deleting, and relocating highlights and comments. Avoid adding collaboration, AI workflows, advanced dashboards, or unrelated knowledge-management features.
8. **Keep the design and code architecture simple and elegant.** Prefer clear responsibilities, small cohesive modules, direct data flow, and the fewest abstractions needed for current requirements. Avoid speculative extensibility, unnecessary layers, and overengineering. Simplicity must preserve correctness and user data.

## MVP Scope

- Ship on **Mac and iOS** first. Windows is a later extension.
- Support Markdown **Reading view** and text-selectable PDFs, including cross-page selections. Markdown editing views and OCR are outside the MVP.
- A single annotation consists of a background highlight or underline and an optional comment. Treat styles as independent categories; exact-selection reuse applies within a category. Older entries without a style remain background highlights. Adding or removing a comment keeps the annotation and block IDs stable; removing a comment keeps the highlight.
- Reuse an annotation for the exact same source selection. Allow partially overlapping annotations and let users choose which one to edit.
- Save comments when users click or tap outside the composer. Provide visible save and cancel controls on iOS; support `Cmd + Enter` and `Esc` on Mac. Keep unsaved input when persistence fails.
- Reflect direct comment edits in the companion note. Deleting a complete annotation entry removes its highlight; clearing only its comment preserves the highlight.
- Preserve unlocated annotations and support manual reassociation without changing their IDs. Do not guess an ambiguous location.
- Distinguish selected annotations from hovered and idle annotations. Keep the per-document Comments sidebar linked to Markdown/PDF highlights, with safe navigation, inline card editing, and retained unlocated entries. Use a native Obsidian right-sidebar view; let the host manage docking and mobile drawers instead of placing an overlay inside the document.
- Use stable native block references in the companion reading note. Dedicated Copy link and Copy quote actions remain future work.

## Architecture and Data Integrity

- Separate annotation UI, the Markdown adapter, the PDF adapter, companion-note storage, and source association through clear boundaries. Do not create a separate sync subsystem.
- Isolate PDF viewer internals and DOM dependencies inside the PDF adapter. Verify host compatibility instead of silently saving incomplete selections or unreliable coordinates.
- Use Obsidian and browser-compatible APIs. Do not make Electron or Node-only capabilities runtime dependencies on iOS.
- Store PDF geometry in page coordinates and represent cross-page annotations with multiple page segments under one annotation ID.
- Map rendered Markdown selections to source content carefully. Validate anchors against quotations and context; preserve the entry if reliable relocation fails.
- Update only the relevant annotation entry against current file content. Preserve user-written notes, unrelated entries, formatting, and stable IDs. Do not regenerate or reorder the whole note on load.
- Reload and validate notes after external changes. Report conflict markers, duplicate IDs, malformed metadata, and broken entry boundaries; preserve the original file and pause unsafe writes. Do not interpret parsing failure as deletion.
- Retain reading notes when their source disappears. Handle renames, moves, and replacements without overwriting unrelated files or guessing source identity.

## Local Design Material

Complete design documents and development scratch material belong in the local `dev/` directory. The entire directory is ignored by Git; do not commit its contents or add document-specific ignore rules.

Consult local design documents when they are available. Keep these tracked principles and the README aligned with confirmed product decisions so a fresh clone remains understandable without local-only files.

The root README is English by default. Maintain its Chinese counterpart in `docs/README.zh-CN.md`, with working language links and equivalent setup, capability, and limitation information.

## Verification

Verify the behavior affected by each change, especially persistence, source preservation, external file updates, selection geometry, and iOS interactions. Use a dedicated test Vault rather than a personal Vault. Add meaningful checks for data-sensitive behavior without creating tests that merely repeat the implementation.

Before implementation, validate PDF selection and rendering behavior on Mac and iOS, Markdown Reading-view anchoring, and companion-note parsing and local updates. Keep build and test instructions truthful; do not invent commands before the toolchain exists.
