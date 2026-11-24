'use strict';

/**
 * updater.js — version management and automatic update pipeline.
 *
 * Supports two release sources:
 *   mode "github" — a GitHub repository's Releases (stable = /releases/latest,
 *                   beta = highest semver across the last 10 releases).
 *   mode "custom" — any URL serving a JSON manifest:
 *                   { version, downloadUrl, sha256, notes, fileName, publishedAt }
 *
 * Pipeline: check -> download (resumable, progress) -> sha256 verify -> install.
 * Installed apps update via the NSIS installer (/S); unpacked layouts update
 * from a .zip using a detached bootstrap script. User configuration lives in
 * Electron's userData directory and is never touched by an update.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const DEFAULT_UPDATE_CONFIG = {
  mode: 'github',            // 'github' | 'custom'
  githubRepo: 'rahgnhy/semenu',            // owner/repo
  channel: 'stable',         // 'stable' | 'beta'
  customManifestUrl: '',     // full URL to a JSON manifest
  autoCheck: true,
  autoDownload: true,
  checkIntervalHours: 6,
  skippedVersion: null,
  lastCheck: 0,
};

const BOOTSTRAP_PS1 = [
  'param([string]$Exe, [string]$Zip, [string]$Dir)',
  '$name = Split-Path $Exe -Leaf',
  'for ($i = 0; $i -lt 180; $i++) {',
  '  if (-not (Get-Process -Name $name -ErrorAction SilentlyContinue)) { break }',
  '  Start-Sleep -Milliseconds 500',
  '}',
  'try { Expand-Archive -LiteralPath $Zip -DestinationPath $Dir -Force } catch { Write-Host $_.Exception.Message }',
  'Start-Process -FilePath $Exe',
].join('\r\n');

/* ------------------------------------------------------------- versioning */

function parseVersion(v) {
  if (v == null) return null;
  // Two-part versions are legitimate here ("1.0"), so missing parts default to 0
  // rather than making the version incomparable to a three-part release tag.
  const m = String(v).trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-.]?([0-9A-Za-z.-]+))?$/);
  if (!m) return null;
  return {
    major: +m[1],
    minor: +(m[2] || 0),
    patch: +(m[3] || 0),
    pre: m[4] || null,
    raw: String(v).trim(),
  };
}

function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (const k of ['major', 'minor', 'patch']) {
    if (pa[k] !== pb[k]) return pa[k] - pb[k];
  }
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && pb.pre) return pa.pre.localeCompare(pb.pre);
  return 0;
}

function isNewer(candidate, current) {
  return compareVersions(candidate, current) > 0;
}

function extractSha(value) {
  if (!value) return '';
  const s = String(value).trim().toLowerCase();
  const m = s.match(/(?:sha256[:=])?\b([a-f0-9]{64})\b/);
  return m ? m[1] : '';
}

function pickAsset(assets) {
  if (!Array.isArray(assets) || !assets.length) return null;
  const byName = re => assets.find(a => a && a.browser_download_url && re.test(a.name || ''));
  return byName(/setup.*\.exe$/i) || byName(/portable.*\.exe$/i) || byName(/\.exe$/i) || byName(/\.zip$/i) || assets.find(a => a && a.browser_download_url) || null;
}

function isHttpUrl(u) {
  return /^https?:\/\//i.test(String(u || '').trim());
}

function toLocalPath(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^file:\/\//i.test(s)) {
    try { return decodeURIComponent(new URL(s).pathname.replace(/^\/([a-zA-Z]:)/, '$1')); } catch (e) { return s.replace(/^file:\/\//i, ''); }
  }
  if (/^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('\\\\')) return s;
  return '';
}

/* ----------------------------------------------------------------- updater */

class Updater extends EventEmitter {
  constructor(app, currentVersion) {
    super();
    this.app = app;
    this.currentVersion = currentVersion;
    this.configPath = path.join(app.getPath('userData'), 'update-config.json');
    this.config = { ...DEFAULT_UPDATE_CONFIG };
    this.manifest = null;
    this.downloadedPath = null;
    this.state = {
      phase: 'idle',          // idle|checking|available|downloading|downloaded|installing|upToDate|error|notConfigured
      current: currentVersion,
      latest: null,
      notes: '',
      downloadUrl: '',
      fileName: '',
      sha256: '',
      publishedAt: '',
      source: '',
      progress: { received: 0, total: 0, percent: 0, speed: 0, eta: 0, phase: 'download' },
      error: null,
      configured: false,
      verified: false,
      skipped: false,
    };
    this._load();
    this.state.configured = this.isConfigured();
  }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      this.config = { ...DEFAULT_UPDATE_CONFIG, ...raw };
    } catch (e) { /* first run */ }
  }

  saveConfig() {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (e) { /* non-fatal */ }
  }

  updateConfig(patch) {
    this.config = { ...this.config, ...patch };
    this.saveConfig();
    this.state.configured = this.isConfigured();
    this._set({});
    return this.config;
  }

  isConfigured() {
    if (this.config.mode === 'custom') {
      const u = (this.config.customManifestUrl || '').trim();
      if (isHttpUrl(u)) return true;
      const lp = toLocalPath(u) || u;
      return /^[a-zA-Z]:[\\/]/.test(lp) || lp.startsWith('\\\\');
    }
    const repo = (this.config.githubRepo || '').trim();
    return !!repo && !repo.includes('<') && repo.includes('/');
  }

  manifestUrl() {
    if (this.config.mode === 'custom') return this.config.customManifestUrl;
    const repo = this.config.githubRepo.trim();
    const base = `https://api.github.com/repos/${repo}/releases`;
    if (this.config.channel === 'beta') return `${base}?per_page=10`;
    return `${base}/latest`;
  }

  async fetchJson(url, headers = {}, timeoutMs = 15000) {
    const local = toLocalPath(url);
    if (local) {
      const raw = fs.readFileSync(local, 'utf8');
      try { return JSON.parse(raw); } catch (e) { return raw.trim(); }
    }
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SE-MENU-Updater', Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async fetchManifest() {
    if (this.config.mode === 'custom') {
      const primary = this.config.customManifestUrl;
      let json;
      try {
        json = await this.fetchJson(primary);
      } catch (e) {
        // A plain "semenu" file is accepted as well as "semenu.json".
        const alt = /\.json$/i.test(primary)
          ? primary.replace(/\.json$/i, '')
          : `${primary}.json`;
        json = await this.fetchJson(alt);
      }
      return this.normalizeCustom(json, primary);
    }
    const repo = this.config.githubRepo.trim();
    if (!this.isConfigured()) return null;
    const ghHeaders = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (this.config.channel === 'beta') {
      const list = await this.fetchJson(this.manifestUrl(), ghHeaders);
      if (!Array.isArray(list) || !list.length) throw new Error('no releases found');
      let best = null;
      for (const rel of list) {
        if (!parseVersion(rel.tag_name)) continue;
        if (!best || compareVersions(rel.tag_name, best.tag_name) > 0) best = rel;
      }
      if (!best) throw new Error('no valid releases found');
      return this.normalizeGitHub(best);
    }
    const json = await this.fetchJson(this.manifestUrl(), ghHeaders);
    return this.normalizeGitHub(json);
  }

  normalizeGitHub(rel) {
    if (!rel) return null;
    const asset = pickAsset(rel.assets || []);
    const version = String(rel.tag_name || rel.name || '').trim().replace(/^v/i, '');
    return {
      version,
      notes: rel.body || rel.name || '',
      downloadUrl: asset ? asset.browser_download_url : '',
      fileName: asset ? asset.name : '',
      size: asset ? Number(asset.size) || 0 : 0,
      sha256: extractSha(asset && (asset.digest || asset.checksum)),
      publishedAt: rel.published_at || rel.created_at || '',
      source: 'github',
      htmlUrl: rel.html_url || '',
    };
  }

  normalizeCustom(json, manifestUrl) {
    if (json == null) return null;
    // The hosted file may be a full manifest, or just the version number.
    const plain = typeof json === 'number' || typeof json === 'string';
    const obj = plain ? { version: String(json) } : json;
    if (!obj || typeof obj !== 'object') return null;
    const version = String(obj.version || obj.latestVersion || obj.tag_name || '').trim();
    if (!version) return null;
    let fileName = String(obj.fileName || obj.filename || '').trim();
    let downloadUrl = String(obj.downloadUrl || obj.url || obj.browser_download_url || '').trim();
    if (!fileName && downloadUrl) {
      const lp = toLocalPath(downloadUrl);
      if (lp) fileName = path.basename(lp);
      else { try { fileName = path.basename(new URL(downloadUrl).pathname); } catch (e) { /* noop */ } }
    }
    if (!downloadUrl && manifestUrl) {
      // Version-only file: the installer is expected beside it, named after
      // the version - semenu-v<version>.exe.
      const mLocal = toLocalPath(manifestUrl) || (!isHttpUrl(manifestUrl) ? String(manifestUrl).trim() : '');
      if (mLocal && (path.isAbsolute(mLocal) || /^[a-zA-Z]:[\\/]/.test(mLocal))) {
        fileName = fileName || `semenu-v${version}.exe`;
        downloadUrl = path.join(path.dirname(mLocal), fileName);
      } else {
        try {
          const base = new URL(manifestUrl);
          const dir = base.pathname.replace(/[^/]+$/, '');
          fileName = fileName || `semenu-v${version}.exe`;
          downloadUrl = new URL(dir + fileName, base.origin).toString();
        } catch (e) { /* noop */ }
      }
    }
    // resolve relative local download paths against manifest directory
    const mLocalBase = toLocalPath(manifestUrl) || (!isHttpUrl(manifestUrl) ? String(manifestUrl).trim() : '');
    if (downloadUrl && mLocalBase && !isHttpUrl(downloadUrl) && !toLocalPath(downloadUrl) && !path.isAbsolute(downloadUrl)) {
      downloadUrl = path.join(path.dirname(mLocalBase), downloadUrl);
    }
    return {
      version,
      notes: obj.notes || obj.releaseNotes || obj.body || '',
      downloadUrl,
      fileName,
      size: Number(obj.size) || 0,
      sha256: extractSha(obj.sha256 || obj.hash || obj.checksum),
      publishedAt: obj.publishedAt || obj.date || '',
      source: 'custom',
      htmlUrl: obj.htmlUrl || '',
    };
  }

  _set(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('state', this.state);
  }

  /** Remove infrastructure hostnames from messages surfaced in the UI. */
  scrub(message) {
    return String(message || '')
      .replace(/https?:\/\/api\.github\.com\/repos\/[^\s'\")]+/gi, 'the update service')
      .replace(/https?:\/\/uploads\.github\.com[^\s'\")]*/gi, 'the update service')
      .replace(/https?:\/\/(www\.)?github\.com[^\s'\")]*/gi, 'the update service')
      .replace(/\bgithub\.com\b/gi, 'the update service')
      .replace(/\bgithub\b/gi, 'the update service');
  }

  async check({ manual = false } = {}) {
    const phase = this.state.phase;
    if (phase === 'downloading' || phase === 'installing') return this.state;
    this._set({ phase: 'checking', error: null, ...(manual ? {} : {}) });
    if (!this.isConfigured()) {
      this._set({ phase: 'notConfigured' });
      return this.state;
    }
    try {
      const manifest = await this.fetchManifest();
      if (!manifest || !manifest.version) throw new Error('the update service did not return a usable version');
      this.manifest = manifest;
      this._set({
        latest: manifest.version,
        notes: manifest.notes,
        downloadUrl: manifest.downloadUrl,
        fileName: manifest.fileName,
        sha256: manifest.sha256,
        publishedAt: manifest.publishedAt,
        source: manifest.source,
      });
      this.config.lastCheck = Date.now();
      this.saveConfig();
      const newer = isNewer(manifest.version, this.currentVersion);
      const skipped = !!this.config.skippedVersion && compareVersions(manifest.version, this.config.skippedVersion) === 0;
      if (newer && !skipped) {
        this._set({ phase: 'available', skipped: false });
        if (this.config.autoDownload && !manual) await this.download();
      } else if (newer && skipped) {
        this._set({ phase: 'available', skipped: true });
      } else {
        this._set({ phase: 'upToDate' });
      }
    } catch (e) {
      this._set({ phase: 'error', error: this.scrub(e.message) });
    }
    return this.state;
  }

  async download() {
    const m = this.manifest;
    if (!m || !m.downloadUrl) {
      this._set({ phase: 'error', error: 'no download URL in the update package' });
      return this.state;
    }
    const fileName = m.fileName || `SE-MENU-Update-${m.version}.bin`;
    const finalPath = path.join(os.tmpdir(), fileName);
    const partPath = `${finalPath}.part`;
    const hash = m.sha256 ? crypto.createHash('sha256') : null;
    this._set({ phase: 'downloading', error: null, progress: { received: 0, total: m.size || 0, percent: 0, speed: 0, eta: 0, phase: 'download' } });

    const localSrc = toLocalPath(m.downloadUrl) || (!isHttpUrl(m.downloadUrl) ? String(m.downloadUrl).trim() : '');
    if (localSrc && (path.isAbsolute(localSrc) || /^[a-zA-Z]:[\\/]/.test(localSrc))) {
      try {
        const st = fs.statSync(localSrc);
        const total = st.size || m.size || 0;
        await new Promise((resolve, reject) => {
          const rs = fs.createReadStream(localSrc);
          const ws = fs.createWriteStream(finalPath);
          let received = 0;
          let last = Date.now();
          rs.on('data', chunk => {
            received += chunk.length;
            if (hash) hash.update(chunk);
            const now = Date.now();
            if (now - last > 120) {
              const p = { received, total, percent: total ? Math.min(100, (received / total) * 100) : 100, speed: 0, eta: 0, phase: 'download' };
              this._set({ progress: p });
              this.emit('progress', p);
              last = now;
            }
          });
          rs.on('error', reject);
          ws.on('error', reject);
          ws.on('finish', resolve);
          rs.pipe(ws);
        });
        const digest = hash ? hash.digest('hex') : '';
        if (m.sha256 && digest && digest.toLowerCase() !== m.sha256.toLowerCase()) {
          try { fs.unlinkSync(finalPath); } catch (e) { /* noop */ }
          this._set({ phase: 'error', error: 'integrity check failed - the download was discarded' });
          return this.state;
        }
        this.downloadedPath = finalPath;
        this._set({ phase: 'downloaded', verified: !!(m.sha256 && digest), error: null, progress: { received: total || 1, total: total || 1, percent: 100, speed: 0, eta: 0, phase: 'download' } });
      } catch (e) {
        this._set({ phase: 'error', error: `download failed: ${this.scrub(e.message)}` });
      }
      return this.state;
    }

    let resumeFrom = 0;
    try { resumeFrom = fs.statSync(partPath).size; } catch (e) { resumeFrom = 0; }
    if (resumeFrom && m.size && resumeFrom >= m.size) {
      try { fs.unlinkSync(partPath); } catch (e) { /* noop */ }
      resumeFrom = 0;
    }

    // When resuming, the bytes already on disk must be fed through the hash so
    // the final digest covers the whole file.
    if (resumeFrom && hash) {
      await new Promise((resolveHash, rejectHash) => {
        const existing = fs.createReadStream(partPath);
        existing.on('data', chunk => hash.update(chunk));
        existing.on('end', resolveHash);
        existing.on('error', rejectHash);
      });
    }

    const headers = { 'User-Agent': 'SE-MENU-Updater', Accept: '*/*' };
    if (resumeFrom) headers.Range = `bytes=${resumeFrom}-`;

    try {
      await this._streamDownload(m.downloadUrl, partPath, resumeFrom, headers, hash);
      fs.renameSync(partPath, finalPath);
      const digest = hash ? hash.digest('hex') : '';
      if (m.sha256 && digest && digest.toLowerCase() !== m.sha256.toLowerCase()) {
        try { fs.unlinkSync(finalPath); } catch (e) { /* noop */ }
        this._set({ phase: 'error', error: 'integrity check failed - the download was discarded' });
        return this.state;
      }
      this.downloadedPath = finalPath;
      this._set({ phase: 'downloaded', verified: !!(m.sha256 && digest), error: null });
    } catch (e) {
      this._set({ phase: 'error', error: `download failed: ${this.scrub(e.message)}` });
    }
    return this.state;
  }

  _streamDownload(url, partPath, resumeFrom, headers, hash) {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, { headers, timeout: 30000 }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return this._streamDownload(next, partPath, resumeFrom, headers, hash).then(resolve, reject);
        }
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const append = resumeFrom > 0 && res.statusCode === 206;
        if (!append) {
          resumeFrom = 0;
          try { fs.unlinkSync(partPath); } catch (e) { /* noop */ }
        }
        const contentLength = Number(res.headers['content-length']) || 0;
        const total = append ? resumeFrom + contentLength : contentLength;
        const ws = fs.createWriteStream(partPath, { flags: append ? 'a' : 'w' });
        let received = resumeFrom;
        let lastReport = Date.now();
        let lastBytes = received;
        res.on('data', chunk => {
          received += chunk.length;
          if (hash) hash.update(chunk);
          const now = Date.now();
          if (now - lastReport > 150) {
            const speed = (received - lastBytes) / Math.max(0.05, (now - lastReport) / 1000);
            const p = {
              received, total,
              percent: total ? Math.min(100, (received / total) * 100) : 0,
              speed,
              eta: speed > 0 && total ? (total - received) / speed : 0,
              phase: 'download',
            };
            this._set({ progress: p });
            this.emit('progress', p);
            lastReport = now;
            lastBytes = received;
          }
        });
        res.on('error', reject);
        ws.on('error', reject);
        res.pipe(ws);
        ws.on('finish', () => resolve({ received, total }));
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('download timeout')));
    });
  }

  async install() {
    if (this.state.phase !== 'downloaded' || !this.downloadedPath) return this.state;
    if (!this.app.isPackaged) {
      this._set({ phase: 'downloaded', error: null });
      return this.state;
    }
    const file = this.downloadedPath;
    const isExe = /\.exe$/i.test(file);
    const isZip = /\.zip$/i.test(file);
    if (!isExe && !isZip) {
      this._set({ phase: 'error', error: 'unsupported update package format' });
      return this.state;
    }
    this._set({ phase: 'installing', error: null });
    try {
      if (isExe) {
        const child = spawn(file, ['/S', '/FORCECLOSEAPPLICATIONS'], { detached: true, stdio: 'ignore', windowsHide: false });
        child.unref();
      } else {
        const dir = path.dirname(process.execPath);
        const ps1 = path.join(os.tmpdir(), 'SE-MENU-Update-bootstrap.ps1');
        fs.writeFileSync(ps1, BOOTSTRAP_PS1);
        const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Exe', process.execPath, '-Zip', file, '-Dir', dir], { detached: true, stdio: 'ignore' });
        child.unref();
      }
      setTimeout(() => { try { this.app.quit(); } catch (e) { /* noop */ } }, 1200);
    } catch (e) {
      this._set({ phase: 'error', error: `install failed: ${this.scrub(e.message)}` });
    }
    return this.state;
  }

  skip(version) {
    this.config.skippedVersion = version || (this.manifest && this.manifest.version) || null;
    this.saveConfig();
    this._set({ skipped: true });
    return this.state;
  }

  resetSkipped() {
    this.config.skippedVersion = null;
    this.saveConfig();
    this._set({ skipped: false });
    return this.state;
  }
}

module.exports = { Updater, DEFAULT_UPDATE_CONFIG, parseVersion, compareVersions, isNewer };
