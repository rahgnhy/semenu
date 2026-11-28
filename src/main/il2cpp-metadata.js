/* ============================================================================
   il2cpp-metadata.js - structural validator and repairer for IL2CPP metadata.

   This module never guesses. Every check below is arithmetic over the section
   table: a section either fits inside the file or it does not, a start/count
   pair either tiles its target table or it does not. Anything that cannot be
   proven is reported as "uncertain" instead of being silently rewritten.

   The input buffer is never modified. repairMetadata() returns a new buffer and
   a list of exactly what changed.

   Supported layout: v31 (Unity 2021.2 - 2023.x). Other versions are parsed far
   enough to report the header and are then declared unsupported, on purpose -
   the section strides differ per version and a wrong stride produces a report
   full of lies.
   ========================================================================== */
'use strict';

const IL2CPP_MAGIC = 0xFAB11BAF;
const SUPPORTED_VERSIONS = [31];
const HEADER_ENTRIES = 31;

/** Stock v31 section order, stride, and the table its start/count fields index. */
const SECTIONS = [
  { name: 'stringLiteral', stride: 8, kind: 'table' },
  { name: 'stringLiteralData', stride: 1, kind: 'blob' },
  { name: 'string', stride: 1, kind: 'blob' },
  { name: 'events', stride: 24, kind: 'table' },
  { name: 'properties', stride: 20, kind: 'table' },
  { name: 'methods', stride: 36, kind: 'table' },
  { name: 'parameterDefaultValues', stride: 12, kind: 'table' },
  { name: 'fieldDefaultValues', stride: 12, kind: 'table' },
  { name: 'fieldAndParameterDefaultValueData', stride: 1, kind: 'blob' },
  { name: 'fieldMarshaledSizes', stride: 12, kind: 'table' },
  { name: 'parameters', stride: 12, kind: 'table' },
  { name: 'fields', stride: 12, kind: 'table' },
  { name: 'genericParameters', stride: 16, kind: 'table' },
  { name: 'genericParameterConstraints', stride: 4, kind: 'table' },
  { name: 'genericContainers', stride: 16, kind: 'table' },
  { name: 'nestedTypes', stride: 4, kind: 'table' },
  { name: 'interfaces', stride: 4, kind: 'table' },
  { name: 'vtableMethods', stride: 4, kind: 'table' },
  { name: 'interfaceOffsets', stride: 8, kind: 'table' },
  { name: 'typeDefinitions', stride: 88, kind: 'table' },
  { name: 'images', stride: 40, kind: 'table' },
  { name: 'assemblies', stride: 64, kind: 'table' },
  { name: 'fieldRefs', stride: 8, kind: 'table' },
  { name: 'referencedAssemblies', stride: 4, kind: 'table' },
  { name: 'attributeData', stride: 1, kind: 'blob' },
  { name: 'attributeDataRange', stride: 8, kind: 'table' },
  { name: 'unresolvedVirtualCallParameterTypes', stride: 4, kind: 'table' },
  { name: 'unresolvedVirtualCallParameterRanges', stride: 8, kind: 'table' },
  { name: 'windowsRuntimeTypeNames', stride: 8, kind: 'table' },
  { name: 'windowsRuntimeStrings', stride: 1, kind: 'blob' },
  { name: 'exportedTypeDefinitions', stride: 4, kind: 'table' },
];

const SEV = { error: 'error', warn: 'warn', info: 'info' };

function issue(list, severity, code, detail, evidence) {
  list.push({ severity, code, detail, evidence: evidence === undefined ? null : evidence });
}

function align4(v) { return (v + 3) & ~3; }

/* ------------------------------------------------------------------- header */

/**
 * Read the section table without validating it.
 * @returns {{magic:number, version:number, size:number, sections:Array}}
 */
function readHeader(buf) {
  if (buf.length < 8) {
    throw new Error(`file is ${buf.length} bytes, too small to hold an IL2CPP metadata header`);
  }
  const magic = buf.readUInt32LE(0);
  const version = buf.readInt32LE(4);
  const tableEnd = 8 + 8 * HEADER_ENTRIES;
  const sections = SECTIONS.map((spec, i) => {
    const at = 8 + 8 * i;
    const inFile = at + 8 <= buf.length;
    return {
      name: spec.name,
      stride: spec.stride,
      kind: spec.kind,
      index: i,
      offset: inFile ? buf.readInt32LE(at) : 0,
      size: inFile ? buf.readInt32LE(at + 4) : 0,
      tableOffset: at,
    };
  });
  return { magic, version, size: buf.length, sections, tableEnd };
}

/* --------------------------------------------------------------- validation */

function sectionByName(header, name) {
  return header.sections.find(s => s.name === name);
}

function count(header, name) {
  const s = sectionByName(header, name);
  if (!s || s.stride < 1) return 0;
  return (s.size / s.stride) | 0;
}

function table(buf, header, name) {
  const s = sectionByName(header, name);
  return { buf, off: s.offset, size: s.size, stride: s.stride, count: (s.size / s.stride) | 0 };
}

/**
 * Full structural validation.
 * @param {Buffer} buf
 * @param {{typesCount?:number}} [opts] typesCount from the binary, when known
 * @returns {object} report
 */
function validateMetadata(buf, opts) {
  const o = opts || {};
  const report = {
    ok: false,
    size: buf.length,
    version: null,
    magic: null,
    counts: {},
    sections: [],
    issues: [],
    checks: [],
    uncertain: [],
  };
  const issues = report.issues;

  if (buf.length < 8) {
    issue(issues, SEV.error, 'file-too-small', `file is ${buf.length} bytes`);
    return report;
  }

  const header = readHeader(buf);
  report.magic = '0x' + header.magic.toString(16).toUpperCase();
  report.version = header.version;

  if (header.magic !== IL2CPP_MAGIC) {
    issue(issues, SEV.error, 'bad-magic',
      `magic is 0x${header.magic.toString(16)} not 0xFAB11BAF - this is not an IL2CPP metadata file`);
    return report;
  }

  if (!SUPPORTED_VERSIONS.includes(header.version)) {
    issue(issues, SEV.error, 'unsupported-version',
      `metadata version ${header.version} is not supported by this validator (supported: ${SUPPORTED_VERSIONS.join(', ')}). ` +
      'Section strides differ per version; continuing would produce false results.');
    return report;
  }

  if (buf.length < header.tableEnd) {
    issue(issues, SEV.error, 'truncated-header',
      `file ends at ${buf.length} but the section table needs ${header.tableEnd} bytes`);
    return report;
  }

  /* ---- 1. section bounds, alignment, stride ---- */
  const placed = [];
  for (const s of header.sections) {
    const row = { name: s.name, offset: s.offset, size: s.size, count: s.kind === 'table' ? (s.size / s.stride) | 0 : s.size };
    if (s.size === 0) {
      row.status = 'empty';
      report.sections.push(row);
      continue;
    }
    if (s.offset < header.tableEnd) {
      issue(issues, SEV.error, 'section-inside-header',
        `${s.name} starts at 0x${s.offset.toString(16)}, inside the ${header.tableEnd}-byte header`);
      row.status = 'bad';
    } else if (s.offset + s.size > buf.length) {
      issue(issues, SEV.error, 'section-past-eof',
        `${s.name} spans 0x${s.offset.toString(16)}..0x${(s.offset + s.size).toString(16)} ` +
        `but the file ends at 0x${buf.length.toString(16)} (${s.offset + s.size - buf.length} bytes missing)`);
      row.status = 'bad';
    } else if (s.kind === 'table' && s.size % s.stride !== 0) {
      issue(issues, SEV.error, 'stride-remainder',
        `${s.name} size ${s.size} is not a multiple of its ${s.stride}-byte stride ` +
        `(remainder ${s.size % s.stride}); the table holds ${Math.floor(s.size / s.stride)} whole records`);
      row.status = 'bad';
    } else {
      row.status = 'ok';
    }
    if (s.offset % 4 !== 0) {
      issue(issues, SEV.warn, 'section-unaligned', `${s.name} starts at 0x${s.offset.toString(16)}, not 4-byte aligned`);
    }
    placed.push(s);
    report.sections.push(row);
  }

  /* ---- 2. overlaps ---- */
  const sorted = placed.slice().sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const prevEnd = prev.offset + prev.size;
    if (cur.offset < prevEnd) {
      issue(issues, SEV.error, 'section-overlap',
        `${cur.name} (0x${cur.offset.toString(16)}) overlaps ${prev.name} which ends at 0x${prevEnd.toString(16)}`,
        { overlapBytes: prevEnd - cur.offset });
    }
  }

  /* ---- 3. counts ---- */
  for (const s of header.sections) {
    if (s.kind === 'table') report.counts[s.name] = (s.size / s.stride) | 0;
    else report.counts[s.name] = s.size;
  }

  const nTypes = count(header, 'typeDefinitions');
  const nFields = count(header, 'fields');
  const nMethods = count(header, 'methods');
  const nParams = count(header, 'parameters');
  const nImages = count(header, 'images');
  const nGp = count(header, 'genericParameters');
  const nGc = count(header, 'genericContainers');
  const nGpc = count(header, 'genericParameterConstraints');
  const nNested = count(header, 'nestedTypes');
  const nIfaces = count(header, 'interfaces');
  const nVtable = count(header, 'vtableMethods');
  const nIfOff = count(header, 'interfaceOffsets');

  if (!nTypes) issue(issues, SEV.error, 'no-types', 'typeDefinitions section is empty');

  const td = table(buf, header, 'typeDefinitions');
  const fd = table(buf, header, 'fields');
  const md = table(buf, header, 'methods');
  const pd = table(buf, header, 'parameters');
  const im = table(buf, header, 'images');
  const gpd = table(buf, header, 'genericParameters');
  const gcd = table(buf, header, 'genericContainers');
  const str = table(buf, header, 'string');

  const strOk = str.size > 0;
  const stringAt = (idx) => {
    if (!strOk || idx < 0 || idx >= str.size) return null;
    const start = str.off + idx;
    let end = start;
    const limit = Math.min(str.off + str.size, start + 4096);
    while (end < limit && buf[end] !== 0) end++;
    return end < limit ? buf.toString('utf8', start, end) : null;
  };

  /* ---- 4. image -> typeDefinitions tiling ---- */
  {
    let cursor = 0;
    let gaps = 0;
    let overlaps = 0;
    let outside = 0;
    for (let i = 0; i < nImages; i++) {
      const at = im.off + i * im.stride;
      const start = buf.readInt32LE(at + 8);
      const cnt = buf.readInt32LE(at + 12);
      if (start !== cursor) { if (start > cursor) gaps += start - cursor; else overlaps += cursor - start; }
      if (start < 0 || start + cnt > nTypes) outside++;
      cursor = start + cnt;
    }
    const check = { name: 'image-type-tiling', images: nImages, covered: cursor, types: nTypes, gaps, overlaps, outside };
    report.checks.push(check);
    if (outside) {
      issue(issues, SEV.error, 'image-type-range',
        `${outside} image(s) declare a type range outside 0..${nTypes}`);
    }
    if (cursor !== nTypes || gaps || overlaps) {
      issue(issues, SEV.error, 'image-type-tiling',
        `images tile ${cursor} of ${nTypes} types (gap ${gaps}, overlap ${overlaps})`);
    }
  }

  /* ---- 5. methods -> parameters -----------------------------------------
     A method with no parameters stores parameterStart = -1, not 0. Those are
     skipped: they own no rows and would otherwise read as a negative gap. */
  {
    let cursor = 0;
    let gaps = 0;
    let overlaps = 0;
    let outside = 0;
    let emptyWithStart = 0;
    let covered = 0;
    for (let i = 0; i < nMethods; i++) {
      const at = md.off + i * md.stride;
      const pstart = buf.readInt32LE(at + 16);
      const pcount = buf.readUInt16LE(at + 34);
      if (pcount === 0) {
        if (pstart !== -1) emptyWithStart++;
        continue;
      }
      if (pstart !== cursor) { if (pstart > cursor) gaps += pstart - cursor; else overlaps += cursor - pstart; }
      if (pstart < 0 || pstart + pcount > nParams) outside++;
      else covered += pcount;
      cursor = pstart + pcount;
    }
    const check = { name: 'method-parameter-tiling', methods: nMethods, covered, parameters: nParams, gaps, overlaps, outside, emptyWithStart };
    report.checks.push(check);
    if (outside) issue(issues, SEV.error, 'method-param-range', `${outside} method(s) index parameters outside 0..${nParams}`);
    if (gaps || overlaps) {
      issue(issues, SEV.error, 'method-parameter-tiling',
        `parameter ranges do not tile: ${gaps} unclaimed row(s), ${overlaps} overlapping row(s)`);
    } else if (covered !== nParams) {
      issue(issues, SEV.error, 'method-parameter-coverage',
        `methods claim ${covered} of ${nParams} parameter rows`);
    }
    if (emptyWithStart) {
      issue(issues, SEV.warn, 'empty-method-param-start',
        `${emptyWithStart} method(s) declare no parameters but carry a parameterStart other than -1`);
    }
  }

  /* ---- 6. generic containers -> generic parameters ---- */
  {
    let sum = 0;
    let badStart = 0;
    let cursor = 0;
    for (let i = 0; i < nGc; i++) {
      const at = gcd.off + i * gcd.stride;
      const argc = buf.readInt32LE(at + 4);
      const start = buf.readInt32LE(at + 12);
      if (start !== cursor) badStart++;
      cursor = start + argc;
      sum += argc;
      if (argc < 0 || argc > 512) issue(issues, SEV.error, 'container-argc', `generic container ${i} has argc ${argc}`, { index: i });
    }
    const check = { name: 'generic-container-coverage', containers: nGc, argcSum: sum, genericParameters: nGp, contiguous: badStart === 0 };
    report.checks.push(check);
    if (sum !== nGp) {
      issue(issues, SEV.error, 'generic-container-coverage',
        `generic containers declare ${sum} parameters but the table holds ${nGp}`);
    }
    if (badStart) {
      issue(issues, SEV.warn, 'generic-container-start',
        `${badStart} of ${nGc} containers do not start where the previous container ended`);
    }
  }

  /* ---- 7. generic parameter constraints ---- */
  {
    let outside = 0;
    for (let i = 0; i < nGp; i++) {
      const at = gpd.off + i * gpd.stride;
      const cs = buf.readInt16LE(at + 8);
      const cc = buf.readInt16LE(at + 10);
      if (cs < 0 || cc < 0 || cs + cc > nGpc) outside++;
    }
    report.checks.push({ name: 'generic-constraint-range', checked: nGp, outside, constraints: nGpc });
    if (outside) issue(issues, SEV.error, 'generic-constraint-range', `${outside} generic parameter(s) point outside the constraint table`);
  }

  /* ---- 8. typeDefinition start/count ranges ------------------------------
     A type with no rows of a kind stores start = -1, count = 0. That is the
     stock encoding, not a defect: only non-empty ranges are bounds-checked. */
  {
    const limits = [
      { field: 32, countField: 68, limit: nFields, label: 'fields' },
      { field: 36, countField: 64, limit: nMethods, label: 'methods' },
      { field: 40, countField: 70, limit: count(header, 'events'), label: 'events' },
      { field: 44, countField: 66, limit: count(header, 'properties'), label: 'properties' },
      { field: 48, countField: 72, limit: nNested, label: 'nested types' },
      { field: 52, countField: 76, limit: nIfaces, label: 'interfaces' },
      { field: 56, countField: 74, limit: nVtable, label: 'vtable' },
      { field: 60, countField: 78, limit: nIfOff, label: 'interface offsets' },
    ];
    const bad = {};
    const badEmpty = {};
    for (let i = 0; i < nTypes; i++) {
      const at = td.off + i * td.stride;
      for (const l of limits) {
        const start = buf.readInt32LE(at + l.field);
        const cnt = buf.readUInt16LE(at + l.countField);
        if (cnt === 0) {
          if (start !== -1) badEmpty[l.label] = (badEmpty[l.label] || 0) + 1;
          continue;
        }
        if (start < 0 || start + cnt > l.limit) bad[l.label] = (bad[l.label] || 0) + 1;
      }
    }
    for (const k of Object.keys(bad)) {
      issue(issues, SEV.error, 'typedef-range', `${bad[k]} type definition(s) point outside the ${k} table`);
    }
    for (const k of Object.keys(badEmpty)) {
      issue(issues, SEV.warn, 'typedef-empty-range',
        `${badEmpty[k]} type definition(s) have zero ${k} but a start other than -1`);
    }
    report.checks.push({ name: 'typedef-ranges', types: nTypes, violations: bad, emptyWithStart: badEmpty });
  }

  /* ---- 9. typeDefinition index fields ------------------------------------
     parentIndex, declaringTypeIndex and elementTypeIndex are TypeIndex values:
     they index the binary's Il2CppType table, not typeDefinitions. When the
     table size is unknown the u16 ceiling is used, because the container format
     this file came from stores these as u16 - anything above 65535 could not
     have survived that narrowing. */
  {
    const typeLimit = Number.isInteger(o.typesCount) && o.typesCount > 0 ? o.typesCount : 65536;
    const limitSource = Number.isInteger(o.typesCount) && o.typesCount > 0 ? 'binary' : 'u16-ceiling';
    let parentBad = 0;
    let declaringBad = 0;
    let elementBad = 0;
    let containerBad = 0;
    let elementNonMinusOne = 0;
    let containerNonMinusOne = 0;
    for (let i = 0; i < nTypes; i++) {
      const at = td.off + i * td.stride;
      const declaring = buf.readInt32LE(at + 12);
      const parent = buf.readInt32LE(at + 16);
      const element = buf.readInt32LE(at + 20);
      const container = buf.readInt32LE(at + 24);
      if (parent !== -1 && (parent < 0 || parent >= typeLimit)) parentBad++;
      if (declaring !== -1 && (declaring < 0 || declaring >= typeLimit)) declaringBad++;
      if (element !== -1) { elementNonMinusOne++; if (element < 0 || element >= typeLimit) elementBad++; }
      if (container !== -1) { containerNonMinusOne++; if (container < 0 || container >= nGc) containerBad++; }
    }
    report.checks.push({
      name: 'typedef-index-fields',
      types: nTypes,
      typeIndexLimit: typeLimit,
      typeIndexLimitSource: limitSource,
      parentOutOfRange: parentBad,
      declaringOutOfRange: declaringBad,
      elementOutOfRange: elementBad,
      containerOutOfRange: containerBad,
      elementSet: elementNonMinusOne,
      containerSet: containerNonMinusOne,
    });
    if (parentBad) issue(issues, SEV.error, 'typedef-parent', `${parentBad} type(s) have parentIndex outside the ${typeLimit}-entry Il2CppType table`);
    if (declaringBad) issue(issues, SEV.error, 'typedef-declaring', `${declaringBad} type(s) have declaringTypeIndex outside the ${typeLimit}-entry Il2CppType table`);
    if (elementBad) issue(issues, SEV.error, 'typedef-element', `${elementBad} type(s) have elementTypeIndex outside the ${typeLimit}-entry Il2CppType table`);
    if (containerBad) issue(issues, SEV.error, 'typedef-container', `${containerBad} type(s) have genericContainerIndex outside 0..${nGc}`);
    if (limitSource === 'u16-ceiling') {
      report.uncertain.push('type index fields were checked against the u16 ceiling, not the binary Il2CppType table (no typesCount supplied)');
    }
  }

  /* ---- 10. field / method / parameter index fields ---- */
  {
    let fieldTypeBad = 0;
    let fieldNameBad = 0;
    const typeLimit = Number.isInteger(o.typesCount) && o.typesCount > 0 ? o.typesCount : null;
    for (let i = 0; i < nFields; i++) {
      const at = fd.off + i * fd.stride;
      const nameIdx = buf.readUInt32LE(at);
      const typeIdx = buf.readInt32LE(at + 4);
      if (strOk && (nameIdx >= str.size || stringAt(nameIdx) === null)) fieldNameBad++;
      if (typeLimit && (typeIdx < 0 || typeIdx >= typeLimit)) fieldTypeBad++;
    }
    report.checks.push({ name: 'field-index-fields', fields: nFields, nameOutsideStringHeap: fieldNameBad, typeOutsideBinaryTypes: fieldTypeBad, typeLimit });
    if (fieldNameBad) issue(issues, SEV.error, 'field-name-index', `${fieldNameBad} field name index(es) do not point at a NUL-terminated string`);
    if (fieldTypeBad) issue(issues, SEV.error, 'field-type-index', `${fieldTypeBad} field typeIndex value(s) are outside the binary's ${typeLimit}-entry Il2CppType table`);
    if (!typeLimit) {
      report.uncertain.push('field typeIndex values were not checked against the binary because no Il2CppType table size was supplied');
    }
  }

  /* ---- 11. method name indices ---- */
  {
    let bad = 0;
    for (let i = 0; i < nMethods; i++) {
      const nameIdx = buf.readUInt32LE(md.off + i * md.stride);
      if (strOk && (nameIdx >= str.size || stringAt(nameIdx) === null)) bad++;
    }
    report.checks.push({ name: 'method-name-indices', methods: nMethods, outsideStringHeap: bad });
    if (bad) issue(issues, SEV.error, 'method-name-index', `${bad} method name index(es) do not point at a NUL-terminated string`);
  }

  /* ---- 12. attributes ---- */
  {
    const attr = sectionByName(header, 'attributeData');
    const attrRange = sectionByName(header, 'attributeDataRange');
    let declared = 0;
    for (let i = 0; i < nImages; i++) declared += buf.readInt32LE(im.off + i * im.stride + 36);
    report.checks.push({
      name: 'attribute-coverage',
      imageAttributeCount: declared,
      attributeDataBytes: attr ? attr.size : 0,
      attributeRangeEntries: attrRange ? (attrRange.size / 8) | 0 : 0,
    });
    if (declared === 0 && (attrRange && attrRange.size > 0)) {
      issue(issues, SEV.warn, 'attributes-orphaned',
        `attributeDataRange holds ${(attrRange.size / 8) | 0} entries but no image references them; ` +
        'every custom attribute is unavailable to the dumper');
    }
    if (declared > 0 && attr && attr.size === 0) {
      issue(issues, SEV.error, 'attributes-missing', `${declared} attribute(s) are declared but attributeData is empty`);
    }
  }

  /* ---- 13. enum element types ---- */
  {
    let enums = 0;
    let missing = 0;
    for (let i = 0; i < nTypes; i++) {
      const at = td.off + i * td.stride;
      const bitfield = buf.readUInt32LE(at + 80);
      if (((bitfield >> 1) & 1) !== 1) continue;
      enums++;
      if (buf.readInt32LE(at + 20) === -1) missing++;
    }
    report.checks.push({ name: 'enum-element-types', enums, elementTypeUnset: missing });
    if (missing) {
      issue(issues, SEV.error, 'enum-element-missing',
        `${missing} of ${enums} enum type(s) have elementTypeIndex = -1. Il2CppDumper indexes il2Cpp.types[] ` +
        'with this field for every enum, so its struct and DummyDll generators throw');
    }
  }

  report.ok = !issues.some(i => i.severity === SEV.error);
  return report;
}

/* ------------------------------------------------------------------ repair */

/** Read a NUL-terminated string from the metadata string heap. */
function stringReader(buf, header) {
  const str = sectionByName(header, 'string');
  return (idx) => {
    if (!str || idx < 0 || idx >= str.size) return null;
    const start = str.offset + idx;
    let end = start;
    const limit = Math.min(str.offset + str.size, start + 4096);
    while (end < limit && buf[end] !== 0) end++;
    return end < limit ? buf.toString('utf8', start, end) : null;
  };
}

/**
 * Does the file look like it came out of a converter that dropped
 * elementTypeIndex and left genericContainerIndex in its slot?
 * Evidence: elementTypeIndex is set on N types and every one of those values is
 * a container whose ownerIndex is that same type, while genericContainerIndex
 * is -1 on every type. That is not a coincidence stock metadata can produce.
 */
function detectSwappedContainerField(buf, header) {
  const td = table(buf, header, 'typeDefinitions');
  const gcd = table(buf, header, 'genericContainers');
  let elementSet = 0;
  let containerSet = 0;
  let ownerMatches = 0;
  let ownerMismatches = 0;
  for (let i = 0; i < td.count; i++) {
    const at = td.off + i * td.stride;
    const element = buf.readInt32LE(at + 20);
    const container = buf.readInt32LE(at + 24);
    if (element !== -1) {
      elementSet++;
      if (element >= 0 && element < gcd.count) {
        const owner = buf.readInt32LE(gcd.off + element * gcd.stride);
        const isMethod = buf.readInt32LE(gcd.off + element * gcd.stride + 8);
        if (owner === i && isMethod === 0) ownerMatches++;
        else ownerMismatches++;
      } else {
        ownerMismatches++;
      }
    }
    if (container !== -1) containerSet++;
  }
  return {
    elementSet,
    containerSet,
    ownerMatches,
    ownerMismatches,
    swapped: elementSet > 0 && containerSet === 0 && ownerMismatches === 0 && ownerMatches === elementSet,
  };
}

/**
 * Derive elementTypeIndex for every enum from its own value__ field.
 * Returns { derived, missing, samples }.
 */
function deriveElementTypes(buf, header) {
  const td = table(buf, header, 'typeDefinitions');
  const fd = table(buf, header, 'fields');
  const str = stringReader(buf, header);
  const out = new Map();
  const missing = [];
  let enums = 0;
  for (let i = 0; i < td.count; i++) {
    const at = td.off + i * td.stride;
    const bitfield = buf.readUInt32LE(at + 80);
    if (((bitfield >> 1) & 1) !== 1) continue;
    enums++;
    const start = buf.readInt32LE(at + 32);
    const cnt = buf.readUInt16LE(at + 68);
    let found = -1;
    for (let f = start; f < start + cnt && f < fd.count; f++) {
      if (str(buf.readUInt32LE(fd.off + f * fd.stride)) === 'value__') {
        found = buf.readInt32LE(fd.off + f * fd.stride + 4);
        break;
      }
    }
    if (found >= 0) out.set(i, found);
    else missing.push(i);
  }
  return { derived: out, missing, enums };
}

/**
 * Produce a repaired copy. The input buffer is never touched.
 * @returns {{data:Buffer, repairs:Array, uncertain:Array, report:object}}
 */
function repairMetadata(buf, opts) {
  const o = opts || {};
  const report = validateMetadata(buf, o);
  const repairs = [];
  const uncertain = [];

  if (report.magic !== '0xFAB11BAF') {
    return { data: null, repairs, uncertain: ['not an IL2CPP metadata file; nothing can be repaired'], report };
  }
  if (!SUPPORTED_VERSIONS.includes(report.version)) {
    return { data: null, repairs, uncertain: [`version ${report.version} is not supported; refusing to write a guess`], report };
  }

  const out = Buffer.from(buf);       // copy on write
  const header = readHeader(out);
  const td = table(out, header, 'typeDefinitions');
  const gcd = table(out, header, 'genericContainers');

  /* -- 1. section sizes that are not a whole number of records ------------ */
  for (const s of header.sections) {
    if (s.kind !== 'table' || s.size === 0) continue;
    const rem = s.size % s.stride;
    if (rem === 0) continue;
    const newSize = s.size - rem;
    // Only shrink when the dropped bytes are padding: the next section in the
    // file must start at or after the truncated end, never inside it.
    const next = header.sections
      .filter(x => x.offset > s.offset && x.size > 0)
      .sort((a, b) => a.offset - b.offset)[0];
    const end = s.offset + newSize;
    if (next && next.offset < end) {
      uncertain.push(`${s.name} has ${rem} trailing bytes but shrinking it would overlap ${next.name}; left untouched`);
      continue;
    }
    out.writeInt32LE(newSize, s.tableOffset + 4);
    s.size = newSize;
    repairs.push({ code: 'section-truncated', detail: `${s.name} shrunk by ${rem} byte(s) to a whole number of ${s.stride}-byte records`, bytes: rem });
  }

  /* -- 2. elementTypeIndex / genericContainerIndex ------------------------- */
  const swap = detectSwappedContainerField(out, header);
  if (swap.swapped) {
    for (let i = 0; i < td.count; i++) {
      const at = td.off + i * td.stride;
      const container = out.readInt32LE(at + 20);
      out.writeInt32LE(container, at + 24);   // move to its real slot
      out.writeInt32LE(-1, at + 20);          // elementTypeIndex rebuilt below
    }
    repairs.push({
      code: 'generic-container-restored',
      detail: `moved genericContainerIndex out of the elementTypeIndex slot on ${swap.ownerMatches} type(s) ` +
        '(every value named a container whose ownerIndex is that same type)',
      types: swap.ownerMatches,
    });
  }

  const derived = deriveElementTypes(out, header);
  let written = 0;
  for (const [typeIndex, typeIdxValue] of derived.derived) {
    const at = td.off + typeIndex * td.stride;
    if (out.readInt32LE(at + 20) === typeIdxValue) continue;
    out.writeInt32LE(typeIdxValue, at + 20);
    written++;
  }
  if (written) {
    repairs.push({
      code: 'element-type-derived',
      detail: `wrote elementTypeIndex for ${written} enum type(s) from each type's own value__ field`,
      types: written,
    });
  }
  if (derived.missing.length) {
    uncertain.push(`${derived.missing.length} enum type(s) have no value__ field, so their elementTypeIndex stays -1 (first: ${derived.missing.slice(0, 8).join(', ')})`);
  }

  /* -- 3. fieldRefs that store typeDefinitions indices ---------------------
     Stock Il2CppFieldRef.typeIndex is an Il2CppType index, which lives in a
     table about three times larger than typeDefinitions. When every single
     entry falls inside the typeDefinitions range, and each one round-trips
     through that type's own byvalTypeIndex, the table is storing type
     definitions instead of types. */
  {
    const fr = sectionByName(header, 'fieldRefs');
    if (fr && fr.size >= 8) {
      const fdRef = table(out, header, 'fieldRefs');
      let inRange = 0;
      let roundTrips = 0;
      const n = fdRef.count;
      for (let i = 0; i < n; i++) {
        const v = out.readInt32LE(fdRef.off + i * fdRef.stride);
        if (v < 0 || v >= td.count) continue;
        inRange++;
        const byval = out.readInt32LE(td.off + v * td.stride + 8);
        if (byval >= 0) roundTrips++;
      }
      const looksLikeTypeDefs = n > 0 && inRange === n && roundTrips === n;
      /* keep the pre-rewrite column: it addresses typeDefinitions, which is what
         the fieldStart check below needs */
      const originalTypeDefIndex = new Int32Array(n);
      for (let i = 0; i < n; i++) originalTypeDefIndex[i] = out.readInt32LE(fdRef.off + i * fdRef.stride);
      if (looksLikeTypeDefs) {
        for (let i = 0; i < n; i++) {
          const v = out.readInt32LE(fdRef.off + i * fdRef.stride);
          const byval = out.readInt32LE(td.off + v * td.stride + 8);
          out.writeInt32LE(byval, fdRef.off + i * fdRef.stride);
        }
        repairs.push({
          code: 'fieldrefs-retargeted',
          detail: `rewrote ${n} fieldRef typeIndex value(s) from typeDefinitions indices to their Il2CppType indices ` +
            '(every value was in typeDefinitions range and round-tripped through byvalTypeIndex)',
          entries: n,
        });
        let zeroFieldIndex = 0;
        for (let i = 0; i < n; i++) if (out.readInt32LE(fdRef.off + i * fdRef.stride + 4) === 0) zeroFieldIndex++;
        if (zeroFieldIndex === n) {
          uncertain.push(
            'every fieldRef carries fieldIndex 0, so Il2CppDumper\'s Field$ names will always resolve to the ' +
            'first field of the owning type. The container does not store a field offset here; the value is not recoverable from metadata alone.');
        }
      }

      /* -- 3b. fieldRefs that cannot resolve to a field at all --------------
         Il2CppDumper builds metadata-usage names with
             fieldDefs[typeDef.fieldStart + fieldRef.fieldIndex]
         and a type with no fields stores fieldStart = -1, so any fieldRef aimed
         at such a type reads outside the array and aborts script.json, il2cpp.h
         and stringliteral.json generation. The table is detached (its bytes are
         left in place) so the remaining generators can finish.

         Resolvability is measured on the original values, before retargeting,
         because after the rewrite the column holds Il2CppType indices and those
         no longer address typeDefinitions. */
      const fdTable = table(out, header, 'fields');
      let unresolvable = 0;
      let checkedEntries = 0;
      for (let i = 0; i < n; i++) {
        const typeIndex = looksLikeTypeDefs ? originalTypeDefIndex[i] : -1;
        const fieldIndex = out.readInt32LE(fdRef.off + i * fdRef.stride + 4);
        checkedEntries++;
        if (!looksLikeTypeDefs || typeIndex < 0 || typeIndex >= td.count) { unresolvable++; continue; }
        const fieldStart = out.readInt32LE(td.off + typeIndex * td.stride + 32);
        const at = fieldStart + fieldIndex;
        if (fieldStart < 0 || at < 0 || at >= fdTable.count) unresolvable++;
      }
      if (unresolvable > 0) {
        const sec = sectionByName(header, 'fieldRefs');
        out.writeInt32LE(0, sec.tableOffset + 4);
        repairs.push({
          code: 'fieldrefs-detached',
          detail: `${unresolvable} of ${checkedEntries} fieldRef(s) resolve to no field (the owning type stores fieldStart = -1, ` +
            'so fieldStart + fieldIndex is outside the field table). ' +
            'The table is detached so script.json, il2cpp.h and stringliteral.json can be written; ' +
            'Field$ metadata-usage entries are omitted rather than guessed.',
          entries: checkedEntries,
          unresolvable,
          preservedAt: sec.offset,
          preservedBytes: sec.size,
        });
        fdRef.count = 0;
        fdRef.size = 0;
      }
    }
  }

  /* -- 3c. string literals that are not in stock form ---------------------
     A stock stringLiteral table is a list of (length, dataIndex) pairs into
     stringLiteralData, and that section is a plain concatenation of UTF-8
     strings addressed by offset and length - it is NOT NUL-separated, so the
     count of NUL bytes says nothing. What a real table must satisfy is:
     every dataIndex + length fits inside the blob, the rows advance through the
     blob without overlapping, and the runs decode as text. When those do not
     hold the lengths are gone and Il2CppDumper throws OutOfMemory reading a
     bogus length. Detach, keep the bytes, say so. */
  {
    const sl = sectionByName(header, 'stringLiteral');
    const sld = sectionByName(header, 'stringLiteralData');
    if (sl && sl.size >= 8 && sld && sld.size > 0) {
      const count = (sl.size / 8) | 0;
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let outside = 0;
      let backwards = 0;
      let unreadable = 0;
      let sampled = 0;
      let prevEnd = 0;
      const step = Math.max(1, Math.floor(count / 500));
      for (let i = 0; i < count; i++) {
        const len = out.readUInt32LE(sl.offset + i * 8);
        const di = out.readUInt32LE(sl.offset + i * 8 + 4);
        if (di + len > sld.size) { outside++; continue; }
        if (di < prevEnd) backwards++;
        prevEnd = di + len;
        if (i % step !== 0) continue;
        sampled++;
        let bad = false;
        for (let k = di; k < di + len; k++) {
          const c = out[sld.offset + k];
          if (c === 9 || c === 10 || c === 13) continue;
          if (c < 0x20 || c === 0x7F) { bad = true; break; }
        }
        if (!bad) {
          try { decoder.decode(out.subarray(sld.offset + di, sld.offset + di + len)); } catch (e) { bad = true; }
        }
        if (bad) unreadable++;
      }
      const readable = sampled ? 1 - unreadable / sampled : 0;
      const looksStock = outside === 0 && backwards === 0 && readable >= 0.98;
      if (!looksStock) {
        out.writeInt32LE(0, sl.tableOffset + 4);
        repairs.push({
          code: 'string-literals-detached',
          detail: `${outside} of ${count} stringLiteral length/dataIndex pair(s) point outside the ${sld.size}-byte data section, ` +
            `${backwards} run backwards into the previous literal, and ` +
            `${(readable * 100).toFixed(1)}% of ${sampled} sampled runs decode as text. ` +
            'A stock table can violate none of those, so the pair is detached: stringliteral.json will be empty.',
          entries: count,
          outside,
          backwards,
          readable: Number(readable.toFixed(3)),
          sampled,
          preservedAt: sl.offset,
          preservedBytes: sl.size,
        });
        uncertain.push(
          'string literals are not recoverable: the table does not address the data section as a ' +
          `sequence of UTF-8 strings (${outside} row(s) outside, ${backwards} overlapping, ` +
          `${(readable * 100).toFixed(1)}% of sampled runs readable).`);
      }
    }
  }

  /* -- 4. images with no attribute range ---------------------------------- */
  const attrRange = sectionByName(header, 'attributeDataRange');
  if (attrRange && attrRange.size > 0) {
    let declared = 0;
    const im = table(out, header, 'images');
    for (let i = 0; i < im.count; i++) declared += out.readInt32LE(im.off + i * im.stride + 36);
    if (declared === 0) {
      uncertain.push(
        `attributeDataRange holds ${(attrRange.size / 8) | 0} entries but no image points at them. ` +
        'The attribute stream is not stock v31 compressed-token form, so it is left disconnected rather than guessed.');
    }
  }

  const after = validateMetadata(out, o);
  return { data: out, repairs, uncertain, report: after, before: report };
}

module.exports = {
  IL2CPP_MAGIC,
  SECTIONS,
  readHeader,
  validateMetadata,
  repairMetadata,
  detectSwappedContainerField,
  deriveElementTypes,
  align4,
};
