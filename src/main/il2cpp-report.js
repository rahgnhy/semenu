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
 *   onProgress?:(stage:string, detail?:object)=>void
 * }} opts
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
    binary: null,
    dump: null,
    crosscheck: null,
    obfuscation: null,
    verdict: 'fail',
    verdictReasons: [],
  };

  /* ---- 1. metadata: validate, repair, validate again -------------------- */
  progress('metadata', { path: o.metaPath });
  const metaBuf = fs.readFileSync(o.metaPath);
  const before = validateMetadata(metaBuf);
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
  if (!before.ok || before.issues.some(i => i.severity === 'error')) {
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

  /* ---- 2. binary: find the Il2CppType table ---------------------------- */
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
    findings: naming.findings,
    roles: naming.roles ? naming.roles.buckets : null,
    roleExamples: naming.roles ? naming.roles.examples : null,
    gameSpecific: naming.roles ? naming.roles.gameSpecific : null,
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
  progress('done');
  return { report, index, roleMap: naming.roleMap };
}

/* ---------------------------------------------------------------- writers */

function pct(n, of) {
  if (!of) return '0%';
  return `${((n / of) * 100).toFixed(2)}%`;
}

/**
 * Human-readable report. Fixed width, no colour, no filler.
 */
function toMarkdown(r) {
  const L = [];
  const push = (...xs) => L.push(...xs);

  push(`# IL2CPP analysis report`, '');
  push(`Generated ${r.generatedAt}`, '');
  push(`**Verdict: ${r.verdict.toUpperCase()}**`, '');
  for (const reason of r.verdictReasons) push(`- ${reason}`);
  push('');

  push('## Files', '');
  push('| role | path | size |');
  push('| --- | --- | --- |');
  for (const [role, f] of Object.entries(r.files)) {
    if (!f) continue;
    push(`| ${role} | \`${f.path}\` | ${f.missing ? 'missing' : f.size.toLocaleString('en-US') + ' B'} |`);
  }
  push('');

  const m = r.metadata;
  push('## Metadata', '');
  push(`- version: ${m.version}`);
  push(`- size: ${m.size.toLocaleString('en-US')} bytes`);
  push(`- structurally valid before repair: ${m.okBefore ? 'yes' : 'no'}`);
  if (r.repair) push(`- valid after repair: ${r.repair.okAfter ? 'yes' : 'no'}`);
  push('');
  push('| table | rows |');
  push('| --- | --- |');
  for (const [k, v] of Object.entries(m.counts)) push(`| ${k} | ${v.toLocaleString('en-US')} |`);
  push('');

  if (m.issues.length) {
    push('### Findings', '');
    push('| severity | code | detail |');
    push('| --- | --- | --- |');
    for (const i of m.issues) push(`| ${i.severity} | \`${i.code}\` | ${i.detail.replace(/\|/g, '\\|')} |`);
    push('');
  }

  if (r.repair && r.repair.applied.length) {
    push('### Repairs applied', '');
    for (const rep of r.repair.applied) push(`- \`${rep.code}\` - ${rep.detail}`);
    push('');
  }
  if (r.repair && r.repair.uncertain.length) {
    push('### Not recovered', '');
    for (const u of r.repair.uncertain) push(`- ${u}`);
    push('');
  }

  if (r.binary) {
    push('## Binary', '');
    push(`- relocations applied: ${r.binary.relocationsApplied}`);
    push(`- relocations skipped: ${r.binary.relocationsSkipped}`);
    if (r.binary.typeTable) {
      const t = r.binary.typeTable;
      push(`- Il2CppType table: ${t.count.toLocaleString('en-US')} entries at 0x${(t.pointer >>> 0).toString(16)} (registration slot 0x${(t.slot >>> 0).toString(16)})`);
      push(`- table validated on ${t.validatedSamples} sampled entries`);
      if (t.error) push(`- ${t.error}`);
    }
    push('');
  }

  const d = r.dump;
  push('## dump.cs', '');
  push(`- lines: ${d.lines.toLocaleString('en-US')}`);
  push(`- types: ${d.types.toLocaleString('en-US')}`);
  push(`- methods: ${d.methods.toLocaleString('en-US')}`);
  push(`- fields: ${d.fields.toLocaleString('en-US')}`);
  push(`- properties: ${d.properties.toLocaleString('en-US')}`);
  push(`- attributes: ${d.attributes.toLocaleString('en-US')}`);
  push(`- body lines that matched no rule: ${d.unparsedLines}`);
  push('');

  const c = r.crosscheck;
  push('## Cross-check', '');
  push('| check | metadata | dump.cs |');
  push('| --- | --- | --- |');
  push(`| types | ${c.metadata.types.toLocaleString('en-US')} | ${c.dump.types.toLocaleString('en-US')} |`);
  push(`| methods | ${c.metadata.methods.toLocaleString('en-US')} | ${c.dump.methods.toLocaleString('en-US')} |`);
  push(`| fields | ${c.metadata.fields.toLocaleString('en-US')} | ${c.dump.fields.toLocaleString('en-US')} |`);
  push(`| images | ${c.metadata.images} | ${c.images.dump} |`);
  push('');
  push('| disagreement | count |');
  push('| --- | --- |');
  for (const [k, v] of Object.entries(c.summary)) push(`| ${k} | ${v} |`);
  push('');

  const o = r.obfuscation;
  push('## Naming', '');
  push(`**${o.verdict}** (score ${o.score}) - ${o.summary}`, '');
  push('| signal | measured | of | pressure | normal |');
  push('| --- | --- | --- | --- | --- |');
  for (const s of o.signals) {
    push(`| ${s.name} | ${s.measured} | ${s.of} | ${s.pressure} | ${s.normal} |`);
  }
  push('');
  if (o.findings && o.findings.length) {
    push('### Flagged names', '');
    push('| type | reason | role | suggestion |');
    push('| --- | --- | --- | --- |');
    for (const f of o.findings.slice(0, 50)) {
      push(`| \`${f.original}\` | ${f.suspicion.reasons.join(', ')} | ${f.role || '-'} | ${f.suggestion || '-'} |`);
    }
    push('');
  }
  if (o.roles) {
    push('## Roles', '');
    push('| role | types |');
    push('| --- | --- |');
    for (const [k, v] of Object.entries(o.roles).sort((a, b) => b[1] - a[1])) push(`| ${k} | ${v} |`);
    push('');
  }
  if (o.gameSpecific && o.gameSpecific.length) {
    push('## Game-specific types', '');
    push('| type | kind | methods | fields | base |');
    push('| --- | --- | --- | --- | --- |');
    for (const g of o.gameSpecific.slice(0, 100)) {
      push(`| \`${g.name}\` | ${g.kind} | ${g.methods} | ${g.fields} | ${g.parent || '-'} |`);
    }
    push('');
  }

  push('---', '');
  push('Every number above was read from the supplied files. Nothing was inferred where the data was absent.');
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
 * Write report.json, report.md and types.csv into outDir.
 * @returns {{files:Array<{name:string,path:string,size:number}>}}
 */
function writeReports(report, outDir, extras) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];

  const jsonPath = path.join(outDir, 'report.json');
  const json = JSON.stringify(report, null, 2);
  fs.writeFileSync(jsonPath, json);
  files.push({ name: 'report.json', path: jsonPath, size: Buffer.byteLength(json) });

  const md = toMarkdown(report);
  const mdPath = path.join(outDir, 'report.md');
  fs.writeFileSync(mdPath, md);
  files.push({ name: 'report.md', path: mdPath, size: Buffer.byteLength(md) });

  if (extras && extras.index) {
    const csv = toCsv(extras.index, extras.roleMap);
    const csvPath = path.join(outDir, 'types.csv');
    fs.writeFileSync(csvPath, csv);
    files.push({ name: 'types.csv', path: csvPath, size: Buffer.byteLength(csv) });
  }

  return { files };
}

module.exports = { analyse, writeReports, toMarkdown, REPORT_VERSION };
