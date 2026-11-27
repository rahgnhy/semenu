/* ============================================================================
   il2cpp-crosscheck.js - compare dump.cs against the metadata it came from.

   The two artefacts answer the same questions from different directions: the
   metadata knows how many types/methods/fields exist and what they are called,
   dump.cs knows which of them the dumper actually managed to write. Anything
   that disagrees is reported, never patched.
   ========================================================================== */
'use strict';

const { readHeader } = require('./il2cpp-metadata');

const MAX_SAMPLES = 40;

function sample(list) {
  return list.slice(0, MAX_SAMPLES);
}

/**
 * @param {Buffer} metaBuf validated or unvalidated metadata
 * @param {object} index parsed dump.cs index
 * @param {{binary?:object}} [opts] binary reader for address verification
 */
function crossCheck(metaBuf, index, opts) {
  const o = opts || {};
  const header = readHeader(metaBuf);
  const sec = (name) => header.sections.find(s => s.name === name);
  const td = sec('typeDefinitions');
  const fd = sec('fields');
  const md = sec('methods');
  const str = sec('string');
  const im = sec('images');

  const nTypes = (td.size / 88) | 0;
  const nFields = (fd.size / 12) | 0;
  const nMethods = (md.size / 36) | 0;

  const strAt = (i) => {
    if (i < 0 || i >= str.size) return null;
    const start = str.offset + i;
    let end = start;
    const limit = Math.min(str.offset + str.size, start + 4096);
    while (end < limit && metaBuf[end] !== 0) end++;
    return end < limit ? metaBuf.toString('utf8', start, end) : null;
  };

  const report = {
    metadata: { types: nTypes, methods: nMethods, fields: nFields, images: (im.size / 40) | 0 },
    dump: { types: index.types.length, methods: index.methods.length, fields: index.fields.length, properties: index.properties.length, lines: index.lines },
    missingTypes: [],
    extraTypes: [],
    duplicateTypeDefIndex: [],
    nameMismatches: [],
    methodCountMismatches: [],
    fieldCountMismatches: [],
    propertyCountMismatches: [],
    addresses: { checked: 0, insideExecutable: 0, outsideExecutable: 0, withoutAddress: 0, samples: [] },
    images: { metadata: 0, dump: 0, mismatches: [] },
    summary: {},
  };

  const byIndex = new Map();
  for (const t of index.types) {
    if (t.typeDefIndex < 0) continue;
    if (!byIndex.has(t.typeDefIndex)) byIndex.set(t.typeDefIndex, []);
    byIndex.get(t.typeDefIndex).push(t);
  }

  for (const [typeDefIndex, list] of byIndex) {
    if (list.length > 1) {
      report.duplicateTypeDefIndex.push({ typeDefIndex, names: list.map(t => t.name), lines: list.map(t => t.lineStart) });
    }
    if (typeDefIndex >= nTypes) {
      report.extraTypes.push({ typeDefIndex, name: list[0].name, line: list[0].lineStart });
    }
  }

  const seen = new Set();
  for (let i = 0; i < nTypes; i++) {
    const at = td.offset + i * 88;
    const metaName = strAt(metaBuf.readUInt32LE(at));
    const ns = strAt(metaBuf.readUInt32LE(at + 4));
    const fq = ns ? `${ns}.${metaName}` : metaName;
    const methodCount = metaBuf.readUInt16LE(at + 64);
    const fieldCount = metaBuf.readUInt16LE(at + 68);

    const found = byIndex.get(i);
    if (!found || !found.length) {
      if (report.missingTypes.length < MAX_SAMPLES * 4) report.missingTypes.push({ typeDefIndex: i, name: fq, methods: methodCount, fields: fieldCount });
      continue;
    }
    seen.add(i);
    const t = found[0];
    const dumpLeaf = t.name.includes('.') ? t.name.slice(t.name.lastIndexOf('.') + 1) : t.name;
    if (metaName && dumpLeaf !== metaName) {
      report.nameMismatches.push({ typeDefIndex: i, metadata: fq, dump: t.name, line: t.lineStart });
    }
    if (t.methodCount !== methodCount && report.methodCountMismatches.length < MAX_SAMPLES * 4) {
      report.methodCountMismatches.push({ typeDefIndex: i, name: fq, metadata: methodCount, dump: t.methodCount, line: t.lineStart });
    }
    if (t.fieldCount !== fieldCount && report.fieldCountMismatches.length < MAX_SAMPLES * 4) {
      report.fieldCountMismatches.push({ typeDefIndex: i, name: fq, metadata: fieldCount, dump: t.fieldCount, line: t.lineStart });
    }
    const propertyCount = metaBuf.readUInt16LE(at + 66);
    if (t.propertyCount !== propertyCount && report.propertyCountMismatches.length < MAX_SAMPLES * 4) {
      report.propertyCountMismatches.push({ typeDefIndex: i, name: fq, metadata: propertyCount, dump: t.propertyCount, line: t.lineStart });
    }
  }

  /* ---- addresses against the binary ---- */
  if (o.binary) {
    for (const m of index.methods) {
      if (!(m.rva > 0)) { report.addresses.withoutAddress++; continue; }
      report.addresses.checked++;
      if (o.binary.isExecutable(m.rva)) report.addresses.insideExecutable++;
      else {
        report.addresses.outsideExecutable++;
        if (report.addresses.samples.length < MAX_SAMPLES) report.addresses.samples.push({ name: m.signature, rva: '0x' + m.rva.toString(16), line: m.line });
      }
    }
  }

  /* ---- images ---- */
  report.images.metadata = (im.size / 40) | 0;
  report.images.dump = index.images.length;
  const metaImages = [];
  for (let i = 0; i < (im.size / 40) | 0; i++) {
    const at = im.offset + i * 40;
    metaImages.push({ name: strAt(metaBuf.readUInt32LE(at)), typeStart: metaBuf.readInt32LE(at + 8), typeCount: metaBuf.readInt32LE(at + 12) });
  }
  for (let i = 0; i < Math.max(metaImages.length, index.images.length); i++) {
    const a = metaImages[i];
    const b = index.images[i];
    if (!a || !b || a.name !== b.name || a.typeStart !== b.typeStart) {
      report.images.mismatches.push({ index: i, metadata: a || null, dump: b || null });
    }
  }

  report.summary = {
    typesMatched: seen.size,
    typesMissingFromDump: nTypes - seen.size,
    duplicateTypeDefIndexes: report.duplicateTypeDefIndex.length,
    nameMismatches: report.nameMismatches.length,
    methodCountMismatches: report.methodCountMismatches.length,
    fieldCountMismatches: report.fieldCountMismatches.length,
    propertyCountMismatches: report.propertyCountMismatches.length,
    addressesVerified: report.addresses.checked,
    addressesWithoutAddress: report.addresses.withoutAddress,
    addressesOutsideExecutable: report.addresses.outsideExecutable,
    imageMismatches: report.images.mismatches.length,
  };
  report.missingTypes = sample(report.missingTypes);
  report.extraTypes = sample(report.extraTypes);
  report.duplicateTypeDefIndex = sample(report.duplicateTypeDefIndex);
  report.nameMismatches = sample(report.nameMismatches);
  report.methodCountMismatches = sample(report.methodCountMismatches);
  report.fieldCountMismatches = sample(report.fieldCountMismatches);
  report.propertyCountMismatches = sample(report.propertyCountMismatches);
  report.images.mismatches = sample(report.images.mismatches);

  return report;
}

module.exports = { crossCheck };
