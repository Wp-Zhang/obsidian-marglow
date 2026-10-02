# Changelog

## 0.3.0 — Public beta (2026-10-02)

Reading notes now keep editable quotations, comments, and whole-material thoughts in a clean Markdown body, with anchor data at the end of the same file. Native references let you reuse this material across notes.

**Format compatibility:** Install Marglow 0.3.0 or later on every reading device before explicitly upgrading a note to format 2. Legacy notes are never upgraded automatically; conversion provides a preview and a verified original backup. Physical iOS acceptance of this beta remains pending.

- Move Add comment into the annotation footer as an icon and reveal all annotation actions together on hover or keyboard focus; keep touch actions visible without reserving an extra text row.
- Keep floating annotation windows open after color/style changes, retain their dragged position and unsaved comment draft, and advance each save from the committed snapshot for safe repeated edits.
- Simplify the reading sidebar with an icon for opening the note, compact status control, Thoughts/Annotations counts, and timestamp footers with accessible copy/delete icons. Remove the empty-thought explanation and redundant filename extensions/path text.
- Let users drag floating comment editors by their heading, preserving drafts and keeping the window within the viewport; leave inline editors in their cards.
- Size PDF highlights to text-layer run bounds, preserving partial selections, transformed geometry, and exact-selection reuse for legacy anchors.
- Hide annotation paint during native source selection so additional partial annotations remain clear.
- Show comment indicators and safe, multi-paragraph read-only previews on mouse hover.
- Replace empty-comment placeholders with an explicit Add comment action in the sidebar.
- Recolor and switch selected annotations between highlight and underline from the page or floating toolbar without changing IDs/comments; preserve independent same-range records when the target style is already present.
- Keep reading-note bodies editable with quotations, comment callouts, thoughts, and stable IDs; move per-record anchor metadata to the end of the same Markdown file.
- Create a reading note without annotations, and append dated whole-material thoughts without selecting source text.
- Reuse the native sidebar and inline composer for thoughts and comments, including a reading-note context when the source is missing.
- Copy native references containing the source, quotation, and multi-paragraph comment; add a reading-note editor context-menu action.
- Continue reading and writing legacy format 1; explicitly upgrade with a cancelable preview, verified original `.v1.bak` backup, and preserved document/quotation IDs.
- Pause unsafe writes when readable blocks or metadata are missing, and offer explicit missing-record cleanup.
- Add optional reading status, display-title properties, and a user-created reading home with native search or optional Bases table views.
- Preserve native sidebar hover/focus during unchanged refreshes, and keep canceled thought drafts from leaving empty cards or temporary highlights.
- Let WebKit deliver synthesized touch clicks for Save and toolbar actions, retaining the selected passage before toolbar focus changes.
- Validate the new format, local-update preservation, migration failures, native embeds, Mac integration, mobile emulation, and WebKit touch/input behavior. Physical iOS acceptance of this build remains pending.

## 0.2.5 — Public beta 6 (2026-10-01)

- Make Reading notes toggle the native Comments sidebar without opening it automatically when an annotation is clicked.
- Use floating tools for existing annotations while Comments is hidden; select and reveal the corresponding card without a popup while it is visible.
- Let the toolbar recolor the selected annotation in sidebar mode and keep overlapping entries selectable there.
- Keep inline comment editing in the sidebar without navigating away or hiding the mobile drawer.
- Refresh Markdown/PDF README screenshots and add native integration checks for both presentation modes.

## 0.2.4 — Public beta 5 (2026-10-01)

- Build tagged releases in GitHub Actions, attest the exact plugin files and ZIP, and publish those files together.
- Replace deprecated active-leaf access while preserving the Comments sidebar's source association.
- Use Obsidian DOM helpers in the source window for UI and SVG creation.
- Create event cancellation controllers in the source window, avoiding cross-window signal mismatches.
- Add regression checks for window ownership and inert Markdown section parsing; retain native creation only in the windowless template document.
- Keep the optional ZIP for manual installation; Obsidian downloads the three plugin files.

## 0.2.3 — Public beta 4 (2026-10-01)

- Let the native Comments sidebar inherit the theme background, including transparent themes.
- Replace header separators and card borders with spacing and annotation color accents.
- Show the document name above a subdued folder path and simplify the empty state.
- Refresh Markdown/PDF screenshots and streamline English and Chinese usage guides.
- Record the maintainer-confirmed physical iOS test pass, separately from automated and emulation checks.

## 0.2.2 — Public beta 3 (2026-09-30)

- Attach phone Markdown annotation tools directly below native floating navigation.
- Follow the host's navigation visibility and animation timing instead of keeping a separate permanently visible toolbar.
- Reserve initial tool spacing inside the document scroller, eliminating the fixed blank area when navigation hides and preserving scroll position.
- Measure toolbar height for layout and clean up its CSS variable when unloading.
- Check real scroll-triggered hide/restore in Obsidian 1.13.7 mobile emulation, plus WebKit visibility, touch and scroll-stability checks. Physical iOS retesting remains pending.

## 0.2.1 — Public beta 2 (2026-09-30)

- Replace mobile Reading notes text with the Marglow icon and annotation-count badge. Keep all toolbar actions on one row with 44px touch targets.
- Automatically handle author-trust prompts in identity-checked isolated test Vaults before waiting for workspace initialization.
- Reserve the native phone navigation inset for the entire Markdown reading pane, keeping the toolbar reachable and avoiding duplicate content padding.
- Capture single-line PDF text runs with engine-consistent bounding rectangles, avoiding fragment-box inconsistencies under nested transforms.
- Convert screen rectangles into unscaled overlay-host coordinates, and clip PDF overlays to each page rather than its overflowing scroll area.
- Display unique same-page PDF quotations using current text geometry. Existing incorrectly sized cross-device anchors remain unchanged on disk; ambiguous quotations retain their saved geometry.
- Add native Desktop mobile-emulation and WebKit touch/selection regression scripts. The WebKit checks include partial PDF selections and cross-scale display.
- Physical iOS retesting is pending. Emulation and browser checks are recorded separately.

## 0.2.0 — Public beta 1 (2026-09-30)

First public beta, following the private 0.1.x development builds.

- Highlight and underline Markdown Reading view and selectable PDF text in four colors.
- Comment in place, or edit directly in the native right sidebar; navigate between annotations and cards.
- Use Reading notes in the toolbar to open the sidebar without adding a document tab.
- Delete annotations using keyboard shortcuts or the trash icon; clear comments separately while keeping highlights.
- Store quotes, comments, stable block IDs, and anchors in ordinary Markdown notes under `_marglow/`; keep source documents unchanged.
- Support overlapping annotations, cross-page PDF selections, relocation, manual reassociation, external note edits, and guarded local writes.
- Include English/Chinese documentation, UI screenshots, a brand banner, and a native sidebar icon.

Mac integration is tested in isolated Obsidian 1.8.10 Vaults. Physical iOS acceptance remains pending. PDF and virtual Markdown navigation depend on host viewer internals. The beta is not yet listed in Obsidian Community Plugins.
