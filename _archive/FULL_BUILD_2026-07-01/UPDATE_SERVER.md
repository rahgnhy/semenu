# Distributing updates for SE-MENU

SE-MENU ships with a complete automatic update pipeline. This document explains
how to publish a release and how the app consumes it.

---

## The flow

```
startup ──► check manifest ──► compare versions ──► notify ──► download ──► verify SHA-256 ──► install ──► restart
             (every 6 h)        (semver)          (banner)   (resumable)   (published digest)   (NSIS / zip)
```

* Checks run on startup and on a configurable interval (default 6 h).
* Downloads are resumable — an interrupted download continues from the bytes
  already on disk.
* Every download is verified against the `sha256` published in the manifest.
  A mismatch discards the file and reports an error.
* Installation uses the NSIS installer silently (`/S`) for installed builds, or
  a detached bootstrap script for unpacked layouts. The app restarts itself.
* User settings live in `%APPDATA%\SE-MENU\` and are never touched by an update.

---

## Option A — GitHub Releases (recommended)

1. Build the release artifacts:

   ```bash
   npm run dist
   ```

   This produces `dist/se-menu-Setup-<version>.exe` and
   `dist/se-menu-Portable-<version>.exe`.

2. Create a GitHub release on your repository with the version as the tag, e.g.
   `v1.2.0`, and attach **both** artifacts.

3. In SE-MENU open **Updates** (top-right download icon) and set:

   * Source: **GitHub Releases**
   * Repository: `your-username/your-repository`
   * Channel: **Stable** (or **Beta** to include pre-releases)

4. Press **Check for updates**. The app queries
   `https://api.github.com/repos/<owner>/<repo>/releases/latest` (stable) or
   the ten most recent releases (beta), picks the newest version and offers the
   download.

No manifest file is required for GitHub mode — the release tag is the version
and the release body is shown as release notes. If GitHub publishes an asset
`digest` (SHA-256), it is used for verification; otherwise the download is
flagged as unverified in the UI.

Asset selection order: `se-menu-Setup-*.exe`, then `se-menu-Portable-*.exe`, then
any `.exe`, then any `.zip`.

---

## Option B — Custom manifest (any static host)

Serve two files from any HTTPS host (GitHub Pages, S3, Cloudflare Races,
Netlify, your own server):

```
https://example.com/se-menu/manifest.json
https://example.com/se-menu/se-menu-Setup-1.2.0.exe
```

`manifest.json`:

```json
{
  "version": "1.2.0",
  "downloadUrl": "https://example.com/se-menu/se-menu-Setup-1.2.0.exe",
  "fileName": "se-menu-Setup-1.2.0.exe",
  "sha256": "5de513bef430f211…",
  "size": 83210000,
  "notes": "What changed in 1.2.0",
  "publishedAt": "2026-11-12T09:00:00Z"
}
```

* `version` — required, `x.y.z` (a leading `v` is accepted).
* `downloadUrl` — required, absolute URL of the installer.
* `sha256` — strongly recommended. Compute it with
  `certutil -hashfile se-menu-Setup-1.2.0.exe SHA256` (Windows) or
  `sha256sum` (Linux/macOS) and paste the hex digest.
* `size` — optional, enables an accurate progress bar and ETA.
* `notes` — release notes shown in the update dialog.

Then set **Source: Custom manifest** and paste the manifest URL into SE-MENU.

A ready-to-edit example lives in [`config/se-menu-update-manifest.example.json`](config/se-menu-update-manifest.example.json).

---

## Version rules

* Comparison is semantic: `1.10.0 > 1.9.9`, `2.0.0-beta.1 < 2.0.0`.
* A version is offered only when it is strictly newer than the installed one.
* **Skip this version** suppresses a specific release until a newer one appears.
* Beta channel picks the highest version across the ten most recent releases,
  including pre-releases.

---

## Verifying an update pipeline before you publish

`scripts/test-updater.js` stands up a local release server and drives the real
updater through: manifest parsing, version comparison, download, resume after an
interruption, SHA-256 verification and rejection of a corrupted payload.

```bash
node scripts/test-updater.js
```

---

## Settings reference

| Setting | Where | Default |
|---|---|---|
| Check automatically | Updates | on, every 6 h |
| Download automatically | Updates | off (notify only) |
| Release source | Updates | GitHub Releases |
| Repository | Updates | — |
| Channel | Updates | Stable |
| Custom manifest URL | Updates | — |
| Skipped version | Updates | none |
| Ping target / interval | Settings → Updates | `1.1.1.1`, 1000 ms |
| Speed test endpoints | Settings → Updates | Cloudflare |
| Speed test duration | Settings → Updates | 12 s |
