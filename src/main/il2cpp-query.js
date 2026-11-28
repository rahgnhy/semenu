/* ============================================================================
   il2cpp-query.js - the read side of the dumper tab.

   Everything the UI asks after a dump lands here: search the listing, open one
   type, re-run the analysis over an output folder. No Electron in this file,
   so it runs under plain node and can be tested without launching the app.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { loadIndex, buildLookups, search } = require('./il2cpp-dump-index');
const { inferRole } = require('./il2cpp-obfuscation');
const { analyse: analyseDump, writeReports } = require('./il2cpp-report');

const MANIFEST = 'pipeline.json';

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (e) { return null; }
}

/** Read a line range out of a large file without loading the whole file. */
function readLineRange(filePath, first, last) {
  return new Promise((resolve) => {
    const out = [];
    let n = 0;
    let closed = false;
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const finish = () => { if (!closed) { closed = true; resolve(out); } };
    rl.on('line', (line) => {
      n++;
      if (n >= first && n <= last) out.push(line);
      if (n > last) { rl.close(); stream.destroy(); }
    });
    rl.on('close', finish);
    rl.on('error', finish);
    stream.on('error', finish);
  });
}

function dumpPathIn(outDir) {
  return outDir ? path.join(outDir, 'dump.cs') : '';
}

/** Where the metadata for an output folder lives, in order of preference. */
function pickMetaForDir(outDir) {
  for (const name of ['global-metadata.dec.dat', 'global-metadata.repaired.dat', 'global-metadata.dat']) {
    const p = path.join(outDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** The MetadataRegistration address is printed by the dumper; read it back. */
function registrationVaFromLog(outDir) {
  try {
    const log = fs.readFileSync(path.join(outDir, 'il2cppdumper.log'), 'utf8');
    const m = /MetadataRegistration\s*:\s*([0-9a-f]+)/i.exec(log);
    return m ? parseInt(m[1], 16) : 0;
  } catch (e) { return 0; }
}

/**
 * @param {{cacheDir?:string|()=>string}} [opts]
 */
function createQuery(opts) {
  const o = opts || {};
  const cacheDir = typeof o.cacheDir === 'function' ? o.cacheDir : () => o.cacheDir;

  /* One parsed index in memory at a time. dump.cs is 40 MB and 1.2 M lines;
     re-parsing per keystroke would make search unusable. The key carries size
     and mtime so an edited dump.cs is always re-read. */
  let memo = null;

  async function indexFor(dumpPath) {
    if (!dumpPath || !fs.existsSync(dumpPath)) {
      throw new Error('dump.cs not found: ' + (dumpPath || '(no path)'));
    }
    const st = fs.statSync(dumpPath);
    const key = `${path.resolve(dumpPath)}|${st.size}|${st.mtimeMs}`;
    if (memo && memo.key === key) return memo;
    const { index, cached } = await loadIndex(dumpPath, { cacheDir: cacheDir() });
    memo = { key, index, lookups: buildLookups(index), cached };
    return memo;
  }

  /**
   * @param {{outDir?:string, dumpPath?:string, query:string, kind?:string,
   *          namespace?:string, limit?:number}} args
   */
  async function searchDump(args) {
    const a = args || {};
    const dumpPath = a.dumpPath || dumpPathIn(a.outDir);
    const query = String(a.query || '').trim();
    if (!query) return { ok: true, query, total: 0, hits: [] };
    const { index, cached } = await indexFor(dumpPath);
    const hits = search(index, query, { limit: a.limit || 50, kind: a.kind, namespace: a.namespace });
    return { ok: true, query, total: hits.length, hits, cached };
  }

  /**
   * @param {{outDir?:string, dumpPath?:string, typeDefIndex?:number,
   *          name?:string, maxSourceLines?:number}} args
   */
  async function typeDetail(args) {
    const a = args || {};
    const dumpPath = a.dumpPath || dumpPathIn(a.outDir);
    const { index, lookups } = await indexFor(dumpPath);

    let type = null;
    if (Number.isInteger(a.typeDefIndex)) {
      const list = lookups.byTypeDefIndex.get(a.typeDefIndex);
      if (list && list.length) type = list[0];
    }
    if (!type && a.name) {
      const list = lookups.byName.get(a.name);
      if (list && list.length) type = list[0];
    }
    if (!type) return { ok: false, error: 'type not found' };

    const slot = index.types.indexOf(type);
    const fields = lookups.fieldsByType.get(slot) || [];
    const methods = lookups.methodsByType.get(slot) || [];
    const properties = lookups.propertiesByType.get(slot) || [];
    const events = index.events.filter(e => e.type === slot);
    const role = inferRole(type, { fields, methods });

    const cap = a.maxSourceLines || 400;
    const first = type.lineStart || 1;
    const last = Math.min(type.lineEnd || first, first + cap - 1);
    const source = await readLineRange(dumpPath, first, last);

    return {
      ok: true,
      type: {
        typeDefIndex: type.typeDefIndex,
        namespace: type.namespace,
        name: type.name,
        fullName: type.namespace ? `${type.namespace}.${type.name}` : type.name,
        kind: type.kind,
        parent: type.parent || null,
        methodCount: type.methodCount,
        fieldCount: type.fieldCount,
        propertyCount: type.propertyCount,
        eventCount: type.eventCount,
        lineStart: type.lineStart,
        lineEnd: type.lineEnd,
      },
      role,
      fields: fields.map(f => ({ name: f.name, fieldType: f.fieldType, value: f.value, offset: f.offset, line: f.line })),
      methods: methods.map(m => ({ name: m.name, rva: m.rva, offset: m.offset, signature: m.signature, line: m.line })),
      properties: properties.map(p => ({ name: p.name, signature: p.signature, line: p.line })),
      events: events.map(e => ({ name: e.name, eventType: e.eventType, line: e.line })),
      source,
    };
  }

  /**
   * Run the whole analysis over one output folder and write the reports next to
   * the dump. Paths come from the manifest il2cpp:dump writes, so a re-run needs
   * nothing but the folder.
   */
  async function analyseDir(args) {
    const a = args || {};
    const outDir = a.outDir;
    if (!outDir || !fs.existsSync(outDir)) return { ok: false, error: 'output folder not found' };
    const dumpPath = a.dumpPath || dumpPathIn(outDir);
    if (!fs.existsSync(dumpPath)) return { ok: false, error: 'dump.cs not found in ' + outDir };

    const manifest = readJson(path.join(outDir, MANIFEST));
    const metaPath = a.metaPath
      || (manifest && (manifest.metadataPath || manifest.repairedMetaPath || manifest.decryptedMetaPath || manifest.metaPath))
      || pickMetaForDir(outDir);
    if (!metaPath || !fs.existsSync(metaPath)) return { ok: false, error: 'no metadata file found in ' + outDir };
    const libPath = a.libPath || (manifest && manifest.libPath) || null;
    const registrationVa = a.registrationVa || (manifest && manifest.registrationVa) || registrationVaFromLog(outDir);

    /* No writeRepairedTo: the file the dumper consumed is the file on disk.
       A re-run analyses it in memory and leaves the folder's file list alone. */
    const { report, index, roleMap } = await analyseDump({
      metaPath,
      dumpPath,
      libPath: libPath && fs.existsSync(libPath) ? libPath : null,
      registrationVa,
      cacheDir: cacheDir(),
    });
    const written = writeReports(report, outDir, { index, roleMap });
    return {
      ok: true,
      outDir,
      metaPath,
      registrationVa,
      report,
      files: written.files,
      summary: summarise(report),
    };
  }

  return { indexFor, searchDump, typeDetail, analyseDir };
}

/** Compact form of a full report: everything the UI renders, nothing it does not. */
function summarise(report) {
  return {
    verdict: report.verdict,
    verdictReasons: report.verdictReasons,
    metadata: {
      version: report.metadata.version,
      size: report.metadata.size,
      okBefore: report.metadata.okBefore,
      okAfter: report.repair ? report.repair.okAfter : report.metadata.okBefore,
      counts: report.metadata.counts,
      issues: (report.metadata.issues || []).map(i => ({ severity: i.severity, code: i.code, detail: i.detail })),
      repairs: ((report.repair && report.repair.applied) || []).map(r => ({ code: r.code, detail: r.detail })),
      uncertain: [
        ...(report.metadata.uncertain || []),
        ...((report.repair && report.repair.uncertain) || []),
      ],
    },
    binary: report.binary,
    dump: report.dump,
    crosscheck: report.crosscheck,
    naming: {
      verdict: report.obfuscation.verdict,
      score: report.obfuscation.score,
      summary: report.obfuscation.summary,
      signals: report.obfuscation.signals,
      flagged: report.obfuscation.suspiciousTypes,
      findings: (report.obfuscation.findings || []).slice(0, 40),
      renameMap: (report.obfuscation.renameMap || []).slice(0, 40),
      renameMapTotal: (report.obfuscation.renameMap || []).length,
      roles: report.obfuscation.roles,
      hotNamespaces: (report.obfuscation.hotNamespaces || []).slice(0, 8),
      ranked: (report.obfuscation.ranked || []).slice(0, 60),
      gameSpecific: (report.obfuscation.gameSpecific || []).slice(0, 60),
    },
  };
}

module.exports = {
  createQuery,
  summarise,
  readLineRange,
  pickMetaForDir,
  registrationVaFromLog,
  MANIFEST,
};
