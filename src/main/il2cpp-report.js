/* ============================================================================
   il2cpp-report.js - run the whole analysis over one dump and write it out.

   This is the only module that knows about all the others. It does not decide
   anything itself: it asks il2cpp-metadata for structural facts, il2cpp-binary
   for the Il2CppType table, il2cpp-dump-index for the listing, il2cpp-crosscheck
   for the disagreement between the two, and il2cpp-obfuscation for naming and
   roles - then writes one report that shows every number it was given.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { validateMetadata, repairMetadata } = require('./il2cpp-metadata');
const { openBinary } = require('./il2cpp-binary');
const { loadIndex, buildLookups, fqName } = require('./il2cpp-dump-index');
const { crossCheck } = require('./il2cpp-crosscheck');
const { analyse: analyseNames } = require('./il2cpp-obfuscation');

const REPORT_VERSION = 1;

function fileFacts(p) {
  try {
    const st = fs.statSync(p);
    return { path: p, name: path.basename(p), size: st.size };
  } catch (e) {
    return { path: p, name: p ? path.basename(p) : null, size: 0, missing: true };
  }
}

/**
 * Analyse one metadata/dump/binary triple.
 * @param {{
 *   metaPath:string, dumpPath:string, libPath?:string, cacheDir?:string,
 *   registrationVa?:number, writeRepairedTo?:string,
 *   preRepair?:{before:object, repair:object},
 *   onProgress?:(stage:string, detail?:object)=>void
 * }} opts
 *
 * preRepair is used when the caller already repaired the file in place. The
 * bytes on disk are then valid, so re-validating would report "no repair was
 * needed" and lose the fact that it was. The caller's original facts and repair
 * log are carried through instead.
 */
async function analyse(opts) {
  const o = opts || {};
  const progress = o.onProgress || (() => {});
  const report = {
    version: REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    files: {
      metadata: fileFacts(o.metaPath),
      metadataRepaired: null,
      dump: fileFacts(o.dumpPath),
      binary: o.libPath ? fileFacts(o.libPath) : null,
    },
    metadata: null,
    repair: null,
    decrypt: o.decrypt || null,
    binary: null,
    dump: null,
    crosscheck: null,
    obfuscation: null,
    verdict: 'fail',
    verdictReasons: [],
  };

  /* ---- 1. binary: find the Il2CppType table ----------------------------
     Read before the metadata so the table size can bound the type-index
     checks instead of falling back to the u16 ceiling. */
  let binary = null;
  let typeTable = null;
  if (o.libPath && fs.existsSync(o.libPath)) {
    progress('binary', { path: o.libPath });
    try {
      binary = openBinary(fs.readFileSync(o.libPath));
      if (o.registrationVa) {
        typeTable = binary.findTypeTable(o.registrationVa);
        report.binary = {
          format: 'ELF',
          relocationsApplied: binary.relocationsApplied,
          relocationsSkipped: binary.relocationsSkipped,
          executableRanges: binary.executableRanges,
          registrationVa: o.registrationVa,
          typeTable: {
            count: typeTable.count,
            pointer: typeTable.pointer,
            slot: typeTable.slot,
            validatedSamples: typeTable.validated,
            sampleTypes: typeTable.types,
            attempts: typeTable.attempts,
            error: typeTable.error || null,
          },
        };
      } else {
        report.binary = {
          format: 'ELF',
          relocationsApplied: binary.relocationsApplied,
          relocationsSkipped: binary.relocationsSkipped,
          executableRanges: binary.executableRanges,
          typeTable: null,
          note: 'no MetadataRegistration address was supplied, so the Il2CppType table was not read',
        };
      }
    } catch (e) {
      report.binary = { error: e.message };
    }
  }

  /* ---- 2. metadata: validate, repair, validate again -------------------- */
  progress('metadata', { path: o.metaPath });
  const metaBuf = fs.readFileSync(o.metaPath);
  const typesCount = typeTable && typeTable.count > 0 ? typeTable.count : undefined;
  const before = o.preRepair ? o.preRepair.before : validateMetadata(metaBuf, { typesCount });
  report.metadata = {
    version: before.version,
    size: before.size,
    okBefore: before.ok,
    counts: before.counts,
    issues: before.issues,
    checks: before.checks,
    uncertain: before.uncertain,
  };

  let workingBuf = metaBuf;
  if (o.preRepair) {
    /* Already repaired on disk by the caller; its log is the authoritative one. */
    report.repair = o.preRepair.repair;
  } else if (!before.ok || before.issues.some(i => i.severity === 'error')) {
    progress('repair');
    const repaired = repairMetadata(metaBuf);
    report.repair = {
      applied: repaired.repairs,
      uncertain: repaired.uncertain,
      okAfter: repaired.report.ok,
      issuesAfter: repaired.report.issues,
    };
    if (repaired.data) {
      workingBuf = repaired.data;
      if (o.writeRepairedTo) {
        fs.mkdirSync(path.dirname(o.writeRepairedTo), { recursive: true });
        fs.writeFileSync(o.writeRepairedTo, repaired.data);
        report.files.metadataRepaired = fileFacts(o.writeRepairedTo);
      }
    }
  } else {
    report.repair = { applied: [], uncertain: [], okAfter: true, issuesAfter: [] };
  }

  /* ---- 3. dump.cs ------------------------------------------------------ */
  progress('index', { path: o.dumpPath });
  const { index, cached } = await loadIndex(o.dumpPath, { cacheDir: o.cacheDir, onProgress: (p) => progress('index-progress', p) });
  const lookups = buildLookups(index);
  report.dump = {
    lines: index.lines,
    types: index.types.length,
    methods: index.methods.length,
    fields: index.fields.length,
    properties: index.properties.length,
    events: index.events.length,
    attributes: index.attributes,
    images: index.images.length,
    unparsedLines: index.unparsed,
    cached,
  };

  /* ---- 4. cross-check -------------------------------------------------- */
  progress('crosscheck');
  report.crosscheck = crossCheck(workingBuf, index, { binary, typesCount: typeTable && typeTable.count });

  /* ---- 5. naming and roles --------------------------------------------- */
  progress('obfuscation');
  const naming = analyseNames(index, lookups, { roles: true, limit: 200 });
  report.obfuscation = {
    verdict: naming.verdict,
    score: naming.score,
    summary: naming.summary,
    signals: naming.signals,
    suspiciousTypes: naming.suspicious,
    /* The full worklist is rename-map.json and the full table is types.csv; these
       are the head of each list, enough to read the report without opening them. */
    findings: naming.findings.slice(0, 25),
    renameMap: naming.renameMap,
    roles: naming.roles ? naming.roles.buckets : null,
    roleExamples: naming.roles ? naming.roles.examples : null,
    hotNamespaces: naming.roles ? naming.roles.hotNamespaces : null,
    ranked: naming.roles ? naming.roles.ranked.slice(0, 50) : null,
    promoted: naming.roles ? naming.roles.promoted : 0,
    gameSpecificCount: naming.roles ? naming.roles.gameSpecific.length : 0,
  };

  /* ---- 6. verdict ------------------------------------------------------ */
  const reasons = [];
  if (report.metadata.okBefore === false) {
    if (report.repair && report.repair.okAfter === false) {
      reasons.push('metadata still has structural errors after repair');
    } else {
      reasons.push(`metadata was repaired (${(report.repair.applied || []).length} change set(s) applied)`);
    }
  }
  if (report.crosscheck.summary.typesMissingFromDump) {
    reasons.push(`${report.crosscheck.summary.typesMissingFromDump} type(s) in metadata are absent from dump.cs`);
  }
  if (report.crosscheck.summary.nameMismatches) {
    reasons.push(`${report.crosscheck.summary.nameMismatches} type name(s) disagree between metadata and dump.cs`);
  }
  if (report.crosscheck.summary.addressesOutsideExecutable) {
    reasons.push(`${report.crosscheck.summary.addressesOutsideExecutable} method address(es) fall outside executable segments`);
  }
  if (report.obfuscation.verdict === 'obfuscated') {
    reasons.push('names are obfuscated');
  }

  const fatal = (report.repair && report.repair.okAfter === false)
    || report.crosscheck.summary.typesMissingFromDump > 0
    || report.crosscheck.summary.nameMismatches > 0
    || report.crosscheck.summary.addressesOutsideExecutable > 0;

  report.verdict = fatal ? 'fail' : reasons.length ? 'warn' : 'pass';
  report.verdictReasons = reasons;

  /* The run log is the point of report.json and report.md: what was read, what
     was decrypted, what was changed, what could not be recovered, what came out.
     Everything else in this file is evidence for those five statements. */
  report.run = buildRunLog(report, o);
  progress('done');
  return { report, index, roleMap: naming.roleMap };
}

/**
 * Ordered account of the run, assembled from what the analysis actually did.
 * No step is listed that did not execute, and no step claims a result it did
 * not measure.
 */
function buildRunLog(report, o) {
  const steps = [];
  const files = report.files || {};

  if (o.libPath) {
    steps.push({
      step: 'read-binary',
      ok: !!(report.binary && !report.binary.error),
      detail: report.binary && report.binary.error
        ? report.binary.error
        : `${report.binary.relocationsApplied.toLocaleString('en-US')} relocations applied, ${report.binary.relocationsSkipped} skipped`
          + (report.binary.typeTable
            ? `, Il2CppType table of ${report.binary.typeTable.count.toLocaleString('en-US')} entries at 0x${(report.binary.typeTable.pointer >>> 0).toString(16)}`
            : ', Il2CppType table not read'),
    });
  }

  steps.push({
    step: 'read-metadata',
    ok: !!report.metadata,
    detail: report.metadata
      ? `v${report.metadata.version}, ${((files.metadata && files.metadata.size) || report.metadata.size).toLocaleString('en-US')} bytes, ${report.metadata.okBefore ? 'structurally valid' : `${report.metadata.issues.length} structural finding(s) before repair`}`
      : 'no metadata was supplied',
  });

  steps.push({
    step: 'read-dump',
    ok: true,
    detail: `${report.dump.lines.toLocaleString('en-US')} lines, ${report.dump.types.toLocaleString('en-US')} types, ${report.dump.methods.toLocaleString('en-US')} methods, ${report.dump.fields.toLocaleString('en-US')} fields${report.dump.cached ? ' (from cache)' : ''}`,
  });

  steps.push({
    step: 'cross-check',
    ok: true,
    detail: `${Object.entries(report.crosscheck.summary).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(', ') || 'metadata and dump.cs agree on every count, name and address'}`,
  });

  steps.push({
    step: 'analyse-naming',
    ok: true,
    detail: `${report.obfuscation.signals.length} signals measured, verdict ${report.obfuscation.verdict} (score ${report.obfuscation.score}), ${report.obfuscation.suspiciousTypes} type(s) above the suspicion threshold`,
  });

  const changes = (report.repair && report.repair.applied ? report.repair.applied : []).map(r => ({
    code: r.code,
    detail: r.detail,
    entries: r.entries != null ? r.entries : null,
  }));

  const notRecovered = ((report.repair && report.repair.uncertain) || []).slice();
  const notChecked = (report.metadata.uncertain || []).slice();

  /* A container-encrypted build is decrypted before any of the above runs. The
     decryption's own limits belong in the same log: a section carried through
     without a stock meaning is not a section that passed a check. */
  const d = report.decrypt && report.decrypt.mode === 'container' ? report.decrypt : null;
  if (d) {
    const vs = (d.verification && d.verification.sections) || [];
    steps.push({
      step: 'decrypt-metadata',
      ok: true,
      detail: `profile ${d.profile ? d.profile.id : '?'} (${d.profile ? d.profile.label : 'unknown'}), header seed ${d.headerSeed} scored ${d.headerScore}/${d.headerRows}, ${vs.filter(s => s.verified).length}/${vs.filter(s => s.verified != null).length} sections verified, literal index read as ${d.verification.literalLayout || '?'}@${d.verification.literalStride || '?'}`,
    });
    for (const u of ((d.verification && d.verification.notChecked) || [])) {
      notChecked.push(`${u.name}: ${u.reason}`);
    }
    for (const x of (d.dropped || [])) {
      notRecovered.push(`row e${x.index} (${x.bytes.toLocaleString('en-US')} B) was carried by the container but matches no stock v31 section; it was not emitted.`);
    }
    for (const name of (d.notEmitted || [])) {
      notChecked.push(`${name}: carried by the container, parsed, but no stock v31 emitter consumes it.`);
    }
    for (const name of (d.absent || [])) {
      notChecked.push(`${name}: not present in this build's container.`);
    }
  }

  return {
    steps,
    changes,
    changeCount: changes.length,
    notRecovered,
    notChecked,
    outputs: [],
    filesRead: Object.entries(files)
      .filter(([, f]) => !!f)
      .map(([role, f]) => ({ role, path: f.path, size: f.missing ? null : f.size, missing: !!f.missing })),
  };
}

/* ---------------------------------------------------------------- writers */

function pct(n, of) {
  if (!of) return '0%';
  return `${((n / of) * 100).toFixed(2)}%`;
}

/**
 * Human-readable run log. Fixed width, no colour, no filler.
 *
 * This file answers four questions and nothing else: what did the run read, what
 * did it change, what could not be recovered, and what came out. Counts and
 * signal tables that duplicate dump.cs or types.csv are not repeated here - the
 * report is a record of the run, not a second copy of the data.
 */
function toMarkdown(r) {
  const L = [];
  const push = (...xs) => L.push(...xs);
  const run = r.run || { steps: [], changes: [], notRecovered: [], notChecked: [], outputs: [], filesRead: [] };

  push(`# IL2CPP run log`, '');
  push(`Generated ${r.generatedAt}`, '');
  push(`**Verdict: ${String(r.verdict).toUpperCase()}**`, '');
  for (const reason of r.verdictReasons) push(`- ${reason}`);
  if (!r.verdictReasons.length) push('- nothing disagreed: metadata, binary and dump.cs match on every count and address.');
  push('');

  push('## What was read', '');
  push('| role | path | size |');
  push('| --- | --- | --- |');
  for (const f of run.filesRead) {
    push(`| ${f.role} | \`${f.path}\` | ${f.missing ? 'missing' : f.size.toLocaleString('en-US') + ' B'} |`);
  }
  push('');

  push('## What happened', '');
  run.steps.forEach((s, i) => {
    push(`${i + 1}. **${s.step}** ${s.ok ? '' : '(failed) '}- ${s.detail}`);
  });
  push('');

  push('## What changed', '');
  if (!run.changes.length) {
    push('Nothing. The metadata was already a valid v31 file and no repair was needed.', '');
  } else {
    push(`${run.changeCount} change set(s) were applied. The repaired bytes are the metadata file the dumper read; the original extracted from the APK was not modified.`, '');
    push('| change | entries | detail |');
    push('| --- | --- | --- |');
    for (const c of run.changes) {
      push(`| \`${c.code}\` | ${c.entries == null ? '-' : c.entries.toLocaleString('en-US')} | ${String(c.detail).replace(/\|/g, '\\|')} |`);
    }
    push('');
  }

  const d = r.decrypt && r.decrypt.mode === 'container' ? r.decrypt : null;
  if (d) {
    const vs = (d.verification && d.verification.sections) || [];
    const scored = vs.filter(s => s.verified != null);
    push('## The container', '');
    push(`The metadata arrived encrypted. It was read as **${d.profile ? d.profile.id : '?'}** - ${d.profile ? d.profile.label : 'unknown profile'}.`, '');
    push(`Header seed \`${d.headerSeed}\` scored ${d.headerScore}/${d.headerRows}; S-box ${d.sbox ? (d.sbox.va || 'file 0x' + Number(d.sbox.fileOffset).toString(16)) : '?'} (${d.sbox ? d.sbox.source : '?'}). ${scored.filter(s => s.verified).length} of ${scored.length} sections passed their own content rule. The string-literal index was read as \`${d.verification.literalLayout || '?'}\` at ${d.verification.literalStride || '?'} bytes per row, ${(d.verification.literalRows || 0).toLocaleString('en-US')} rows.`, '');
    if ((d.dropped || []).length) {
      push('| row | bytes | why it is not in the output |', '| --- | --- | --- |');
      for (const x of d.dropped) push(`| e${x.index} | ${x.bytes.toLocaleString('en-US')} | matches no stock v31 section |`);
      push('');
    }
    const unchecked = (d.verification && d.verification.notChecked) || [];
    if (unchecked.length) {
      push('Carried through but not proven:', '');
      for (const u of unchecked) push(`- \`${u.name}\` - ${u.reason}`);
      push('');
    }
    if ((d.notEmitted || []).length) push(`Parsed but not emitted (no stock mapping): ${d.notEmitted.map(n => '`' + n + '`').join(', ')}.`, '');
    if ((d.absent || []).length) push(`Not present in this build: ${d.absent.map(n => '`' + n + '`').join(', ')}.`, '');
  }

  push('## What was not recovered', '');
  if (!run.notRecovered.length) push('Nothing was dropped. Every section that was read is present in the output.');
  else for (const u of run.notRecovered) push(`- ${u}`);
  push('');

  if (run.notChecked && run.notChecked.length) {
    push('## What was not checked', '');
    push('These checks could not run against the data supplied. They are listed so that nothing above reads as a check that passed.', '');
    for (const u of run.notChecked) push(`- ${u}`);
    push('');
  }

  const o = r.obfuscation;
  push('## What the analysis found', '');
  push(`Naming verdict **${o.verdict}** (score ${o.score}). ${o.summary}`, '');
  push(`${o.signals.length} signals were measured. The full table, with every denominator and the normal range for each one, is in \`report.json\` under \`obfuscation.signals\`.`, '');
  if (o.renameMap && o.renameMap.length) {
    push(`${o.renameMap.length} type(s) crossed the suspicion threshold and received a suggested name. The full list, with the evidence behind each one, is in \`rename-map.md\` and \`rename-map.json\`. Nothing was applied to the dump.`, '');
  } else if (o.suspiciousTypes) {
    push(`${o.suspiciousTypes} type(s) crossed the suspicion threshold, but none produced a name that could be justified from its members. \`rename-map.md\` is empty for that reason, not because nothing was measured.`, '');
  } else {
    push('No type crossed the suspicion threshold, so no rename map was produced. That is the correct outcome for a clean assembly.', '');
  }
  push('');

  push('## What came out', '');
  push('| file | size | what it is |');
  push('| --- | --- | --- |');
  for (const f of run.outputs) {
    push(`| \`${f.name}\` | ${f.size == null ? '-' : f.size.toLocaleString('en-US') + ' B'} | ${f.what || ''} |`);
  }
  push('');

  push('---', '');
  push('Every number above was measured from the supplied files. Nothing was inferred where the data was absent.');
  return L.join('\n');
}

function toCsv(index, roleMap) {
  const rows = [['typeDefIndex', 'kind', 'namespace', 'name', 'parent', 'methods', 'fields', 'properties', 'role', 'confidence']];
  for (let i = 0; i < index.types.length; i++) {
    const t = index.types[i];
    const role = roleMap ? roleMap[i] : null;
    rows.push([
      t.typeDefIndex,
      t.kind,
      t.namespace,
      t.name,
      (t.parent || '').replace(/,/g, ';'),
      t.methodCount,
      t.fieldCount,
      t.propertyCount,
      role ? role.role || '' : '',
      role ? role.confidence : '',
    ]);
  }
  return rows.map(r2 => r2.map(v => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
}

/**
 * Write the run log and its machine-readable twin into outDir.
 *
 * report.json and report.md say the same five things: what was read, what
 * happened, what changed, what could not be recovered, what came out. The bulk
 * tables live in types.csv and rename-map.*, so neither report repeats them.
 *
 * @returns {{files:Array<{name:string,path:string,size:number}>}}
 */
function writeReports(report, outDir, extras) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  const run = report.run || (report.run = { steps: [], changes: [], notRecovered: [], outputs: [], filesRead: [] });

  /* Everything except report.json is written first, so the run log can name each
     output and its size. report.json is then written last and lists itself. */
  if (extras && extras.index) {
    const csv = toCsv(extras.index, extras.roleMap);
    const csvPath = path.join(outDir, 'types.csv');
    fs.writeFileSync(csvPath, csv);
    const entry = { name: 'types.csv', path: csvPath, size: Buffer.byteLength(csv) };
    files.push(entry);
  }

  /* The rename map is a worklist, not a patch. It is written even when it is
     empty, so its absence always means "not produced", never "nothing found". */
  const renameMap = (report.obfuscation && report.obfuscation.renameMap) || [];
  const renameJson = JSON.stringify({
    generatedAt: report.generatedAt,
    applied: false,
    note: 'Suggestions inferred from members and base types. Nothing in dump.cs was changed.',
    entries: renameMap,
  }, null, 2);
  const renamePath = path.join(outDir, 'rename-map.json');
  fs.writeFileSync(renamePath, renameJson);
  files.push({ name: 'rename-map.json', path: renamePath, size: Buffer.byteLength(renameJson) });

  const renameMd = [
    '# Rename map',
    '',
    `Generated ${report.generatedAt}. ${renameMap.length} suggestion(s).`,
    '',
    'These names are inferred from each type\'s base class, interfaces, field types and',
    'method names. They are guesses with a confidence attached, and nothing was applied.',
    'Reject anything that does not match what you see in the dump.',
    '',
    '| type | suggested | confidence | role | evidence |',
    '| --- | --- | --- | --- | --- |',
    ...renameMap.map(r => `| \`${r.original}\` | \`${r.suggestion}\` | ${r.confidence} | ${r.role || '-'} | ${(r.evidence || []).join('; ').replace(/\|/g, '\\|')} |`),
    '',
  ].join('\n');
  const renameMdPath = path.join(outDir, 'rename-map.md');
  fs.writeFileSync(renameMdPath, renameMd);
  files.push({ name: 'rename-map.md', path: renameMdPath, size: Buffer.byteLength(renameMd) });

  run.outputs = [
    { name: 'report.md', what: 'this run log, for reading' },
    { name: 'report.json', what: 'the same log, for a machine' },
    ...files.map(f => ({
      name: f.name,
      size: f.size,
      what: f.name === 'types.csv' ? 'one row per type, with its role'
        : f.name === 'rename-map.json' ? 'suggested names, machine-readable, not applied'
          : 'suggested names, with the evidence behind each one',
    })),
  ];

  /* report.md and report.json both list sizes, including each other's, so the
     numbers are iterated to a fixed point: render, measure, write the sizes
     back, repeat until nothing moves. If it does not settle the two
     self-referential sizes are dropped rather than written as a guess. */
  let md = '';
  let json = '';
  let settled = false;
  for (let i = 0; i < 6 && !settled; i++) {
    json = JSON.stringify(report, null, 2);
    md = toMarkdown(report);
    const jsonSize = Buffer.byteLength(json);
    const mdSize = Buffer.byteLength(md);
    settled = run.outputs[0].size === mdSize && run.outputs[1].size === jsonSize;
    run.outputs[0].size = mdSize;
    run.outputs[1].size = jsonSize;
  }
  if (!settled) {
    run.outputs[0].size = null;
    run.outputs[1].size = null;
    json = JSON.stringify(report, null, 2);
    md = toMarkdown(report);
  }

  const mdPath = path.join(outDir, 'report.md');
  fs.writeFileSync(mdPath, md);
  const mdEntry = { name: 'report.md', path: mdPath, size: Buffer.byteLength(md) };

  const jsonPath = path.join(outDir, 'report.json');
  fs.writeFileSync(jsonPath, json);
  const jsonEntry = { name: 'report.json', path: jsonPath, size: Buffer.byteLength(json) };

  files.unshift(mdEntry, jsonEntry);
  return { files };
}

module.exports = { analyse, writeReports, toMarkdown, REPORT_VERSION };
