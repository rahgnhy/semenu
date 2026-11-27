/* ============================================================================
   il2cpp-extract.js - pull libil2cpp.so + global-metadata.dat out of an .apk.

   Windows PowerShell 5.1's Expand-Archive hard-rejects .apk:
       ".apk is not a supported archive file format. .zip is the only
        supported archive file format."
   so the dumper could never get past step one. Even when it does work it is the
   wrong tool: a 500 MB VR game is mostly assets, and inflating all of it to read
   two files costs minutes and a gigabyte of disk.

   ZipFile reads the central directory and inflates only the entries we name.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const LIB_RE = /(^|\/)libil2cpp\.so$/;
const META_RE = /(^|\/)global-metadata\.dat$/;

/**
 * Extract just the IL2CPP payloads from an APK.
 * @param {string} apkPath
 * @param {string} extractDir  created if missing
 * @returns {{libPath:string, metaPath:string, arch:string, entries:string[]}}
 */
function extractIl2CppPayloads(apkPath, extractDir) {
  if (!apkPath || !fs.existsSync(apkPath)) {
    throw new Error('APK not found: ' + apkPath);
  }
  fs.mkdirSync(extractDir, { recursive: true });

  const sq = s => String(s).replace(/'/g, "''");
  const script = [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$zip = [System.IO.Compression.ZipFile]::OpenRead('${sq(apkPath)}')`,
    'try {',
    "  $hits = @($zip.Entries | Where-Object { $_.Name -eq 'libil2cpp.so' -or $_.Name -eq 'global-metadata.dat' })",
    '  foreach ($e in $hits) {',
    `    $dest = Join-Path '${sq(extractDir)}' ($e.FullName -replace '/', '\\')`,
    '    $dir = Split-Path -Parent $dest',
    '    if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }',
    '    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $dest, $true)',
    '    Write-Output ("ENTRY=" + $e.FullName)',
    '  }',
    '} finally { $zip.Dispose() }',
  ].join('\n');

  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  });

  if (r.error) throw new Error('APK read failed: ' + r.error.message);
  if (r.status !== 0) {
    const detail = String(r.stderr || r.stdout || 'unknown').trim().slice(0, 400);
    throw new Error('APK read failed: ' + detail);
  }

  const entries = [];
  const libs = [];
  let metaPath = '';
  for (const ln of String(r.stdout || '').split(/\r?\n/)) {
    const t = ln.trim();
    if (!t.startsWith('ENTRY=')) continue;
    const rel = t.slice(6);
    entries.push(rel);
    const full = path.join(extractDir, rel.split('/').join(path.sep));
    if (LIB_RE.test(rel)) libs.push({ rel, full });
    else if (META_RE.test(rel)) { if (!metaPath) metaPath = full; }
  }

  let libPath = '';
  let arch = '';
  if (libs.length) {
    // arm64-v8a first: Il2CppDumper wants the widest build, and a split APK can
    // carry libil2cpp.so for several ABIs.
    const pick = libs.find(x => /arm64-v8a/.test(x.rel)) || libs[0];
    libPath = pick.full;
    const m = pick.rel.match(/lib[\/\\]([^\/\\]+)[\/\\]libil2cpp\.so$/);
    if (m) arch = m[1];
  }

  return { libPath, metaPath, arch, entries };
}

module.exports = { extractIl2CppPayloads };
