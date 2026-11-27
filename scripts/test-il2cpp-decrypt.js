#!/usr/bin/env node
/* ============================================================================
   test-il2cpp-decrypt.js - end-to-end test for the metadata decrypter.

   Takes a real APK, pulls libil2cpp.so + global-metadata.dat out of it, decrypts
   the container format, and hands the result to the bundled Il2CppDumper. The
   dumper parsing the output cleanly is the acceptance criterion - it is the same
   program the app runs, so if it is happy the tab works.

   usage: node scripts/test-il2cpp-decrypt.js [path-to.apk]
   ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { extractIl2CppPayloads } = require('../src/main/il2cpp-extract');
const { decryptMetadata, isStockMetadata } = require('../src/main/il2cpp-decrypt');

const DEFAULT_APK = 'C:\\Users\\rayan\\Gilla-v8-aligned-debugSigned.apk';
const DUMPER = path.join(__dirname, '..', 'assets', 'tools', 'il2cppdumper', 'Il2CppDumper.exe');

let fails = 0;
function check(label, ok, detail) {
  if (!ok) fails++;
  console.log(`  ${label.padEnd(46)} ${ok ? 'ok' : 'FAIL'}${detail ? '  ' + detail : ''}`);
}

const apk = process.argv[2] || DEFAULT_APK;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'semenu-decrypt-test-'));
let exitCode = 0;

try {
  let found;
  if (fs.existsSync(apk) && fs.statSync(apk).isDirectory()) {
    console.log(`\n=== payloads from directory: ${apk} ===`);
    const lib = path.join(apk, 'libil2cpp.so');
    const meta = path.join(apk, 'global-metadata.dat');
    found = { libPath: fs.existsSync(lib) ? lib : '', metaPath: fs.existsSync(meta) ? meta : '', arch: 'given' };
  } else {
    console.log(`\n=== extract: ${apk} ===`);
    found = extractIl2CppPayloads(apk, path.join(work, 'extract'));
  }
  check('libil2cpp.so available', !!found.libPath);
  check('global-metadata.dat available', !!found.metaPath);
  if (!found.libPath || !found.metaPath) throw new Error('payloads missing');

  const lib = fs.readFileSync(found.libPath);
  const meta = fs.readFileSync(found.metaPath);
  console.log(`  libil2cpp.so ${(lib.length / 1048576).toFixed(1)} MB, metadata ${(meta.length / 1048576).toFixed(2)} MB`);

  console.log('\n=== decrypt ===');
  let plain = meta;
  if (isStockMetadata(meta)) {
    console.log('  input is already stock metadata - nothing to do');
  } else {
    const t0 = Date.now();
    const { data, report } = decryptMetadata(meta, lib);
    const ms = Date.now() - t0;
    plain = data;
    console.log(`  header seed ${report.headerSeed}  (container score ${report.headerScore}/126, ${ms} ms)`);
    check('output has IL2CPP magic', data.readUInt32LE(0) === 0xFAB11BAF, '0x' + data.readUInt32LE(0).toString(16));
    check('version is 31', data.readInt32LE(4) === 31, String(data.readInt32LE(4)));
    check('typeDefinitions look real', report.counts.typeDefinitions > 10000, String(report.counts.typeDefinitions));
    check('methods look real', report.counts.methods > 50000, String(report.counts.methods));
    check('images look real', report.counts.images > 10, String(report.counts.images));
    check('assemblies match images', report.counts.assemblies === report.counts.images,
      `${report.counts.assemblies} vs ${report.counts.images}`);
    check('decrypt finished under 60s', ms < 60000, `${(ms / 1000).toFixed(1)}s`);
  }

  const plainPath = path.join(work, 'global-metadata.dat');
  fs.writeFileSync(plainPath, plain);

  console.log('\n=== Il2CppDumper ===');
  const outDir = path.join(work, 'dump');
  fs.mkdirSync(outDir, { recursive: true });
  const r = spawnSync(DUMPER, [found.libPath, plainPath, outDir], {
    cwd: path.dirname(DUMPER), windowsHide: true, encoding: 'utf8',
    timeout: 20 * 60 * 1000, maxBuffer: 1024 * 1024 * 64,
  });
  const log = String(r.stdout || '') + String(r.stderr || '');
  check('dumper reports metadata version', /Metadata Version:\s*31/.test(log));
  check('dumper reaches Done', /Done!/.test(log));
  const dumpCs = path.join(outDir, 'dump.cs');
  const hasDump = fs.existsSync(dumpCs);
  check('dump.cs written', hasDump, hasDump ? `${(fs.statSync(dumpCs).size / 1048576).toFixed(1)} MB` : 'missing');
  if (!hasDump) {
    console.log(log.split(/\r?\n/).slice(-20).join('\n'));
  }
} catch (e) {
  console.log(`\n  ERROR: ${e.message}`);
  fails++;
} finally {
  try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* noop */ }
}

console.log(`\n${fails ? 'FAIL' : 'PASS'} (${fails} failure${fails === 1 ? '' : 's'})\n`);
process.exit(fails ? 1 : 0);
