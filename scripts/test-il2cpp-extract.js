#!/usr/bin/env node
/* ============================================================================
   test-il2cpp-extract.js - regression test for the APK payload extractor.

   The old code called Expand-Archive, which on Windows PowerShell 5.1 refuses
   .apk outright:
       ".apk is not a supported archive file format."
   so no APK ever dumped. This asserts the replacement reads a real game APK and
   survives the obvious bad inputs.

   usage: node scripts/test-il2cpp-extract.js [path-to.apk]
   ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractIl2CppPayloads } = require('../src/main/il2cpp-extract');

const DEFAULT_APK = 'C:\\Users\\rayan\\Gilla-v8-aligned-debugSigned.apk';

let fails = 0;
function check(label, ok, detail) {
  if (!ok) fails++;
  console.log(`  ${label.padEnd(46)} ${ok ? 'ok' : 'FAIL'}${detail ? '  ' + detail : ''}`);
}

function expectThrow(label, fn, match) {
  try {
    fn();
    check(label, false, 'did not throw');
  } catch (e) {
    check(label, !match || match.test(e.message), e.message.slice(0, 70));
  }
}

const apk = process.argv[2] || DEFAULT_APK;

console.log(`\n=== real APK: ${apk} ===`);
if (!fs.existsSync(apk)) {
  console.log(`  skipped (not present)`);
} else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'semenu-extract-test-'));
  const t0 = Date.now();
  let found = null;
  try {
    found = extractIl2CppPayloads(apk, dir);
  } catch (e) {
    check('extract does not throw', false, e.message);
  }
  const ms = Date.now() - t0;
  if (found) {
    check('libil2cpp.so located', !!found.libPath, found.libPath);
    check('global-metadata.dat located', !!found.metaPath, found.metaPath);
    check('arch resolved', found.arch === 'arm64-v8a', found.arch);
    check('libil2cpp.so on disk', found.libPath && fs.existsSync(found.libPath));
    check('global-metadata.dat on disk', found.metaPath && fs.existsSync(found.metaPath));
    const libSize = found.libPath ? fs.statSync(found.libPath).size : 0;
    const metaSize = found.metaPath ? fs.statSync(found.metaPath).size : 0;
    check('libil2cpp.so is a real ELF', libSize > 1e6 && fs.readFileSync(found.libPath, { encoding: null }).slice(0, 4).toString('hex') === '7f454c46', `${(libSize / 1048576).toFixed(1)} MB`);
    check('metadata is non-trivial', metaSize > 1e6, `${(metaSize / 1048576).toFixed(1)} MB`);
    check('extracted only the payloads', found.entries.length <= 4, `${found.entries.length} entries`);
    check('finished under 90s', ms < 90000, `${(ms / 1000).toFixed(1)}s`);
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* noop */ }
}

console.log('\n=== bad input ===');
expectThrow('missing apk throws', () => extractIl2CppPayloads('C:\\nope\\none.apk', os.tmpdir()), /not found/i);

const junkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semenu-junk-'));
const junk = path.join(junkDir, 'junk.apk');
fs.writeFileSync(junk, 'not a zip');
expectThrow('non-zip throws cleanly', () => extractIl2CppPayloads(junk, path.join(junkDir, 'out')), /APK read failed/i);
try { fs.rmSync(junkDir, { recursive: true, force: true }); } catch (e) { /* noop */ }

console.log(`\n${fails ? 'FAIL' : 'PASS'} (${fails} failure${fails === 1 ? '' : 's'})\n`);
process.exit(fails ? 1 : 0);
