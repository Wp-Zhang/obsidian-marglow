# Marglow acceptance checklist

Use a dedicated Vault with synthetic Markdown and PDF material. Never run these checks against a personal Vault. Record the Obsidian version, operating system, device, theme, and outcome when testing.

## Current verification

- The 0.3.0 development build, including the annotation UI/UX revision, was checked on 2026-10-02, on macOS 27.0 (arm64). `npm run check` passes 123 tests across 13 files, type checking, and lint with three existing inert-template warnings and no errors. These results cover the local build; they do not imply physical iOS acceptance.
- Window-ownership tests exercise detached helpers and SVG creation in a second document, including the event cancellation controller’s realm. A WebKit 26.6 browser check also confirmed inert section indexing makes no resource requests, executes no scripts, and excludes embedded text. Inert Markdown-section tests verify that embedded/script text does not affect target matching and parsed index nodes never enter the live document.
- Automated checks cover Markdown round trips, direct edits, deletion, local-update preservation, stale-write rejection, malformed files, duplicate IDs, source association, text anchoring, PDF page transforms, cross-page selection, and composer persistence failures.
- Format-2 checks cover independent quote/comment/thought blocks, native references, editable body ownership, local changes that preserve formatting and handwriting, CRLF notes, missing-block review, and explicit legacy upgrades. Store checks cover verified backups, changed previews, stale identities, source disappearance, custom/moved notes, retry safety, and occupied paths.
- Mac smoke checks use actual Obsidian 1.8.10 with a private test profile. The 45 checks exercise visible round color swatches in light/dark themes, persistent page tools, active/hover distinction, native right-sidebar tabs with the Marglow line icon, document switching and focus association, Markdown/PDF persistence, source updates, per-frame PDF scroll alignment, zoom/rotation geometry, plugin reloads, and nonduplicated highlight/underline geometry across italic, linked, and nested styled text. Reading-workflow checks cover no-selection thoughts, optional status, multi-paragraph native embeds and their external updates, reading-note editor context, cancelable upgrades with verified backups, the native-search reading home, and thoughts after source removal. UI checks cover hover previews and indicators, native selection inside a mark, floating-editor dragging and resize bounds, color/style edits with the sidebar closed, explicit Add comment, target-style collisions, and three tightly spaced PDF lines without overlapping paint. Legacy PDF identity tests also cover repeated same-page quotations without guessing another occurrence. Floating-editor checks additionally verify that repeated color/style writes retain the window, position, and unsaved text; the store returns the exact committed snapshot and still rejects subsequent external edits. Sidebar checks verify compact headers, no empty-thought paragraph, an icon-only Add comment action, and unified action-group visibility on hover/keyboard focus without layout shifts. Mouse selection alone does not keep the icons visible.
- Physical iOS acceptance of 0.3.0 is **pending**. The maintainer reported that the earlier 0.2.5 build passed physical iOS testing on 2026-10-01; device model, iOS version, Obsidian version, and individual outcomes were not supplied. This historical result does not validate the new workflow.

Run `npm run check`, `npm run package`, and, on Mac, `npm run smoke:mac`. The smoke script creates isolated fixtures and checks source-byte preservation before it exits. Inspect its screenshots in the printed local output directory.

The final 0.3.0 Mac report is under ignored `dev/smoke-tnWZut/`; the reading sidebar, synthesis, and comment-preview screenshots are copied into `assets/screenshots/` for both READMEs. `npm run verify:release` also passes for the packaged 0.3.0 files.

## Mobile emulation and browser checks

The scripts verify the isolated Vault identity and that its only installed plugin matches the current built Marglow files, then automatically approve the known English/Chinese author-trust prompt. Approval occurs before waiting for workspace layout readiness, including after an emulation reload. They do not change trust settings in personal Vaults or globally.

For mobile changes, use both layers before requesting a physical-device retest:

1. `npm run smoke:mobile` creates an isolated Vault and enables native `app.emulateMobile(true)`. To use an installed updated Obsidian runtime, set `OBSIDIAN_ASAR` to its cached versioned ASAR file; it is copied into the test profile, never modified. Record the app version printed by the script. Obsidian 1.13.7 passed for 0.3.0: native navigation hide/restore, unchanged viewport/scroll offsets, sidebar editing, selected-annotation recoloring/style switching with stable IDs, thought save/cancel/copy, optional status, reachable 44px save controls at a reduced viewport, and the actual Bases reading-home table showing the saved note and status. The current report is under ignored `dev/smoke-L6TrJN/`.
2. Install the WebKit test engine with `npx playwright install webkit`, then run `npm run smoke:webkit`. WebKit 26.6 passed thirteen check dimensions for 0.3.0 at a 402×874 touch viewport, including navigation insets, touch event delivery, PDF partial-selection capture and text-run bounds, four-scale geometry, clipping, whole-material input, reduced-height controls, retained failed drafts and retries, creating a highlight with a toolbar tap, changing a selected annotation's color/style while retaining its ID, and repeated touch appearance changes with the popup and draft retained. Mouse dragging in the phone viewport also checks floating-editor draft retention and resize bounds; physical iOS touch dragging remains pending. The current report is under ignored `dev/webkit-l59aSP/`.
3. The WebKit script saves a standalone `safari-fixture.html` under its ignored output directory for a native Safari check. Native Safari was not checked for 0.3.0. An earlier attempted native Safari launch timed out and is not recorded as a pass.
4. Repeat physical iOS checks after affected mobile changes, especially native selection handles, pinch gestures, floating navigation, keyboard changes, and saved annotations reopened on another device. Desktop emulation and Playwright WebKit do not replace physical iOS acceptance.

For an existing problematic document, optional `OBSIDIAN_TEST_PDF` and `OBSIDIAN_TEST_NOTE` inputs copy it into the isolated mobile test Vault. Source bytes and copied notes are checked unchanged; copied user material and resulting screenshots stay under ignored `dev/`.

## Mac and iOS device checks

Use this checklist for future regression runs. Unchecked boxes below are not a record of failures or the individual outcomes of the historical maintainer-reported iOS pass.

- [ ] Add, edit, cancel, and delete whole-material thoughts without selecting text. Verify dated records, stable IDs, outside-click save, and retained input after failure, including with the physical iOS keyboard visible.
- [ ] Drag a floating comment editor by its heading with mouse and touch, including after keyboard/viewport changes; verify unchanged source scroll, retained drafts, reachable controls, and fixed inline editors.
- [ ] Hover a commented Markdown/PDF mark to show its read-only preview, move into that preview, then select source text. Verify the indicator, clear native selection, and absence of accidental editing or writes.
- [ ] Select a saved annotation and change color/style with the sidebar open and closed. Verify stable IDs/comments, and preservation of both entries when the target style already exists on that range.
- [ ] Check tightly spaced PDF text, partial selections, zoom, page rotation, and cross-page marks; highlighter blocks should use text-run bounds and avoid stacking the same region.
- [ ] Check a card without a comment: no empty placeholder or editor appears until Add comment is selected.
- [ ] Copy a quote/comment or thought reference, paste into another note, and verify full multi-paragraph embeds and later edits. Check clipboard access on physical iOS.
- [ ] Open the complete format-2 note in the native editor. Edit body text while preserving IDs and system data; recolor an annotation and verify unrelated writing and callout formatting remain unchanged.
- [ ] Cancel an upgrade preview, then upgrade a legacy copy. Verify the original `.v1.bak`, original quotation IDs and links, comments, and handwriting. Upgrade all reading devices before adopting format 2.
- [ ] Delete only part of a record in a test copy. Verify writes pause and explicit missing-record review or repair restores a valid note without guessing deleted content.
- [ ] Create a reading home on request. Check native search on Obsidian 1.8.10 and Bases All/Reading/Read views on 1.9+ with Bases enabled; opening material does not create notes or change status.

- [ ] Check the Markdown toolbar against the top edge before and after scrolling. It has no Comments button; Reading notes toggles the native right sidebar for Markdown/PDF without opening a companion-note tab. Clicking an existing mark leaves it closed and shows floating tools; while open, it reveals the card without a popup. Verify recoloring from the toolbar and overlapping-entry choice in both modes.
- [ ] Verify Highlight/Underline/Comment icons and accessible labels. Save both styles on the same range in Markdown/PDF; reselecting reuses the same style, and underlines survive reload, zoom, rotation and scrolling.
- [ ] Check the inline editor has one Save/Cancel action row and an accessible message-with-cross icon that clears only the comment, keeping its highlight and ID. Edit a comment in its sidebar card without source navigation or closing the mobile drawer, then test outside-click autosave, cancel, keyboard shortcuts, a failed/stale write, and source switching; pending input remains visible on failure.
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
