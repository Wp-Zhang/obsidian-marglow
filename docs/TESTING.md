# Marglow acceptance checklist

Use a dedicated Vault with synthetic Markdown and PDF material. Never run these checks against a personal Vault. Record the Obsidian version, operating system, device, theme, and outcome when testing.

## Current verification

- Automated checks cover Markdown round trips, direct edits, deletion, local-update preservation, stale-write rejection, malformed files, duplicate IDs, source association, text anchoring, PDF page transforms, cross-page selection, and composer persistence failures.
- Mac smoke checks use actual Obsidian 1.8.10 with a private test profile. The 28 checks exercise visible round color swatches in light/dark themes, persistent page tools, active/hover distinction, native right-sidebar tabs with the Marglow line icon, document switching and focus association, Markdown/PDF persistence, source updates, per-frame PDF scroll alignment, zoom/rotation geometry, plugin reloads, and nonduplicated highlight/underline geometry across italic, linked, and nested styled text.
- iOS physical-device selection, native menus, keyboard placement, and reopening remain unverified until the checklist below is run on a device. A desktop viewport or DOM test is not an iOS acceptance test.

Run `npm run check`, `npm run package`, and, on Mac, `npm run smoke:mac`. The smoke script creates isolated fixtures and checks source-byte preservation before it exits. Inspect its screenshots in the printed local output directory.

## Mobile emulation and browser checks

The scripts verify the isolated Vault identity and that its only installed plugin matches the current built Marglow files, then automatically approve the known English/Chinese author-trust prompt. Approval occurs before waiting for workspace layout readiness, including after an emulation reload. They do not change trust settings in personal Vaults or globally.

For mobile changes, use both layers before requesting a physical-device retest:

1. `npm run smoke:mobile` creates an isolated Vault and enables native `app.emulateMobile(true)`. To use an installed updated Obsidian runtime, set `OBSIDIAN_ASAR` to its cached versioned ASAR file; it is copied into the test profile, never modified. Record the app version printed by the script. Version 1.13.7 was checked for this fix.
2. Install the WebKit test engine with `npx playwright install webkit`, then run `npm run smoke:webkit`. This checks navigation insets, touch event delivery, PDF partial-selection capture, cross-scale rendering and page clipping at a phone viewport. Engine 26.6 was checked for this fix.
3. The WebKit script saves a standalone `safari-fixture.html` under its ignored output directory for a native Safari check. The attempted native Safari launch in this session timed out; it is not recorded as a pass.
4. Physical iOS still needs retesting, especially native selection handles, pinch gestures, floating navigation, keyboard changes and saved annotations reopened on another device. Desktop emulation and Playwright WebKit are not physical iOS acceptance.

For an existing problematic document, optional `OBSIDIAN_TEST_PDF` and `OBSIDIAN_TEST_NOTE` inputs copy it into the isolated mobile test Vault. Source bytes and copied notes are checked unchanged; copied user material and resulting screenshots stay under ignored `dev/`.

## Mac and iOS device checks

- [ ] Check the Markdown toolbar against the top edge before and after scrolling. It has no Comments button; Reading notes opens the native right sidebar for Markdown/PDF without opening a companion-note tab.
- [ ] Verify Highlight/Underline/Comment icons and accessible labels. Save both styles on the same range in Markdown/PDF; reselecting reuses the same style, and underlines survive reload, zoom, rotation and scrolling.
- [ ] Check the inline editor has one Save/Cancel action row and an accessible message-with-cross icon that clears only the comment, keeping its highlight and ID. Edit a comment in its sidebar card, then test outside-click autosave, cancel, keyboard shortcuts, a failed/stale write, and source switching; pending input remains visible on failure.
- [ ] Confirm round, visible color swatches in both themes. Choose a color before selecting text, toggle Highlight mode, and start a comment from the page toolbar before selecting text.
- [ ] In a long Markdown/PDF, navigate to unrendered distant targets from the sidebar, then click source highlights with the corresponding cards offscreen. Check heading expansion, rapid target switches, and original source bytes.
- [ ] Select a source highlight or sidebar quote and delete using Delete/Backspace/Cmd + Delete; only its entry disappears. Check the trash icon for deleting the complete annotation, hover/focus visibility, and touch visibility, text inputs, inactive leaves, failed writes, and malformed notes.
- [ ] Click a highlight: its outline and corresponding comment card distinguish it from others. Hover the text and card in both directions, navigate from the card, edit, and verify stable IDs.
- [ ] Check the native Comments tab beside Outline/Backlinks, source switching, workspace restoration, and the iOS drawer; use native sidebar controls to close it, click comment text to edit, verify displayed times and preserved failed drafts, reflects note edits/deletions, and retains unlocated entries.
- [ ] Select Markdown text in Reading view; the action toolbar appears without changing scroll position.
- [ ] Save each highlight color and a multiline comment; dismissing the composer saves, while cancel discards the pending change.
- [ ] On Mac, check `Cmd + Enter` and `Esc`. On iOS, check touch save/cancel controls and native selection handles.
- [ ] Check the composer while the iOS keyboard opens, closes, and changes height; the input and actions stay reachable.
- [ ] Select text across emphasis, links, paragraphs, lists, and table cells. Check partial selections, nested formatting, and wrapped lines: each annotation draws each text region once.
- [ ] Reselect the same range: edit its existing annotation rather than creating a duplicate.
- [ ] Create a smaller overlapping annotation and choose each entry from the overlap list.
- [ ] Save a PDF selection spanning two loaded pages. Check every selected page, not only the first.
- [ ] Zoom, rotate, resize, and scroll PDF pages out of and back into view; highlights follow the selected text.
- [ ] Select across an unloaded page or a PDF without a text layer: no truncated annotation is written.
- [ ] Create notes in `_marglow/` for root and nested sources, including matching Markdown/PDF names. Verify occupied paths are preserved, legacy notes stay canonical, and moving a reading note through Obsidian keeps association and block links.
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

- Distant navigation uses the host’s native virtual-section/PDF APIs and waits for rendering. Missing or ambiguous quotes do not trigger guessed navigation; unsupported viewer versions report a compatibility/loading problem.
- Markdown annotations operate in Reading view. Editor modes retain data but do not show the annotation layer.
- Embedded document selections and formulas are rejected rather than silently assigned to the wrong source.
- PDF fingerprints are content hashes. A replaced PDF marks old anchors unlocated until manually reassociated; it does not automatically rematch changed PDFs.
- When a source is missing, use the relink command from its reading note and then reassociate entries as needed.
- Format validation currently pauses writes to the whole affected reading note. Repair the file before retrying.
- Windows and dedicated Copy link/Copy quote actions are not part of this build.
