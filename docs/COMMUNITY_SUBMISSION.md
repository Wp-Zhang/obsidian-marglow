# Community submission preparation

Prepared on 2026-09-30; updated on 2026-10-01 for **0.2.3 — Public beta 4** and the maintainer-reported iOS test pass. This document does not assert acceptance into the community directory.

## Submission details

| Field | Value |
| --- | --- |
| Repository | https://github.com/Wp-Zhang/obsidian-marglow |
| Plugin ID | `marglow` |
| Name | Marglow |
| Author | Weipeng Zhang |
| Description | Highlight and comment on Markdown and PDF, with editable local Markdown reading notes. |
| Release tag / manifest version | `0.2.3` |
| Minimum app version | `1.8.10` |
| Desktop only | false; maintainer confirmed physical iOS testing passed on 2026-10-01 |
| License | MIT |
| Release | https://github.com/Wp-Zhang/obsidian-marglow/releases/tag/0.2.3 |

The current official process is the [Obsidian Community directory submission flow](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin). It requires an Obsidian account, linked GitHub account, repository ownership verification, and the author's agreement to developer policies and continued maintenance. No community submission or policy agreement has been made by this preparation task.

## Prepared repository material

- Root MIT `LICENSE`, readable source, manifest, and versions map.
- English README and equivalent Chinese README with installation, capabilities, screenshots, and known limits.
- A published non-prerelease GitHub release with a numeric tag matching the manifest, and individually downloadable `main.js`, `manifest.json`, `styles.css`, plus the installation ZIP.
- Changelog and an issue template for beta feedback.
- CI type checking, official recommended Obsidian lint rules, unit tests, packaging, and release consistency validation.
- Local design and test Vaults remain under ignored `dev/`. They are not published.
- No existing `marglow` ID or Marglow name was found in the official GitHub community-plugin list on the preparation date; the directory must confirm uniqueness when submitted.

## Verification and review notes

- Type check passed; 74 automated tests passed.
- 28 checks passed in actual Obsidian 1.8.10 using an isolated Mac test Vault, including source-byte preservation and reload cleanup.
- Release metadata, built files, archive, and absence of Node/Electron runtime dependencies validated by `npm run verify:release`.
- Official `eslint-plugin-obsidianmd` recommended configuration: **0 errors, 52 warnings**. Warnings consist of 44 preferences for Obsidian DOM helpers, five deprecated API references, two sentence-case suggestions, and one inert-template HTML assignment. They remain visible in `npm run lint`; they are not presented as scanner approval.
- UI uses owner-document browser DOM creation to preserve document/window ownership and keep isolated tests independent of host DOM extensions.
- Virtual Markdown section HTML is read into an inert template only, never mounted or executed. A narrowly explained `no-unsanitized/property` exception covers this native-viewer index; the official HTML advisory remains visible for review. Icon creation uses explicit SVG DOM nodes.
- PDF and Markdown virtual-section dependencies are isolated in their adapters. Changes in the host can require adaptation. No OCR or editor-mode annotation support is claimed.
- The maintainer confirmed physical iOS testing passed on 2026-10-01. Device and app versions and individual checklist outcomes were not supplied; see [TESTING.md](TESTING.md) for the verification record and future regression checklist.
- No runtime networking, telemetry, ads, paid access, external accounts, or access outside the Vault. Existing sync tools handle transport and conflicts; Marglow has no sync subsystem.
- Reads and local entry updates preserve original source files and unrelated companion-note content. Malformed/ambiguous files stop unsafe writes.

## Author's final submission steps

1. Include the recorded Mac and maintainer-reported iOS verification results; record device/app versions in future device runs and address any new blocking failures.
2. Sign in at https://community.obsidian.md and connect the repository owner's GitHub account.
3. Choose **Plugins → New plugin**, supply the repository URL above, and select the owner.
4. Review the [developer policies](https://docs.obsidian.md/community-directory/developer-policies), [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), and maintenance commitment before agreeing and submitting.
5. Read the directory's automated review results and resolve blockers. The directory did not recognize 0.2.3 while its GitHub release was marked prerelease. That flag was removed for distribution; the release remains labeled Public beta, with the same verified tag and assets.

No legacy `obsidian-releases` pull request is prepared: the current official submission guide routes new entries through the community website.

## Future release procedure

1. Update `manifest.json`, `package.json`, lockfile, `versions.json`, changelog, and both READMEs.
2. Run `npm ci`, `npm run check`, `npm run package`, `npm run verify:release`, and affected Mac/device checks.
3. Commit and push; tag that exact commit with the numeric manifest version (no `v` prefix).
4. Attach the three built plugin files separately to a GitHub release with that tag, optionally adding the ZIP. For community distribution, publish a non-prerelease release. A Public beta title can still describe product maturity; reserve GitHub prereleases for BRAT-only testing.
5. Download the published files and compare their hashes with the locally verified build.

## Mobile follow-up

A phone toolbar inset issue and cross-device PDF geometry issue reported by the user were addressed. Desktop 1.13.7 native mobile emulation and Playwright WebKit 26.6 checks passed. A copied problematic PDF and reading note were tested without changing their bytes. The latest public beta is 0.2.3. The maintainer confirmed physical iOS testing passed on 2026-10-01.

## Release visibility correction (2026-10-01)

The community submission reported "No release matches your manifest version" despite matching `0.2.3` manifest and tag. The release was marked prerelease, and GitHub's latest-release endpoint returned 404. The prerelease flag was removed without changing the version, tag, title, or assets. Request a new scan in the community directory; directory acceptance remains unconfirmed until its review completes.
