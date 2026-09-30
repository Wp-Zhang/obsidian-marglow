# Marglow acceptance checklist

Use a dedicated Vault with synthetic Markdown and PDF material. Never run these checks against a personal Vault. Record the Obsidian version, operating system, device, theme, and outcome when testing.

## Current verification

- Automated checks cover Markdown round trips, direct edits, deletion, local-update preservation, stale-write rejection, malformed files, duplicate IDs, source association, text anchoring, PDF page transforms, cross-page selection, and composer persistence failures.
- Mac smoke checks use actual Obsidian 1.8.10 with a private test profile. The 15 checks exercise visible round color swatches in light/dark themes, persistent page tools, Markdown/PDF persistence, source updates, zoom/rotation geometry, and plugin reloads.
- iOS physical-device selection, native menus, keyboard placement, and reopening remain unverified until the checklist below is run on a device. A desktop viewport or DOM test is not an iOS acceptance test.

Run `npm run check`, `npm run package`, and, on Mac, `npm run smoke:mac`. The smoke script creates isolated fixtures and checks source-byte preservation before it exits. Inspect its screenshots in the printed local output directory.

## Mac and iOS device checks

- [ ] Confirm round, visible color swatches in both themes. Choose a color before selecting text, toggle Highlight mode, and start a comment from the page toolbar before selecting text.
- [ ] Select Markdown text in Reading view; the action toolbar appears without changing scroll position.
- [ ] Save each highlight color and a multiline comment; dismissing the composer saves, while cancel discards the pending change.
- [ ] On Mac, check `Cmd + Enter` and `Esc`. On iOS, check touch save/cancel controls and native selection handles.
- [ ] Check the composer while the iOS keyboard opens, closes, and changes height; the input and actions stay reachable.
- [ ] Select text across emphasis, links, paragraphs, lists, and table cells.
- [ ] Reselect the same range: edit its existing annotation rather than creating a duplicate.
- [ ] Create a smaller overlapping annotation and choose each entry from the overlap list.
- [ ] Save a PDF selection spanning two loaded pages. Check every selected page, not only the first.
- [ ] Zoom, rotate, resize, and scroll PDF pages out of and back into view; highlights follow the selected text.
- [ ] Select across an unloaded page or a PDF without a text layer: no truncated annotation is written.
- [ ] Close and reopen the source and Obsidian; IDs and locations survive.
- [ ] Insert text before a Markdown quotation; its annotation relocates. Remove or ambiguously duplicate the quotation; its entry is retained without an incorrect highlight.
- [ ] Use Reassociate an annotation, choose replacement text, and confirm the ID, comment, and color remain stable.
- [ ] Add handwritten notes, directly edit a comment, clear the comment, and delete a complete entry; verify the corresponding source behavior and preserved handwritten content.
- [ ] Follow a native block link to the companion quotation; ordinary comment edits and reassociation do not break its ID.
- [ ] Rename/move the source, remove it, and explicitly relink the companion to a replacement source; no notes or user prose disappear.
- [ ] Introduce duplicate IDs, conflict markers, and broken boundaries in a copy of a reading note; the file is preserved and unsafe writes stop.
- [ ] Change a note while its composer is open; saving the stale entry fails and keeps the input.
- [ ] Change the active source while the composer is open. Check successful autosave and retained input after a simulated failed write.
- [ ] Disable and reload the plugin; UI and listeners are cleaned up, while reading notes remain usable.
- [ ] Confirm source Markdown/PDF bytes are unchanged by annotation operations.

## External file updates

On two test devices, use the chosen sync tool to change different annotations, the same annotation, and deletion versus editing. Verify that Marglow reads the resulting file correctly or reports structural problems without overwriting them. The sync tool owns the conflict outcome; these checks do not assert a particular merge strategy.

## Known boundaries

- Markdown annotations operate in Reading view. Editor modes retain data but do not show the annotation layer.
- Embedded document selections and formulas are rejected rather than silently assigned to the wrong source.
- PDF fingerprints are content hashes. A replaced PDF marks old anchors unlocated until manually reassociated; it does not automatically rematch changed PDFs.
- When a source is missing, use the relink command from its reading note and then reassociate entries as needed.
- Format validation currently pauses writes to the whole affected reading note. Repair the file before retrying.
- Windows and dedicated Copy link/Copy quote actions are not part of this build.
