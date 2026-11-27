/* ============================================================================
   il2cpp-dump-index.js - streaming parser and searchable index for dump.cs.

   dump.cs from Il2CppDumper is a flat listing: one type per block, a
   "// Namespace:" comment above it, "// TypeDefIndex: N" on the header line, and
   a closing brace in column 0. Nothing nests, so a line scanner is enough - no
   whole-file read, no regex over 42 MB, no loading the dump into the caller.

   The index is cached next to the app's user data and keyed on path + size +
   mtime + this file's own hash, so an unchanged dump is never re-parsed and a
   parser edit can never serve rows produced by older rules.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const CACHE_VERSION = 5;

const PARSER_FINGERPRINT = crypto
  .createHash('sha1')
  .update(fs.readFileSync(__filename))
  .digest('hex')
  .slice(0, 12);
const INDEX_VERSION = `${CACHE_VERSION}:${PARSER_FINGERPRINT}`;

/* "protected internal" and "private protected" are single access modifiers in
   C# but two words in the listing. Both are accepted as one prefix. */
const ACCESS = '(?:(?:public|internal|private|protected)(?:\\s+(?:internal|protected))?\\s+)?';
const MODIFIERS = '(?:(?:sealed|abstract|static|readonly|ref|unsafe|partial)\\s+)*';
const RE_TYPE = new RegExp(
  '^' + ACCESS + MODIFIERS + '(class|struct|enum|interface)\\s+([^\\s:{]+)' +
  '(?:\\s*:\\s*([^/{]+?))?\\s*(?:\\/\\/\\s*TypeDefIndex:\\s*(\\d+))?\\s*$');

/* Interface and abstract methods carry "RVA: -1 Offset: -1" instead of an address. */
const RE_RVA = /^\s*\/\/\s*RVA:\s*(-1|0x[0-9A-Fa-f]+)\s+Offset:\s*(-1|0x[0-9A-Fa-f]+)\s+(?:VA:\s*(-1|0x[0-9A-Fa-f]+)\s*)?(?:Slot:\s*(\d+))?/;

/* Compiler-generated members can be named 819B40F8... or CS$<>8__locals1, so the
   identifier class has to accept a digit first and '$' inside. */
const RE_FIELD = /^\t(?:(?:public|private|protected|internal|readonly|static|const|volatile|unsafe)\s+)*(.+?)\s+([\w<>\[\],.`$@]+)\s*(?:=\s*(.+?))?;\s*(?:\/\/\s*(0x[0-9A-Fa-f]+))?\s*$/;

/* Property names can be explicit interface implementations: System.ITuple.Length */
const RE_PROP = /^\t(?:(?:public|private|protected|internal|virtual|override|abstract|static|sealed|new)\s+)*(.+?)\s+([\w<>\[\],.`$@]+)\s*\{\s*(.*?)\s*\}\s*$/;

const RE_NS = /^\/\/\s*Namespace:\s?(.*)$/;
const RE_IMAGE = /^\/\/\s*Image\s+(\d+):\s*(.+?)\s+-\s+(\d+)\s*$/;

/* Type-level attributes sit at column 0, directly above the declaration. */
const RE_ATTR_TOP = /^\[(.+)\]\s*$/;
const RE_ATTR = /^\t\[(.+)\]\s*$/;
const RE_SECTION = /^\t\/\/ (Fields|Properties|Methods|Events|Nested types|Attributes)$/;

function emptyIndex() {
  return {
    version: INDEX_VERSION,
    file: null,
    size: 0,
    mtimeMs: 0,
    parsedAt: 0,
    lines: 0,
    images: [],
    types: [],
    methods: [],
    fields: [],
    properties: [],
    events: [],
    attributes: 0,
    unparsed: 0,
  };
}

/** Name shown for a method: the last token before the parameter list, minus any
 *  generic argument list, so "UnsafeMov<S, R>" reports "UnsafeMov". */
function methodName(head) {
  let s = head.trim();
  if (s.endsWith('>')) {
    let depth = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i] === '>') depth++;
      else if (s[i] === '<') {
        depth--;
        if (depth === 0) { s = s.slice(0, i).trimEnd(); break; }
      }
    }
  }
  const token = /(\S+)\s*$/.exec(s);
  if (!token) return '';
  const raw = token[1];
  /* explicit interface implementation: System.IDisposable.Dispose -> Dispose */
  if (/^[A-Za-z_<>]/.test(raw) && raw.includes('.')) return raw.slice(raw.lastIndexOf('.') + 1);
  return raw;
}

function methodRow(line, lineNo, rva, typeSlot, typeDefIndex) {
  const sig = line.trim();
  const paren = sig.indexOf('(');
  const brace = sig.lastIndexOf('{');
  const head = paren > 0 ? sig.slice(0, paren) : sig;
  return {
    type: typeSlot,
    typeDefIndex: typeDefIndex,
    name: methodName(head),
    signature: brace > 0 ? sig.slice(0, brace).trim() : sig,
    rva: rva.rva,
    offset: rva.offset,
    va: rva.va,
    slot: rva.slot,
    line: lineNo,
  };
}

/**
 * Parse dump.cs into an index.
 * @param {string} filePath
 * @param {(p:{line:number,lines:number})=>void} [onProgress]
 * @returns {Promise<object>}
 */
function parseDump(filePath, onProgress) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(filePath);
    const idx = emptyIndex();
    idx.file = filePath;
    idx.size = stat.size;
    idx.mtimeMs = stat.mtimeMs;

    const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1 << 20 });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let lineNo = 0;
    let pendingNs = '';
    let current = null;
    let pendingRva = null;
    let inBody = false;

    const closeType = (endLine) => {
      if (!current) return;
      current.lineEnd = endLine;
      idx.types.push(current);
      current = null;
      inBody = false;
    };

    rl.on('line', (line) => {
      lineNo++;
      if ((lineNo & 0xFFFF) === 0 && onProgress) onProgress({ line: lineNo, lines: 0 });

      /* image table */
      const img = RE_IMAGE.exec(line);
      if (img) {
        idx.images.push({ index: Number(img[1]), name: img[2], typeStart: Number(img[3]) });
        return;
      }

      const ns = RE_NS.exec(line);
      if (ns) { pendingNs = ns[1].trim(); return; }

      if (current && inBody) {
        if (line === '}') { closeType(lineNo); return; }
        if (line === '') return;
        if (RE_SECTION.test(line)) return;

        const rva = RE_RVA.exec(line);
        if (rva) {
          const num = (s) => (s === undefined || s === '-1' ? -1 : Number(s));
          pendingRva = { rva: num(rva[1]), offset: num(rva[2]), va: num(rva[3]), slot: rva[4] === undefined ? -1 : Number(rva[4]) };
          return;
        }

        if (RE_ATTR.test(line)) { idx.attributes++; return; }

        /* a declaration line directly after an RVA comment is a method */
        if (pendingRva && line.startsWith('\t')) {
          idx.methods.push(methodRow(line, lineNo, pendingRva, idx.types.length, current ? current.typeDefIndex : -1));
          pendingRva = null;
          return;
        }

        /* methods with no RVA comment at all (stock output always has one, but the
           dump is data and this keeps the block honest if it ever does not) */
        if (line.startsWith('\t') && /\([^)]*\)\s*(?:\{\s*\}|;)\s*$/.test(line) && !/\{\s*(?:get|set)\s*;/.test(line)) {
          idx.methods.push(methodRow(line, lineNo, { rva: -1, offset: -1, va: -1, slot: -1 }, idx.types.length, current ? current.typeDefIndex : -1));
          return;
        }

        if (line.startsWith('\t') && /\{\s*(?:get|set)\s*;/.test(line)) {
          const p = RE_PROP.exec(line);
          if (p) {
            idx.properties.push({ type: idx.types.length, typeDefIndex: current ? current.typeDefIndex : -1, name: p[2], signature: line.trim(), line: lineNo });
            return;
          }
        }

        if (line.startsWith('\t') && /^[^\t]*\bevent\s+/.test(line)) {
          const ev = /\bevent\s+(.+?)\s+([\w<>\[\],.`$@]+)\s*;/.exec(line);
          idx.events.push({
            type: idx.types.length,
            typeDefIndex: current ? current.typeDefIndex : -1,
            eventType: ev ? ev[1].trim() : '',
            name: ev ? ev[2] : line.trim(),
            line: lineNo,
          });
          return;
        }

        if (line.startsWith('\t') && /;\s*(?:\/\/\s*0x[0-9A-Fa-f]+)?$/.test(line)) {
          const f = RE_FIELD.exec(line);
          if (f) {
            idx.fields.push({
              type: idx.types.length,
              typeDefIndex: current ? current.typeDefIndex : -1,
              fieldType: f[1].trim(),
              name: f[2],
              value: f[3] || null,
              offset: f[4] ? Number(f[4]) : -1,
              line: lineNo,
            });
          } else {
            idx.unparsed++;
          }
          return;
        }
        return;
      }

      /* type-level attribute, column 0, directly above the declaration */
      if (RE_ATTR_TOP.test(line)) { idx.attributes++; return; }

      const t = RE_TYPE.exec(line);
      if (t) {
        if (current) closeType(lineNo);
        current = {
          name: t[2],
          namespace: pendingNs,
          kind: t[1],
          parent: t[3] ? t[3].trim() : '',
          typeDefIndex: t[4] === undefined ? -1 : Number(t[4]),
          lineStart: lineNo,
          lineEnd: 0,
          methodCount: 0,
          fieldCount: 0,
          propertyCount: 0,
          eventCount: 0,
        };
        pendingNs = '';
        inBody = false;
        pendingRva = null;
        return;
      }

      if (current && line === '{') { inBody = true; return; }
    });

    rl.on('close', () => {
      if (current) closeType(lineNo);
      idx.lines = lineNo;
      idx.parsedAt = Date.now();
      /* back-fill per-type counts now that every row exists */
      for (const m of idx.methods) { const t = idx.types[m.type]; if (t) t.methodCount++; }
      for (const f of idx.fields) { const t = idx.types[f.type]; if (t) t.fieldCount++; }
      for (const p of idx.properties) { const t = idx.types[p.type]; if (t) t.propertyCount++; }
      for (const e of idx.events) { const t = idx.types[e.type]; if (t) t.eventCount++; }
      resolve(idx);
    });
    rl.on('error', reject);
    stream.on('error', reject);
  });
}

/* ------------------------------------------------------------------- cache */

function cachePathFor(cacheDir, filePath) {
  const key = crypto.createHash('sha1').update(path.resolve(filePath)).digest('hex').slice(0, 16);
  return path.join(cacheDir, `dump-index-${key}.json`);
}

function isFresh(cacheFile, filePath) {
  try {
    const stat = fs.statSync(filePath);
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    return cached && cached.version === INDEX_VERSION && cached.size === stat.size && Math.abs(cached.mtimeMs - stat.mtimeMs) < 1;
  } catch (e) {
    return false;
  }
}

/**
 * Load an index, reusing the cache when the dump has not changed.
 * @returns {Promise<{index:object, cached:boolean}>}
 */
async function loadIndex(filePath, opts) {
  const o = opts || {};
  const cacheDir = o.cacheDir;
  if (!cacheDir) {
    const index = await parseDump(filePath, o.onProgress);
    return { index, cached: false };
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  const cacheFile = cachePathFor(cacheDir, filePath);
  if (isFresh(cacheFile, filePath)) {
    try {
      const index = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      return { index, cached: true };
    } catch (e) { /* fall through and reparse */ }
  }
  const index = await parseDump(filePath, o.onProgress);
  try { fs.writeFileSync(cacheFile, JSON.stringify(index)); } catch (e) { /* cache is best effort */ }
  return { index, cached: false };
}

/* ------------------------------------------------------------------ search */

function fqName(t) {
  return t.namespace ? `${t.namespace}.${t.name}` : t.name;
}

/** Build O(1) lookup tables over a parsed index. */
function buildLookups(index) {
  const byTypeDefIndex = new Map();
  const byName = new Map();
  for (let i = 0; i < index.types.length; i++) {
    const t = index.types[i];
    if (t.typeDefIndex >= 0) {
      if (!byTypeDefIndex.has(t.typeDefIndex)) byTypeDefIndex.set(t.typeDefIndex, []);
      byTypeDefIndex.get(t.typeDefIndex).push(t);
    }
    const k = fqName(t);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(t);
  }
  const methodsByType = new Map();
  for (const m of index.methods) {
    if (!methodsByType.has(m.type)) methodsByType.set(m.type, []);
    methodsByType.get(m.type).push(m);
  }
  const fieldsByType = new Map();
  for (const f of index.fields) {
    if (!fieldsByType.has(f.type)) fieldsByType.set(f.type, []);
    fieldsByType.get(f.type).push(f);
  }
  const propertiesByType = new Map();
  for (const p of index.properties) {
    if (!propertiesByType.has(p.type)) propertiesByType.set(p.type, []);
    propertiesByType.get(p.type).push(p);
  }
  return { byTypeDefIndex, byName, methodsByType, fieldsByType, propertiesByType };
}

/**
 * Search types, methods, fields and properties.
 * @param {object} index
 * @param {string} query
 * @param {{limit?:number, kind?:string, namespace?:string}} [opts]
 */
function search(index, query, opts) {
  const o = opts || {};
  const limit = Math.min(o.limit || 50, 500);
  const q = String(query || '').toLowerCase();
  if (!q) return [];
  const nsFilter = o.namespace ? String(o.namespace).toLowerCase() : null;
  const out = [];
  const push = (kind, row, label) => {
    if (out.length < limit) out.push({ kind, label, line: row.line || row.lineStart, typeDefIndex: row.typeDefIndex });
  };
  const nsOk = (row) => !nsFilter || String(row.namespace || '').toLowerCase().includes(nsFilter);

  if (!o.kind || o.kind === 'type') {
    for (const t of index.types) {
      if (!nsOk(t)) continue;
      if (fqName(t).toLowerCase().includes(q)) push('type', t, fqName(t));
      if (out.length >= limit) return out;
    }
  }
  if (!o.kind || o.kind === 'method') {
    for (const m of index.methods) {
      if (m.name.toLowerCase().includes(q)) push('method', m, `${m.signature || m.name}`);
      if (out.length >= limit) return out;
    }
  }
  if (!o.kind || o.kind === 'field') {
    for (const f of index.fields) {
      if (f.name.toLowerCase().includes(q)) push('field', f, `${f.fieldType} ${f.name}`);
      if (out.length >= limit) return out;
    }
  }
  if (!o.kind || o.kind === 'property') {
    for (const p of index.properties) {
      if (p.name.toLowerCase().includes(q)) push('property', p, p.signature);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

module.exports = { parseDump, loadIndex, buildLookups, search, fqName, INDEX_VERSION };
