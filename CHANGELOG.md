# Changelog

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
