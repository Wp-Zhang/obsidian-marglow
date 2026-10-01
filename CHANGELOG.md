# Changelog

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
