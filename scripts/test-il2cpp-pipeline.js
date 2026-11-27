#!/usr/bin/env node
/* ============================================================================
   test-il2cpp-pipeline.js - acceptance test for the metadata repair + analysis
   pipeline.

   Runs the same modules the dumper tab runs, against a real container-format
   pair (libil2cpp.so + global-metadata.dat) and a real dump.cs. Every check is a
   measured number, not a "looks right": if the repair stops working, the counts
   move and this fails.

   usage:
     node scripts/test-il2cpp-pipeline.js [payload-dir]
     node scripts/test-il2cpp-pipeline.js [payload-dir] --dump

   payload-dir must hold libil2cpp.so, global-metadata.dec.dat and dump.cs.
   --dump also runs the bundled Il2CppDumper and asserts all five outputs exist.
   ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { validateMetadata, repairMetadata } = require('../src/main/il2cpp-metadata');
const { openBinary } = require('../src/main/il2cpp-binary');
const { loadIndex, buildLookups } = require('../src/main/il2cpp-dump-index');
const { crossCheck } = require('../src/main/il2cpp-crosscheck');
const { analyse } = require('../src/main/il2cpp-obfuscation');
const { createQuery } = require('../src/main/il2cpp-query');
const { analyse: analyseDump, writeReports } = require('../src/main/il2cpp-report');

const DUMPER = path.join(__dirname, '..', 'assets', 'tools', 'il2cppdumper', 'Il2CppDumper.exe');
const DEFAULT_DIR = 'C:\\Users\\rayan\\AppData\\Local\\Temp\\opencode\\semenu-fixtures';
const REGISTRATION_VA = 0x664e498;   // printed by Il2CppDumper for this libil2cpp.so

const argv = process.argv.slice(2);
const runDumper = argv.includes('--dump');
const dir = argv.find(a => !a.startsWith('--')) || process.env.SEMENU_IL2CPP_FIXTURES || DEFAULT_DIR;

let fails = 0;
let checks = 0;
function check(label, ok, detail) {
  checks++;
  if (!ok) fails++;
  console.log(`  ${label.padEnd(52)} ${ok ? 'ok' : 'FAIL'}${detail ? '  ' + detail : ''}`);
}
function section(name) { console.log(`\n=== ${name} ===`); }
function sha1(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }

function cleanup(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* noop */ }
}

(async () => {
  const metaPath = path.join(dir, 'global-metadata.dec.dat');
  const libPath = path.join(dir, 'libil2cpp.so');
  const dumpPath = path.join(dir, 'dump.cs');

  console.log(`\nfixtures: ${dir}`);
  for (const [name, p] of [['global-metadata.dec.dat', metaPath], ['libil2cpp.so', libPath], ['dump.cs', dumpPath]]) {
    if (!fs.existsSync(p)) {
      console.log(`  missing ${name} - cannot run`);
      process.exit(1);
    }
  }

  const metaBuf = fs.readFileSync(metaPath);
  const metaHash = sha1(metaBuf);

  /* ---------------------------------------------------------------- validate */
  section('validate (as extracted)');
  const before = validateMetadata(metaBuf);
  check('version is 31', before.version === 31, String(before.version));
  check('magic is 0xFAB11BAF', before.magic === '0xFAB11BAF', before.magic);
  check('structurally invalid, as expected', before.ok === false, `${before.issues.length} finding(s)`);
  check('typeDefinitions = 18299', before.counts.typeDefinitions === 18299, String(before.counts.typeDefinitions));
  check('methods = 127343', before.counts.methods === 127343, String(before.counts.methods));
  check('fields = 84657', before.counts.fields === 84657, String(before.counts.fields));
  check('images = 102', before.counts.images === 102, String(before.counts.images));
  const issueCodes = before.issues.map(i => i.code);
  check('finds the generic-container/elementType swap',
    issueCodes.includes('generic-container-in-element-slot') || issueCodes.includes('enum-element-missing'),
    issueCodes.slice(0, 4).join(', '));
  check('does not throw on a damaged file', true);

  /* ------------------------------------------------------------------ repair */
  section('repair');
  const t0 = Date.now();
  const repaired = repairMetadata(metaBuf);
  const repairMs = Date.now() - t0;
  check('repair produced output', !!repaired.data);
  check('valid after repair', repaired.report.ok === true, `${repaired.report.issues.length} finding(s)`);
  check('repair finished under 5s', repairMs < 5000, `${repairMs} ms`);
  const codes = repaired.repairs.map(r => r.code);
  for (const want of ['generic-container-restored', 'element-type-derived', 'fieldrefs-retargeted', 'fieldrefs-detached', 'string-literals-detached']) {
    check(`repair applied: ${want}`, codes.includes(want), codes.join(', '));
  }
  check('counts unchanged by repair',
    repaired.report.counts.typeDefinitions === before.counts.typeDefinitions
    && repaired.report.counts.methods === before.counts.methods
    && repaired.report.counts.fields === before.counts.fields,
    `${repaired.report.counts.typeDefinitions}/${repaired.report.counts.methods}/${repaired.report.counts.fields}`);
  check('original buffer untouched', sha1(fs.readFileSync(metaPath)) === metaHash);

  const again = repairMetadata(repaired.data);
  check('repair is idempotent', again.repairs.length === 0,
    again.repairs.map(r => r.code).join(', ') || 'no changes on a second pass');

  /* every enum's elementTypeIndex must now resolve to a real Il2CppType */
  let enumWithElement = 0;
  let enums = 0;
  {
    const { readHeader, SECTIONS } = require('../src/main/il2cpp-metadata');
    const h = readHeader(repaired.data);
    const sec = (n) => h.sections.find(s => s.name === n);
    const td = sec('typeDefinitions');
    for (let i = 0; i < (td.size / td.stride | 0); i++) {
      const at = td.offset + i * td.stride;
      const bitfield = repaired.data.readUInt32LE(at + 80);
      const isEnum = ((bitfield >> 1) & 1) === 1;
      if (!isEnum) continue;
      enums++;
      if (repaired.data.readInt32LE(at + 20) >= 0) enumWithElement++;
    }
  }
  check('every enum has an elementTypeIndex', enums > 0 && enumWithElement === enums, `${enumWithElement}/${enums}`);

  const repairedPath = path.join(os.tmpdir(), `semenu-repaired-${Date.now()}.dat`);
  fs.writeFileSync(repairedPath, repaired.data);

  /* ------------------------------------------------------------------- index */
  section('dump.cs index');
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semenu-index-cache-'));
  const ti = Date.now();
  const { index, cached } = await loadIndex(dumpPath, { cacheDir });
  const indexMs = Date.now() - ti;
  const lookups = buildLookups(index);
  check('parsed from disk, not cache', cached === false);
  check('types = 18299', index.types.length === 18299, String(index.types.length));
  check('methods = 127343', index.methods.length === 127343, String(index.methods.length));
  check('fields = 84657', index.fields.length === 84657, String(index.fields.length));
  check('properties = 23319', index.properties.length === 23319, String(index.properties.length));
  check('images = 102', index.images.length === 102, String(index.images.length));
  check('unparsed body lines = 0', index.unparsed === 0, String(index.unparsed));
  check('index built under 15s', indexMs < 15000, `${indexMs} ms`);
  const lookupSizes = [...lookups.methodsByType.values()].reduce((a, b) => a + b.length, 0);
  check('every method is attached to a type', lookupSizes === index.methods.length, `${lookupSizes}/${index.methods.length}`);

  const reload = await loadIndex(dumpPath, { cacheDir });
  check('second load comes from cache', reload.cached === true);

  /* --------------------------------------------------------------- crosscheck */
  section('cross-check: metadata vs dump.cs');
  const binary = openBinary(fs.readFileSync(libPath));
  check('relocations applied', binary.relocationsApplied > 700000, String(binary.relocationsApplied));
  const typeTable = binary.findTypeTable(REGISTRATION_VA);
  check('Il2CppType table found', typeTable.count === 61077 && typeTable.validated >= 8,
    `${typeTable.count} entries, ${typeTable.validated} sampled`);

  const cc = crossCheck(repaired.data, index, { binary, typesCount: typeTable.count });
  check('all metadata types present in dump', cc.summary.typesMissingFromDump === 0, String(cc.summary.typesMissingFromDump));
  check('no duplicate typeDefIndex', cc.summary.duplicateTypeDefIndexes === 0, String(cc.summary.duplicateTypeDefIndexes));
  check('no name mismatches', cc.summary.nameMismatches === 0, String(cc.summary.nameMismatches));
  check('no method count mismatches', cc.summary.methodCountMismatches === 0, String(cc.summary.methodCountMismatches));
  check('no field count mismatches', cc.summary.fieldCountMismatches === 0, String(cc.summary.fieldCountMismatches));
  check('no image mismatches', cc.summary.imageMismatches === 0, String(cc.summary.imageMismatches));
  check('every RVA inside an executable segment', cc.summary.addressesOutsideExecutable === 0,
    `${cc.summary.addressesVerified} verified, ${cc.summary.addressesOutsideExecutable} outside`);
  check('RVA coverage is most of the dump', cc.summary.addressesVerified > 100000, String(cc.summary.addressesVerified));

  /* -------------------------------------------------------------- obfuscation */
  section('naming');
  const naming = analyse(index, lookups, { roles: true });
  check('verdict is clean', naming.verdict === 'clean', `${naming.verdict} (score ${naming.score})`);
  check('no type is flagged as obfuscated', naming.suspicious === 0, String(naming.suspicious));
  check('signals were measured', Array.isArray(naming.signals) && naming.signals.length >= 5, `${naming.signals.length} signals`);
  const badSignal = naming.signals.find(s => typeof s.measured !== 'number' || typeof s.of !== 'number');
  check('every signal carries its denominator', !badSignal, badSignal ? badSignal.name : 'all measured');
  check('roles were assigned', !!naming.roles && Object.keys(naming.roles.buckets).length > 5,
    naming.roles ? `${Object.keys(naming.roles.buckets).length} roles` : 'none');
  check('game-specific types found', (naming.roles.gameSpecific || []).length > 0,
    String((naming.roles.gameSpecific || []).length));

  /* ------------------------------------------------------------------- query */
  section('query: search and type detail');
  const q = createQuery({ cacheDir: () => cacheDir });
  const empty = await q.searchDump({ dumpPath, query: '   ' });
  check('empty query returns nothing', empty.total === 0 && empty.hits.length === 0);

  const hits = await q.searchDump({ dumpPath, query: 'player', limit: 25 });
  check('search returns hits', hits.total > 0, `${hits.total} for "player"`);
  check('hits carry kind, label and line',
    hits.hits.every(h => h.kind && h.label && Number.isInteger(h.line)),
    hits.hits[0] ? `${hits.hits[0].kind} ${hits.hits[0].label} @${hits.hits[0].line}` : 'no hits');
  check('search is capped by limit', hits.hits.length <= 25, String(hits.hits.length));

  const onlyMethods = await q.searchDump({ dumpPath, query: 'Update', kind: 'method', limit: 10 });
  check('kind filter works', onlyMethods.hits.every(h => h.kind === 'method'), `${onlyMethods.hits.length} method hits`);

  const sampleType = index.types.find(t => t.methodCount > 5 && t.fieldCount > 0 && t.namespace);
  const detail = await q.typeDetail({ dumpPath, name: `${sampleType.namespace}.${sampleType.name}` });
  check('type detail found by name', detail.ok === true, `${sampleType.namespace}.${sampleType.name}`);
  check('detail fields match the index', detail.fields.length === sampleType.fieldCount,
    `${detail.fields.length}/${sampleType.fieldCount}`);
  check('detail methods match the index', detail.methods.length === sampleType.methodCount,
    `${detail.methods.length}/${sampleType.methodCount}`);
  check('detail carries a role', !!detail.role && !!detail.role.role, detail.role ? detail.role.role : 'none');
  check('detail carries source lines', detail.source.length > 0, `${detail.source.length} lines`);
  check('source starts at the declaration', /class|struct|interface|enum/.test(detail.source[0]), detail.source[0].slice(0, 60));

  const byIndex = await q.typeDetail({ dumpPath, typeDefIndex: sampleType.typeDefIndex });
  check('type detail found by typeDefIndex', byIndex.ok && byIndex.type.typeDefIndex === sampleType.typeDefIndex);

  const missing = await q.typeDetail({ dumpPath, name: 'Nope.NotARealType' });
  check('unknown type is reported, not invented', missing.ok === false && !!missing.error);

  /* ------------------------------------------------------------------ report */
  section('report');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semenu-report-'));
  const tr = Date.now();
  const res = await q.analyseDir({ outDir, dumpPath, metaPath, libPath, registrationVa: REGISTRATION_VA });
  const reportMs = Date.now() - tr;
  check('analysis completed', res.ok === true, res.error || 'ok');
  check('verdict is warn (repaired metadata)', res.summary.verdict === 'warn', res.summary.verdict);
  check('verdict names the repair', res.summary.verdictReasons.some(r => /repaired/.test(r)),
    res.summary.verdictReasons.join('; '));
  check('report.json written', fs.existsSync(path.join(outDir, 'report.json')));
  check('report.md written', fs.existsSync(path.join(outDir, 'report.md')));
  check('types.csv written', fs.existsSync(path.join(outDir, 'types.csv')));
  const md = fs.readFileSync(path.join(outDir, 'report.md'), 'utf8');
  check('report.md states the verdict', /Verdict: WARN/.test(md));
  check('report.md lists the repairs', /fieldrefs-detached/.test(md));
  check('report.md records what was not recovered', /string literals are not recoverable/i.test(md));
  const csvLines = fs.readFileSync(path.join(outDir, 'types.csv'), 'utf8').split('\n');
  check('types.csv has a row per type', csvLines.length === 18299 + 1, `${csvLines.length} lines`);
  check('analysis finished under 20s', reportMs < 20000, `${reportMs} ms`);

  /* the report must not claim more than it measured */
  const json = JSON.parse(fs.readFileSync(path.join(outDir, 'report.json'), 'utf8'));
  check('report.json crosscheck matches the direct run',
    json.crosscheck.summary.typesMissingFromDump === cc.summary.typesMissingFromDump);
  check('report.json records the dropped fieldRefs',
    json.repair.applied.some(r => r.code === 'fieldrefs-detached'));

  /* ------------------------------------------------------- dumper (optional) */
  if (runDumper) {
    section('Il2CppDumper (repaired metadata)');
    const dumpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'semenu-dump-'));
    const r = spawnSync(DUMPER, [libPath, repairedPath, dumpOut], {
      cwd: path.dirname(DUMPER), windowsHide: true, encoding: 'utf8',
      timeout: 20 * 60 * 1000, maxBuffer: 1024 * 1024 * 64,
    });
    const log = String(r.stdout || '') + String(r.stderr || '');
    check('dumper reports version 31', /Metadata Version:\s*31/.test(log));
    check('struct generation finished', /Generate struct\.\.\.\r?\nDone!/.test(log) || /Generate struct[\s\S]*Done!/.test(log));
    check('dummy dll generation finished', /Generate dummy dll[\s\S]*Done!/.test(log));
    for (const name of ['dump.cs', 'il2cpp.h', 'script.json', 'stringliteral.json']) {
      const p = path.join(dumpOut, name);
      check(`${name} written`, fs.existsSync(p), fs.existsSync(p) ? `${(fs.statSync(p).size / 1048576).toFixed(1)} MB` : 'missing');
    }
    const dllDir = path.join(dumpOut, 'DummyDll');
    check('DummyDll\\Assembly-CSharp.dll written', fs.existsSync(path.join(dllDir, 'Assembly-CSharp.dll')));
    const script = JSON.parse(fs.readFileSync(path.join(dumpOut, 'script.json'), 'utf8'));
    check('script.json has ScriptMethod entries', script.ScriptMethod.length > 100000, String(script.ScriptMethod.length));
    check('script.json has ScriptMetadata entries', script.ScriptMetadata.length > 1000, String(script.ScriptMetadata.length));
    cleanup(dumpOut);
  } else {
    console.log('\n(dumper run skipped - pass --dump to include it)');
  }

  cleanup(cacheDir);
  cleanup(outDir);
  cleanup(repairedPath);

  console.log(`\n${fails ? 'FAIL' : 'PASS'} (${checks - fails}/${checks} checks)\n`);
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.log(`\n  ERROR: ${e.stack || e.message}`);
  console.log(`\nFAIL (1 failure)\n`);
  process.exit(1);
});
