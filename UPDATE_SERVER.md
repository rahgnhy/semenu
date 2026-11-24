# Distributing updates for SE-MENU

SE-MENU ships with a complete automatic update pipeline. This document explains
how to publish a release and how the app consumes it.

---

## The flow

```
startup ──► check manifest ──► compare versions ──► notify ──► download ──► verify SHA-256 ──► install ──► restart
             (every 6 h)        (semver)          (banner)   (resumable)   (published digest)   (NSIS / zip)
```

* Checks run on startup and on a configurable interval (default 6 h), plus a
  periodic wake every 15 minutes while the app is running.
* Downloads are resumable — an interrupted download continues from the bytes
  already on disk.
* Every download is verified against the `sha256` published in the manifest.
  A mismatch discards the file and reports an error.
* Installation uses the NSIS installer silently (`/S`) for installed builds, or
  a detached bootstrap script for unpacked layouts. The app restarts itself.
* User settings live in `%APPDATA%\se-menu\` and are never touched by an update.

---

## Option A — GitHub Releases (recommended)

1. Build the release artifacts:

   ```bash
   npm run dist
   ```

   This produces `dist/semenu-v<version>-Setup.exe` and `dist/semenu-v<version>.exe`
   (portable).

2. Create a GitHub release on your repository with the version as the tag, e.g.
   `v1.2.0`, and attach **both** artifacts.

3. In SE-MENU open **Settings → Updates** and set:

   * Source: **GitHub**
   * Repository: `your-username/your-repository`
   * Channel: **Stable** (or **Beta** to include pre-releases)

4. Press **Check now**. The app queries
   `https://api.github.com/repos/<owner>/<repo>/releases/latest` (stable) or the
   ten most recent releases (beta), picks the newest version and offers the
   download.

No manifest file is required for GitHub mode — the release tag is the version
and the release body is shown as release notes. If GitHub publishes an asset
`digest` (SHA-256), it is used for verification; otherwise the download is
flagged as unverified in the UI.

Asset selection order: `semenu-v*-Setup.exe`, then any `.exe`, then any `.zip`.

---

## Option B — Custom manifest (any static host)

Serve two files from any HTTPS host (GitHub Pages, S3, Cloudflare R2, Netlify,
your own server):

```
https://example.com/se-menu/manifest.json
https://example.com/se-menu/semenu-v1.2.0-Setup.exe
```

`manifest.json`:

```json
{
  "version": "1.2.0",
  "downloadUrl": "https://example.com/se-menu/semenu-v1.2.0-Setup.exe",
  "fileName": "semenu-v1.2.0-Setup.exe",
  "sha256": "5de513bef430f211…",
  "size": 83210000,
  "notes": "What changed in 1.2.0",
  "publishedAt": "2026-11-14T09:00:00Z"
}
```

* `version` — required, `x.y.z` (a leading `v` is accepted).
* `downloadUrl` — required, absolute URL of the installer.
* `sha256` — strongly recommended. Compute it with
  `certutil -hashfile semenu-v1.2.0-Setup.exe SHA256` (Windows) or `sha256sum`
  (Linux/macOS) and paste the hex digest.
* `size` — optional, enables an accurate progress bar and ETA.
* `notes` — release notes shown in the update dialog.

Then set **Source: Custom** and paste the manifest URL into SE-MENU.

A ready-to-edit example lives in
[`config/se-menu-update-manifest.example.json`](config/se-menu-update-manifest.example.json).

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
| Check automatically | Settings → Updates | on, every 6 h |
| Download automatically | Settings → Updates | off (notify only) |
| Release source | Settings → Updates | GitHub Releases |
| Repository | Settings → Updates | — |
| Channel | Settings → Updates | Stable |
| Custom manifest URL | Settings → Updates | — |
| Skipped version | Settings → Updates | none |
| Ping target / interval | Settings → Test page defaults | `1.1.1.1`, 1000 ms |
| Speed test endpoints | Config defaults | Cloudflare |
| Speed test duration | Config defaults | 12 s |
| Background style | Settings → Background | Liquid Glass |
| Background quality | Settings → Background | High |
| UI scale | Settings → Interface | 0.9× |
| Glass transparency / blur | Settings → Interface | 0.075 / 20 px |
