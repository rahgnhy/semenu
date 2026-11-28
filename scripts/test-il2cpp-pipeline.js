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

/* ------------------------------------------------------- container encoder

   The inverse of il2cpp-decrypt's convert(). No container fixture was shipped
   with this build, so the round-trip test builds one: every stock section is
   narrowed to the container layout exactly as convert() widens it, then
   convert() is asked to give the stock section back byte for byte. A mismatch
   names the section that broke. */

const CONTAINER_INDEX = {
  stringLiteral: 48, stringLiteralData: 69, string: 63, events: 97, properties: 34,
  methods: 23, parameterDefaultValues: 22, fieldDefaultValues: 73,
  fieldAndParameterDefaultValueData: 46, fieldMarshaledSizes: 36, parameters: 41,
  fields: 14, genericParameters: 32, genericParameterConstraints: 3,
  genericContainers: 2, nestedTypes: 31, interfaces: 59, vtableMethods: 4,
  interfaceOffsets: 106, typeDefinitions: 118, images: 84, assemblies: 5, fieldRefs: 67,
};

function encodeContainer(stock) {
  const { readHeader } = require('../src/main/il2cpp-metadata');
  const H = readHeader(stock);
  const get = (name) => {
    const s = H.sections.find(x => x.name === name);
    return s && s.size ? stock.subarray(s.offset, s.offset + s.size) : Buffer.alloc(0);
  };
  const u32 = (b, o) => b.readUInt32LE(o);
  const u16 = (b, o) => b.readUInt16LE(o);
  const n16 = (b, o) => { const v = b.readInt32LE(o); return v < 0 ? 0xFFFF : (v & 0xFFFF); };
  const sec = {};

  sec[CONTAINER_INDEX.stringLiteral] = get('stringLiteral');
  sec[CONTAINER_INDEX.stringLiteralData] = get('stringLiteralData');
  sec[CONTAINER_INDEX.string] = get('string');

  { const s = get('events'), n = (s.length / 24) | 0, b = Buffer.alloc(n * 22);
    for (let i = 0; i < n; i++) { const o = i * 24, w = i * 22;
      b.writeUInt32LE(u32(s, o), w); b.writeUInt16LE(n16(s, o + 4), w + 4);
      b.writeUInt32LE(u32(s, o + 8), w + 6); b.writeUInt32LE(u32(s, o + 12), w + 10);
      b.writeUInt32LE(u32(s, o + 16), w + 14); b.writeUInt32LE(u32(s, o + 20), w + 18); }
    sec[CONTAINER_INDEX.events] = b; }

  sec[CONTAINER_INDEX.properties] = get('properties');

  { const s = get('methods'), n = (s.length / 36) | 0, b = Buffer.alloc(n * 30);
    for (let i = 0; i < n; i++) { const o = i * 36, w = i * 30;
      b.writeUInt32LE(u32(s, o), w); b.writeUInt16LE(n16(s, o + 4), w + 4); b.writeUInt16LE(n16(s, o + 8), w + 6);
      b.writeUInt32LE(u32(s, o + 12), w + 8); b.writeUInt32LE(u32(s, o + 16), w + 12);
      b.writeUInt16LE(n16(s, o + 20), w + 16); b.writeUInt32LE(u32(s, o + 24), w + 18);
      b.writeUInt16LE(u16(s, o + 28), w + 22); b.writeUInt16LE(u16(s, o + 30), w + 24);
      b.writeUInt16LE(u16(s, o + 32), w + 26); b.writeUInt16LE(u16(s, o + 34), w + 28); }
    sec[CONTAINER_INDEX.methods] = b; }

  for (const [k, name] of [[CONTAINER_INDEX.parameterDefaultValues, 'parameterDefaultValues'],
    [CONTAINER_INDEX.fieldDefaultValues, 'fieldDefaultValues']]) {
    const s = get(name), n = (s.length / 12) | 0, b = Buffer.alloc(n * 10);
    for (let i = 0; i < n; i++) { const o = i * 12, w = i * 10;
      b.writeUInt32LE(u32(s, o), w); b.writeUInt16LE(n16(s, o + 4), w + 4); b.writeUInt32LE(u32(s, o + 8), w + 6); }
    sec[k] = b;
  }
  sec[CONTAINER_INDEX.fieldAndParameterDefaultValueData] = get('fieldAndParameterDefaultValueData');

  { const s = get('fieldMarshaledSizes'), n = (s.length / 12) | 0, b = Buffer.alloc(n * 10);
    for (let i = 0; i < n; i++) { const o = i * 12, w = i * 10;
      b.writeUInt32LE(u32(s, o), w); b.writeUInt16LE(n16(s, o + 4), w + 4); b.writeUInt16LE(n16(s, o + 8), w + 8); }
    sec[CONTAINER_INDEX.fieldMarshaledSizes] = b; }

  { const s = get('parameters'), n = (s.length / 12) | 0, b = Buffer.alloc(n * 10);
    for (let i = 0; i < n; i++) { const o = i * 12, w = i * 10;
      b.writeUInt32LE(u32(s, o), w); b.writeUInt32LE(u32(s, o + 4), w + 4); b.writeUInt16LE(n16(s, o + 8), w + 8); }
    sec[CONTAINER_INDEX.parameters] = b; }

  { const s = get('fields'), n = (s.length / 12) | 0, b = Buffer.alloc(n * 10);
    for (let i = 0; i < n; i++) { const o = i * 12, w = i * 10;
      b.writeUInt32LE(u32(s, o), w); b.writeUInt16LE(n16(s, o + 4), w + 4); b.writeUInt32LE(u32(s, o + 8), w + 6); }
    sec[CONTAINER_INDEX.fields] = b; }

  { const s = get('genericContainers'), n = (s.length / 16) | 0, b = Buffer.alloc(n * 9);
    for (let i = 0; i < n; i++) { const o = i * 16, w = i * 9;
      b.writeUInt32LE(u32(s, o), w); b.writeUInt16LE(u16(s, o + 4), w + 4);
      b[w + 6] = s.readInt32LE(o + 8) ? 1 : 0; b.writeUInt16LE(u16(s, o + 12), w + 7); }
    sec[CONTAINER_INDEX.genericContainers] = b; }

  /* genericParameters: the container stores the container index where stock
     stores the owner type index, so it is rebuilt from each container's window. */
  { const s = get('genericParameters'), n = (s.length / 16) | 0, b = Buffer.alloc(n * 14);
    for (let i = 0; i < n; i++) { const o = i * 16, w = i * 14;
      b.writeUInt32LE(u32(s, o + 4), w + 2); b.writeUInt16LE(u16(s, o + 8), w + 6);
      b.writeUInt16LE(u16(s, o + 10), w + 8); b.writeUInt16LE(u16(s, o + 12), w + 10);
      b.writeUInt16LE(u16(s, o + 14), w + 12); }
    const gc = sec[CONTAINER_INDEX.genericContainers];
    const nCont = (gc.length / 9) | 0;
    for (let c = 0; c < nCont; c++) {
      const start = gc.readUInt16LE(c * 9 + 7), argc = gc.readUInt16LE(c * 9 + 4);
      for (let k = 0; k < argc; k++) { const gi = start + k; if (gi < n) b.writeUInt16LE(c, gi * 14); }
    }
    sec[CONTAINER_INDEX.genericParameters] = b; }

  { const s = get('genericParameterConstraints'), n = (s.length / 4) | 0, b = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) b.writeUInt16LE(s.readUInt16LE(i * 4), i * 2);
    sec[CONTAINER_INDEX.genericParameterConstraints] = b; }

  sec[CONTAINER_INDEX.nestedTypes] = get('nestedTypes');
  sec[CONTAINER_INDEX.vtableMethods] = get('vtableMethods');

  { const s = get('interfaces'), n = (s.length / 4) | 0, b = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) b.writeUInt16LE(s.readUInt16LE(i * 4), i * 2);
    sec[CONTAINER_INDEX.interfaces] = b; }

  { const s = get('interfaceOffsets'), n = (s.length / 8) | 0, b = Buffer.alloc(n * 6);
    for (let i = 0; i < n; i++) { const o = i * 8, w = i * 6;
      b.writeUInt16LE(u16(s, o), w); b.writeUInt32LE(u32(s, o + 4), w + 2); }
    sec[CONTAINER_INDEX.interfaceOffsets] = b; }

  { const s = get('typeDefinitions'), n = (s.length / 88) | 0, b = Buffer.alloc(n * 66);
    for (let i = 0; i < n; i++) { const o = i * 88, w = i * 66;
      b.writeUInt32LE(u32(s, o), w); b.writeUInt32LE(u32(s, o + 4), w + 4);
      b.writeUInt16LE(n16(s, o + 8), w + 8);
      b.writeUInt16LE(n16(s, o + 12), w + 10); b.writeUInt16LE(n16(s, o + 16), w + 12);
      b.writeUInt16LE(n16(s, o + 24), w + 14);              // genericContainerIndex -> owner slot
      b.writeUInt32LE(u32(s, o + 28), w + 16);
      b.writeUInt32LE(u32(s, o + 32), w + 20); b.writeUInt32LE(u32(s, o + 36), w + 24);
      b.writeUInt16LE(n16(s, o + 40), w + 28); b.writeUInt16LE(n16(s, o + 44), w + 30);
      b.writeUInt16LE(n16(s, o + 48), w + 32); b.writeUInt16LE(n16(s, o + 52), w + 34);
      b.writeUInt32LE(u32(s, o + 56), w + 36); b.writeUInt16LE(n16(s, o + 60), w + 40);
      for (let c = 0; c < 8; c++) b.writeUInt16LE(u16(s, o + 64 + c * 2), w + 42 + c * 2);
      b.writeUInt32LE(u32(s, o + 80), w + 58); b.writeUInt32LE(u32(s, o + 84), w + 62); }
    sec[CONTAINER_INDEX.typeDefinitions] = b; }

  { const s = get('images'), n = (s.length / 40) | 0, b = Buffer.alloc(n * 36);
    for (let i = 0; i < n; i++) { const o = i * 40, w = i * 36;
      b.writeUInt32LE(u32(s, o), w); b.writeUInt32LE(u32(s, o + 4), w + 4);
      b.writeUInt16LE(u16(s, o + 8), w + 8); b.writeUInt16LE(u16(s, o + 12), w + 10);
      const ec = s.readInt32LE(o + 20); b.writeUInt16LE(ec === 0 ? 0xFFFF : (ec & 0xFFFF), w + 14);
      b.writeUInt32LE(u32(s, o + 24), w + 16); }
    sec[CONTAINER_INDEX.images] = b; }

  /* assemblies: the container swaps the name and culture slots. */
  { const s = get('assemblies'), n = (s.length / 64) | 0, b = Buffer.alloc(n * 68);
    for (let i = 0; i < n; i++) { const o = i * 64, w = i * 68;
      b.writeUInt32LE(u32(s, o), w); b.writeUInt32LE(u32(s, o + 4), w + 4);
      b.writeUInt32LE(u32(s, o + 8), w + 8); b.writeUInt32LE(u32(s, o + 12), w + 12);
      b.writeUInt32LE(u32(s, o + 20), w + 16); b.writeUInt32LE(u32(s, o + 16), w + 20);
      b.writeUInt32LE(u32(s, o + 24), w + 24); b.writeUInt32LE(u32(s, o + 32), w + 28);
      b.writeUInt32LE(u32(s, o + 28), w + 32); b.writeUInt32LE(u32(s, o + 36), w + 36);
      b.writeUInt32LE(u32(s, o + 40), w + 40); b.writeUInt32LE(u32(s, o + 44), w + 44);
      b.writeUInt32LE(u32(s, o + 48), w + 48); b.writeUInt32LE(u32(s, o + 52), w + 52);
      s.copy(b, w + 60, o + 56, o + 64); }
    sec[CONTAINER_INDEX.assemblies] = b; }

  { const s = get('fieldRefs'), n = (s.length / 8) | 0, b = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) {
      b.writeUInt16LE(s.readUInt16LE(i * 8), i * 4);
      b.writeUInt16LE(s.readUInt16LE(i * 8 + 2), i * 4 + 2); }
    sec[CONTAINER_INDEX.fieldRefs] = b; }

  return sec;
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

  /* ------------------------------------------- decrypt (real container + lib) */
  let roundTripSource = repaired.data;
  if (fs.existsSync(path.join(dir, 'global-metadata.container.dat'))) {
    section('decrypt (real container)');
    const { decryptMetadata } = require('../src/main/il2cpp-decrypt');
    const containerBuf = fs.readFileSync(path.join(dir, 'global-metadata.container.dat'));
    const td = Date.now();
    const out = decryptMetadata(containerBuf, fs.readFileSync(libPath));
    const decryptMs = Date.now() - td;
    const v = out.report.verification;
    check('decrypt produced a stock file', out.data.readUInt32LE(0) === 0xFAB11BAF, out.data.subarray(0, 4).toString('hex'));
    check('decrypted file validates', out.report.validation.ok === true,
      JSON.stringify((out.report.validation.issues || []).slice(0, 2)));
    const scored = v.sections.filter(s => s.samples > 0);
    check('every scored section verified', scored.every(s => s.verified),
      scored.filter(s => !s.verified).map(s => `${s.name} ${s.score}`).join(', ') || `${scored.length} at 1.0`);
    check('literal pair recovered from the descriptor',
      v.literalLayout === 'offsets' && v.literalStride === 4 && v.literalRows === 38844,
      `${v.literalLayout}@${v.literalStride}, ${v.literalRows} rows`);
    check('the offsets tile the blob', (v.literalScores.offsets || 0) >= 0.98,
      `${(((v.literalScores || {}).offsets || 0) * 100).toFixed(1)}% of rows`);
    check('no seed recovery was needed', (out.report.seedRecovery || []).length === 0,
      (out.report.seedRecovery || []).map(r => r.index).join(','));
    check('decrypt finished under 2s', decryptMs < 2000, `${decryptMs} ms`);
    roundTripSource = out.data;
  } else {
    console.log('\n(decrypt leg skipped - global-metadata.container.dat not in the payload dir)');
  }

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

  /* The listing writes a generic type's arguments with spaces and a nested type's
     full path on the declaration line. A name pattern that stops at whitespace
     drops every multi-parameter generic silently, and the type then shows up as
     "missing from dump.cs" when it is sitting right there. */
  {
    const synthetic = [
      '// Image 0: Assembly-CSharp.dll - 0',
      '',
      '// Namespace: Mono',
      'internal struct ValueTuple<T1, T2> // TypeDefIndex: 0',
      '{',
      '}',
      '',
      '// Namespace: ',
      'public sealed class Outer.Inner<T> // TypeDefIndex: 1',
      '{',
      '}',
      '',
      '// Namespace: ',
      'private sealed class <>f__AnonymousType1<<url>j__TPar> // TypeDefIndex: 2',
      '{',
      '}',
      '',
    ].join('\n');
    const p = path.join(cacheDir, 'synthetic-dump.cs');
    fs.writeFileSync(p, synthetic);
    const syn = await loadIndex(p, { cacheDir });
    check('generic type names with spaces are parsed', syn.index.types.length === 3,
      syn.index.types.map(t => t.name).join(' | '));
    check('a nested type keeps its full declaration name',
      syn.index.types[1] && syn.index.types[1].name === 'Outer.Inner<T>',
      syn.index.types[1] && syn.index.types[1].name);
  }

  /* --------------------------------------------------------------- crosscheck */
  section('cross-check: metadata vs dump.cs');
  const binary = openBinary(fs.readFileSync(libPath));
  check('relocations applied', binary.relocationsApplied > 700000, String(binary.relocationsApplied));
  const typeTable = binary.findTypeTable(REGISTRATION_VA);
  check('Il2CppType table found', typeTable.count === 61077 && typeTable.validated >= 8,
    `${typeTable.count} entries, ${typeTable.validated} sampled`);

  const cc = crossCheck(repaired.data, index, { binary, typesCount: typeTable.count });

  /* dump.cs and metadata spell a generic type differently. The two artefacts must
     compare the name, not the spelling, or every generic type is a false mismatch. */
  {
    const { sameTypeName } = require('../src/main/il2cpp-crosscheck');
    const same = [
      ['ValueTuple<T1, T2>', 'ValueTuple`2'],
      ['<>c__DisplayClass23_0<T>', '<>c__DisplayClass23_0`1'],
      ['<>f__AnonymousType1<<url>j__TPar>', '<>f__AnonymousType1`1'],
      ['FromAsyncTrimPromise<TResult, TInstance>', 'FromAsyncTrimPromise`1'],
    ];
    check('generic type names compare on their base name',
      same.every(([d, m]) => sameTypeName(d, m)) && !sameTypeName('Foo<T>', 'Bar`1'),
      same.map(([d, m]) => `${d} ~ ${m}`).join('; '));
  }

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

  /* the rename map is a worklist, written even when it is empty */
  const renamePath = path.join(outDir, 'rename-map.json');
  check('rename-map.json written', fs.existsSync(renamePath));
  if (fs.existsSync(renamePath)) {
    const rm = JSON.parse(fs.readFileSync(renamePath, 'utf8'));
    check('rename map is marked unapplied', rm.applied === false);
    check('rename map entries are an array', Array.isArray(rm.entries));
    check('rename map agrees with the report', rm.entries.length === (json.obfuscation.renameMap || []).length,
      `${rm.entries.length} entries`);
  }
  check('rename-map.md written', fs.existsSync(path.join(outDir, 'rename-map.md')));
  check('every signal carries a weight and a normal range',
    (json.obfuscation.signals || []).every(s => typeof s.weight === 'number' && typeof s.normal === 'string'),
    `${(json.obfuscation.signals || []).length} signals`);
  check('game types are ranked ahead of engine code',
    Array.isArray(json.obfuscation.ranked) && json.obfuscation.ranked.length > 0
    && !/^(System|UnityEngine|Unity)\./.test(json.obfuscation.ranked[0].name),
    json.obfuscation.ranked && json.obfuscation.ranked[0] ? json.obfuscation.ranked[0].name : 'none');
  check('rename suggestions are unique per type',
    new Set((json.obfuscation.renameMap || []).map(r => r.original)).size === (json.obfuscation.renameMap || []).length,
    `${(json.obfuscation.renameMap || []).length} suggestion(s)`);

  /* The run log is the part of the report that must be a record of the run and
     nothing else: ordered steps that actually executed, the changes that were
     applied, and the files that came out with their real sizes. */
  section('run log');
  const run = json.run;
  check('report.json carries a run log', !!run);
  if (run) {
    check('run log steps are the executed stages',
      run.steps.map(s => s.step).join(',') === 'read-binary,read-metadata,read-dump,cross-check,analyse-naming',
      run.steps.map(s => s.step).join(','));
    check('run log lists one metadata file', run.filesRead.filter(f => /metadata/i.test(f.role)).length === 1,
      run.filesRead.map(f => f.role).join(','));
    check('run log changes match the repair', run.changes.length === (json.repair.applied || []).length,
      `${run.changes.length} change(s)`);
    const outputs = new Map(run.outputs.map(o => [o.name, o.size]));
    for (const name of ['report.md', 'report.json', 'types.csv', 'rename-map.json', 'rename-map.md']) {
      const p = path.join(outDir, name);
      check(`run log size matches ${name}`, outputs.get(name) === fs.statSync(p).size,
        `${outputs.get(name)} vs ${fs.statSync(p).size}`);
    }
    const md = fs.readFileSync(path.join(outDir, 'report.md'), 'utf8');
    check('report.md does not repeat the signal table', !md.includes('| signal | measured |'));
    check('report.md states what was not recovered', /## What was not recovered/.test(md));
  }

  /* ------------------------------------------- container round trip */
  section('container round trip');
  const { verifySections, convert, assemble } = require('../src/main/il2cpp-decrypt');
  const { readHeader } = require('../src/main/il2cpp-metadata');

  /* The container stores the literal index as a 4-byte offset array - the real
     build carries 38,844 offsets, first 0, last equal to the blob size - while
     the stock file stores 8-byte {length, dataIndex} pairs. Build that shape
     from the stock pair and make the verifier recover it from the descriptor. */
  const container = encodeContainer(roundTripSource);
  let litRows = 0;
  {
    const h = readHeader(roundTripSource);
    const sl = h.sections.find(s => s.name === 'stringLiteral');
    const sld = h.sections.find(s => s.name === 'stringLiteralData');
    litRows = (sl.size / 8) | 0;
    const pair = roundTripSource.subarray(sl.offset, sl.offset + sl.size);
    const offsets = Buffer.alloc(litRows * 4);
    for (let i = 0; i < litRows; i++) offsets.writeUInt32LE(pair.readUInt32LE(i * 8 + 4), i * 4);
    container[CONTAINER_INDEX.stringLiteral] = offsets;
    container[CONTAINER_INDEX.stringLiteralData] = roundTripSource.subarray(sld.offset, sld.offset + sld.size);
  }
  const rtDesc = { [CONTAINER_INDEX.stringLiteral]: { count: litRows, size: litRows * 4 } };

  const rt = verifySections(container, { desc: rtDesc });
  const rtScored = rt.sections.filter(s => s.samples > 0);
  check('every scored section verifies', rtScored.every(s => s.verified),
    rtScored.filter(s => !s.verified).map(s => `${s.name} ${s.score}`).join(', ') || `${rtScored.length} sections at 1.0`);
  check('string table resolves as UTF-8 names', rt.stringCount > 100000, `${rt.stringCount.toLocaleString('en-US')} NUL-terminated names`);
  check('literal pair reads as an offset array', rt.literal.layout === 'offsets', String(rt.literal.layout));
  check('the offsets tile the blob exactly', rt.literal.tiles === true);
  check('sampled literal runs are text', rt.literal.scores.offsets >= 0.98, `${(rt.literal.scores.offsets * 100).toFixed(1)}%`);

  /* Older containers widened the same offset array to 8 bytes per row. The
     descriptor says so, and the verifier must read it that way instead of
     treating the second word of each row as a data index. */
  {
    const wide = Buffer.alloc(litRows * 8);
    const narrow = container[CONTAINER_INDEX.stringLiteral];
    for (let i = 0; i < litRows; i++) wide.writeUInt32LE(narrow.readUInt32LE(i * 4), i * 8);
    const sec8 = { ...container, [CONTAINER_INDEX.stringLiteral]: wide };
    const rt8 = verifySections(sec8, { desc: { [CONTAINER_INDEX.stringLiteral]: { count: litRows, size: litRows * 8 } } });
    check('widened offset array is read as offsets', rt8.literal.layout === 'offsets' && rt8.literal.stride === 8,
      `${rt8.literal.layout}@${rt8.literal.stride}`);
    check('widened offsets tile the blob', rt8.literal.tiles === true && rt8.literal.scores.offsets >= 0.98,
      `${(rt8.literal.scores.offsets * 100).toFixed(1)}%`);
  }

  const conv = convert(container, rt);
  check('genericContainerIndex recovered from the owner table', conv.recovered.genericContainerIndex === 1138,
    String(conv.recovered.genericContainerIndex));
  check('elementTypeIndex recovered from value__', conv.recovered.elementTypeIndex === 2046,
    String(conv.recovered.elementTypeIndex));
  check('literal pair emitted', conv.recovered.literalLayout === 'offsets');

  {
    const h = readHeader(roundTripSource);
    const names = ['string', 'events', 'properties', 'methods', 'parameterDefaultValues', 'fieldDefaultValues',
      'fieldAndParameterDefaultValueData', 'fieldMarshaledSizes', 'parameters', 'fields', 'genericParameters',
      'genericParameterConstraints', 'genericContainers', 'nestedTypes', 'vtableMethods', 'interfaces',
      'interfaceOffsets', 'typeDefinitions', 'images', 'assemblies', 'fieldRefs'];
    const bad = [];
    for (const name of names) {
      const s = h.sections.find(x => x.name === name);
      const want = s && s.size ? roundTripSource.subarray(s.offset, s.offset + s.size) : Buffer.alloc(0);
      const got = conv.out[name] || Buffer.alloc(0);
      if (want.length !== got.length || !want.equals(got)) bad.push(name);
    }
    check('convert() inverts the container layout exactly', bad.length === 0,
      bad.length ? bad.join(', ') : `${names.length} sections byte-identical`);
  }

  const rtBlob = assemble(conv.out).blob;
  const rtValid = validateMetadata(rtBlob);
  check('round-trip output is a valid v31 file', rtValid.ok === true, `${rtValid.issues.length} finding(s)`);
  const rtRepairs = repairMetadata(rtBlob).repairs.map(r => r.code);
  check('round trip introduces no new repair', rtRepairs.every(c => c.startsWith('fieldrefs-')),
    rtRepairs.join(', ') || 'nothing to repair');

  {
    const h = readHeader(rtBlob);
    const sl = h.sections.find(s => s.name === 'stringLiteral');
    const sld = h.sections.find(s => s.name === 'stringLiteralData');
    const rows = (sl.size / 8) | 0;
    const table = rtBlob.subarray(sl.offset, sl.offset + sl.size);
    let outside = 0, prevEnd = 0, contiguous = 0;
    for (let i = 0; i < rows; i++) {
      const len = table.readUInt32LE(i * 8);
      const di = table.readUInt32LE(i * 8 + 4);
      if (di + len > sld.size) outside++;
      if (di === prevEnd) contiguous++;
      prevEnd = di + len;
    }
    check('recovered literal table covers the whole blob', outside === 0 && contiguous === rows,
      `${rows.toLocaleString('en-US')} rows, ${outside} outside, ${contiguous} contiguous`);
  }


  /* ------------------------------------------- second container format (v2)
     The 2026 build changed the container, not the metadata: a narrower header,
     the descriptor triple reversed, per-row biased packing instead of a chain,
     and a different set of enciphered rows. The profile is data, so the test
     builds that container out of the stock sections and asks the reader to give
     the stock sections back. */
  section('second container format');
  const { PROFILES, xorBytes, decryptSections } = require('../src/main/il2cpp-decrypt');
  const V2 = PROFILES['gilla-v2'];
  const V1 = PROFILES['gilla-v1'];

  check('v2 gives every packed row a role or an explicit drop',
    V2.order.every(r => Object.prototype.hasOwnProperty.call(V2.role, r)),
    V2.order.filter(r => !Object.prototype.hasOwnProperty.call(V2.role, r)).join(','));
  check('v2 carries a bias for every packed row',
    V2.order.every(r => Number.isInteger(V2.bias[r])),
    V2.order.filter(r => !Number.isInteger(V2.bias[r])).join(','));
  check('v2 packs exactly the rows it maps', V2.order.length === 29 && Object.keys(V2.role).length === 29,
    `${V2.order.length} rows, ${Object.keys(V2.role).length} roles`);
  check('v2 header is 122 triples of {size, count, offset}',
    V2.rows === 122 && V2.fields.join(',') === 'size,count,offset',
    `${V2.rows} rows of ${V2.fields.join(',')}`);

  {
    /* Container row stride per stock section, for the descriptor's count. */
    const STRIDE = {
      stringLiteral: 4, stringLiteralData: 1, string: 1, events: 22, properties: 20,
      methods: 30, parameterDefaultValues: 10, fieldDefaultValues: 10,
      fieldAndParameterDefaultValueData: 1, fieldMarshaledSizes: 10, parameters: 10,
      fields: 10, genericParameters: 14, genericParameterConstraints: 2,
      genericContainers: 9, nestedTypes: 4, interfaces: 2, vtableMethods: 4,
      interfaceOffsets: 6, typeDefinitions: 66, images: 36, assemblies: 68,
      referencedAssemblies: 4, attributeData: 1, attributeDataRange: 8,
      unresolvedVirtualCallParameterTypes: 2, unresolvedVirtualCallParameterRanges: 8,
      fieldRefs: 4,
    };
    const TABLE = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) TABLE[i] = (i * 7 + 13) & 0xFF;      // a permutation
    const HEADER_SEED = { lo: 0x2c481603, hi: 0x321a13eb };

    /* Reference rows carry the container layout already; re-key them by role,
       then by the v2 row that carries that role. */
    const byRoleBuf = {};
    for (const [row, buf] of Object.entries(container)) {
      const role = V1.role[Number(row)];
      if (role) byRoleBuf[role] = buf;
    }
    /* Fill the sections the reference container dropped with the stock bytes, so
       every v2 row has something to carry. */
    {
      const H = readHeader(roundTripSource);
      for (const name of ['referencedAssemblies', 'attributeData', 'attributeDataRange',
        'unresolvedVirtualCallParameterTypes', 'unresolvedVirtualCallParameterRanges']) {
        if (byRoleBuf[name]) continue;
        const s = H.sections.find(x => x.name === name);
        byRoleBuf[name] = s && s.size ? roundTripSource.subarray(s.offset, s.offset + s.size) : Buffer.alloc(0);
      }
    }

    /* Physical placement: 4-byte aligned packing. genericParameters is 75,978
       bytes, so the next section starts 2 bytes past it - the same gap that put
       the real constraint table one slot early. */
    let pos = 0x800;
    const posByRow = {};
    const bodyOf = (row) => {
      const role = V2.role[row];
      return role ? byRoleBuf[role] : Buffer.alloc(16);   // the dropped row still occupies space
    };
    for (const row of V2.order) {
      posByRow[row] = pos;
      pos += bodyOf(row).length;
      pos = (pos + 3) & ~3;
    }

    const header = Buffer.alloc(V2.headerSize);
    const v2 = Buffer.alloc(pos);
    const seeded = new Set(Object.keys(V2.seeds).map(Number));
    for (const row of V2.order) {
      const role = V2.role[row];
      const body = bodyOf(row);
      const size = body.length;
      const count = role && STRIDE[role] ? Math.max(1, (size / STRIDE[role]) | 0) : 1;
      /* descriptor offset is chosen so that offset + bias lands on posByRow */
      const descOffset = posByRow[row] - V2.bias[row];
      header.writeInt32LE(size, row * 12);
      header.writeInt32LE(count, row * 12 + 4);
      header.writeInt32LE(descOffset, row * 12 + 8);
      const plain = body.length ? body : Buffer.alloc(0);
      const seed = V2.seeds[row];
      const bytes = seed
        ? xorBytes(plain, TABLE, parseInt(seed.slice(8), 16) >>> 0, parseInt(seed.slice(0, 8), 16) >>> 0)
        : plain;   // splitSeed(): high half first, low half last, as the profile writes it
      bytes.copy(v2, posByRow[row]);
    }
    const headerCipher = xorBytes(header, TABLE, HEADER_SEED.lo, HEADER_SEED.hi);
    headerCipher.copy(v2, 0);

    const rt2 = decryptSections(v2, TABLE, HEADER_SEED, V2, { recover: false });
    const wrong = [];
    for (const row of V2.order) {
      const role = V2.role[row];
      if (!role) continue;
      const got = rt2.sec[role];
      if (!got || !got.equals(byRoleBuf[role])) wrong.push(role);
    }
    check('v2 reader recovers every section byte for byte', wrong.length === 0,
      wrong.length ? wrong.join(', ') : `${Object.keys(rt2.sec).length} sections`);
    check('v2 seeded rows are the ones the profile names',
      Object.keys(rt2.seedSource).filter(r => rt2.seedSource[r] === 'known').length === 7,
      Object.keys(rt2.seedSource).filter(r => rt2.seedSource[r] === 'known').join(','));

    const ver2 = verifySections(rt2.sec, { desc: rt2.desc, profile: V2 });
    const scored2 = ver2.sections.filter(s => s.samples > 0);
    check('v2 sections verify against their own content rules',
      scored2.length >= 15 && scored2.every(s => s.verified),
      `${scored2.filter(s => s.verified).length}/${scored2.length}`);
    check('v2 literal index is read at the stride its descriptor declares',
      ver2.literal.layout === 'offsets' && ver2.literal.stride === 4,
      `${ver2.literal.layout}@${ver2.literal.stride}`);
    check('v2 sections that are not stock-form are reported, not scored',
      ver2.notChecked.length >= 3,
      ver2.notChecked.map(n => n.name).join(','));

    const conv2 = convert(rt2.sec, ver2, V2);
    {
      const h = readHeader(roundTripSource);
      const names = ['string', 'events', 'properties', 'methods', 'parameterDefaultValues', 'fieldDefaultValues',
        'fieldAndParameterDefaultValueData', 'fieldMarshaledSizes', 'parameters', 'fields', 'genericParameters',
        'genericParameterConstraints', 'genericContainers', 'nestedTypes', 'vtableMethods', 'interfaces',
        'interfaceOffsets', 'typeDefinitions', 'images', 'assemblies', 'fieldRefs'];
      const bad = [];
      for (const name of names) {
        const s = h.sections.find(x => x.name === name);
        const want = s && s.size ? roundTripSource.subarray(s.offset, s.offset + s.size) : Buffer.alloc(0);
        const got = conv2.out[name] || Buffer.alloc(0);
        if (want.length !== got.length || !want.equals(got)) bad.push(name);
      }
      check('v2 conversion inverts the container layout exactly', bad.length === 0,
        bad.length ? bad.join(', ') : `${names.length} sections byte-identical`);
    }
    check('v2 output is a valid v31 file', validateMetadata(assemble(conv2.out).blob).ok === true);
  }

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
    const lit = JSON.parse(fs.readFileSync(path.join(dumpOut, 'stringliteral.json'), 'utf8'));
    check('stringliteral.json is empty for the detached pair', lit.length === 0, `${lit.length} entries`);
    cleanup(dumpOut);

    /* The round-trip file carries a recovered literal table. This is the leg
       that used to run out of memory: a wrong {length,dataIndex} row makes the
       dumper allocate whatever length it was handed. The fieldRefs repair is
       applied first, exactly as the app does, because that table is a separate
       container defect and would stop script.json for an unrelated reason. */
    section('Il2CppDumper (round-trip metadata)');
    const rtOut = fs.mkdtempSync(path.join(os.tmpdir(), 'semenu-dump-rt-'));
    const rtPath = path.join(os.tmpdir(), `semenu-roundtrip-${Date.now()}.dat`);
    const rtDump = repairMetadata(rtBlob);
    fs.writeFileSync(rtPath, rtDump.data || rtBlob);
    const r2 = spawnSync(DUMPER, [libPath, rtPath, rtOut], {
      cwd: path.dirname(DUMPER), windowsHide: true, encoding: 'utf8',
      timeout: 20 * 60 * 1000, maxBuffer: 1024 * 1024 * 64,
    });
    const log2 = String(r2.stdout || '') + String(r2.stderr || '');
    check('round-trip dump finished', /Done!/.test(log2));
    const litPath = path.join(rtOut, 'stringliteral.json');
    check('stringliteral.json written', fs.existsSync(litPath));
    if (fs.existsSync(litPath)) {
      const bytes = fs.statSync(litPath).size;
      const entries = JSON.parse(fs.readFileSync(litPath, 'utf8'));
      check('stringliteral.json carries the pool', entries.length > 30000,
        `${entries.length.toLocaleString('en-US')} entries, ${(bytes / 1048576).toFixed(1)} MB`);
      check('literal values are text', entries.filter(e => /[A-Za-z]{4}/.test(e.value || '')).length > 10000,
        `${entries.filter(e => /[A-Za-z]{4}/.test(e.value || '')).length.toLocaleString('en-US')} word-bearing`);
    }
    check('script.json written from the round trip', fs.existsSync(path.join(rtOut, 'script.json')));
    cleanup(rtOut);
    cleanup(rtPath);
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
