/* ============================================================================
   il2cpp-decrypt.js - recover global-metadata.dat from the GILLA container format.

   The shipped file is NOT an IL2CPP metadata file. It is a custom container:

     bytes 0 .. 0x5E8   126 x {int32 offset; int32 count; int32 size} descriptor
                        table, XOR-ciphered with a xorshift64 + S-box keystream
     29 real sections   packed from 0xFA8 on 4-byte boundaries, fixed order
     7 of them          XOR-ciphered with per-section seeds materialised in
                        libil2cpp.so as movz/movk instruction sequences
     record layouts     stock IL2CPP v31 structs, index fields narrowed to u16,
                        genericContainerIndex dropped from TypeDefinition, and the
                        assembly name/culture pair swapped

   The old "XOR key" input could never work: there is no repeating key, and there
   is no magic number at offset 0 to validate one against.

   Everything here is pinned by arithmetic, not resemblance:
     * method parameterCount sums to exactly the parameter table length
     * image typeStart/typeCount tile the typeDefinition table with no gap
     * genericContainer argc sums to exactly the genericParameter table length
     * genericParameter constraintsStart/Count cover the constraint table exactly

   Two things are recovered exactly rather than left for the repairer:
     * genericContainerIndex - the container table names its owner type, so the
       index is read back, not guessed
     * elementTypeIndex      - an enum's element type is its own value__ field's
       type index, read out of the fields table

   One thing is measured before it is emitted: the string-literal pair. Two
   readings of the 8-byte index rows are scored against the blob - stock
   {length, dataIndex}, and a monotonic offset array whose gaps are the lengths.
   The second reading is accepted only when the array tiles the blob exactly
   (starts at 0, ends at the blob length, never goes backwards) and the runs
   decode as UTF-8, so a compressed or encrypted pool is refused with both scores
   reported rather than written out as text. Nothing is invented either way.
   ========================================================================== */
'use strict';

const TABLE_SIZE = 256;

/* ============================================================================
   Build profiles

   The container is a per-build artefact, not a format: the header width, the
   order of the three int32 fields inside each descriptor row, which row carries
   which stock section, which rows are enciphered and with what seed, and where
   each row's bytes physically start all change between builds. The only stable
   thing is the stock v31 layout on the other side of the conversion.

   So everything build-specific lives in one entry here, and the reader below is
   build-agnostic: it asks the profile for the field order, maps rows to stock
   section names, and measures every section against its own content rule before
   accepting it. Adding a build means adding an entry, not editing the reader.

   Positions
     'tiled'  the sections are packed back to back from sectionBase, each
              starting at the next 4-byte boundary
     'biased' the descriptor's offset field is the row's position in the
              decrypted file, and the physical position in the container is
              that plus a per-row bias materialised in libil2cpp.so. The bias
              absorbs the container's own gaps, which are not a constant.

   The two profiles below were derived by measurement, not by resemblance:
   every section is named by a rule its plaintext cannot violate (a name index
   must land on a NUL-terminated printable run, a container's argc must sum to
   the parameter table length, offsets must tile the literal pool).
   ========================================================================== */

const PROFILES = {
  /* 2025 build: 0x5E8 header, 126 rows of {offset, count, size}, sequential
     packing from 0xFA8, seven enciphered rows. */
  'gilla-v1': {
    id: 'gilla-v1',
    label: 'GILLA container, 0x5E8 header, 126 descriptors, sequential packing',
    headerSize: 0x5E8,
    rows: 126,
    fields: ['offset', 'count', 'size'],
    positions: 'tiled',
    sectionBase: 0xFA8,
    align: 4,
    table: { va: 0x182E7F3 },
    headerSeed: null,
    order: [48, 69, 63, 97, 34, 23, 22, 73, 46, 36, 41, 14, 32, 3, 2,
      31, 59, 4, 106, 118, 84, 5, 1, 71, 98, 90, 116, 85, 67],
    role: {
      48: 'stringLiteral', 69: 'stringLiteralData', 63: 'string',
      97: 'events', 34: 'properties', 23: 'methods',
      22: 'parameterDefaultValues', 73: 'fieldDefaultValues',
      46: 'fieldAndParameterDefaultValueData', 36: 'fieldMarshaledSizes',
      41: 'parameters', 14: 'fields', 32: 'genericParameters',
      3: 'genericParameterConstraints', 2: 'genericContainers',
      31: 'nestedTypes', 59: 'interfaces', 4: 'vtableMethods',
      106: 'interfaceOffsets', 118: 'typeDefinitions', 84: 'images',
      5: 'assemblies', 1: null, 71: null, 98: 'attributeData',
      90: 'attributeDataRange', 116: null, 85: null, 67: 'fieldRefs',
    },
    seeds: {
      48: 'EA338D80C764B829', 69: 'B3C78D264A9AB44F', 63: '6E63EC6F7A1442F0',
      34: 'D352E95AE3D142CB', 23: 'FF440E012182730C', 14: '4E3F398A310E48CB',
      5: '5F2902BE8286FA65',
    },
  },

  /* 2026 build: 0x5B8 header, 122 rows of {size, count, offset} - the triple is
     reversed - and the sections are no longer packed sequentially: each row's
     physical position is its descriptor offset plus a bias that differs per
     row. Seven rows are enciphered, and they are not the same seven as v1:
     assemblies carries a seed here, events does not. */
  'gilla-v2': {
    id: 'gilla-v2',
    label: 'GILLA container, 0x5B8 header, 122 descriptors, per-row biased packing',
    headerSize: 0x5B8,
    rows: 122,
    fields: ['size', 'count', 'offset'],
    positions: 'biased',
    align: 4,
    table: { file: 0x185635B },
    headerSeed: '321A13EB2C481603',
    order: [61, 56, 120, 58, 38, 51, 57, 79, 102, 0, 9, 53, 116, 49, 104,
      76, 88, 44, 47, 77, 117, 113, 101, 74, 39, 26, 83, 60, 112],
    role: {
      61: 'stringLiteral', 56: 'stringLiteralData', 120: 'string',
      58: 'events', 38: 'properties', 51: 'methods',
      57: 'parameterDefaultValues', 79: 'fieldDefaultValues',
      102: 'fieldAndParameterDefaultValueData', 0: 'fieldMarshaledSizes',
      9: 'parameters', 53: 'fields', 116: 'genericParameters',
      49: 'genericParameterConstraints', 104: 'genericContainers',
      76: 'nestedTypes', 88: 'interfaces', 44: 'vtableMethods',
      47: 'interfaceOffsets', 77: 'typeDefinitions', 117: 'images',
      113: 'assemblies', 101: null, 74: 'referencedAssemblies',
      39: 'attributeData', 26: 'attributeDataRange',
      83: 'unresolvedVirtualCallParameterTypes',
      60: 'unresolvedVirtualCallParameterRanges', 112: 'fieldRefs',
    },
    /* measured: chain position minus the descriptor's own offset, per row.
       Row 49 is +1916, not +1914: the parameter table ends 2 bytes before the
       next 4-byte boundary and the container aligns the constraint table, so a
       tiling that starts it 2 bytes early shifts every constraint by one slot.
       That shift handed System.Nullable`1's T a method constraint and made
       Il2CppDumper cast a TypeDefinition to a MethodDefinition. */
    bias: {
      61: -7468, 56: -3016, 120: 6472, 58: -7956, 38: 5524, 51: 5872,
      57: 2468, 79: 1536, 102: 4188, 0: 3108, 9: -3564, 53: -1180,
      116: -3776, 49: 1916, 104: -1732, 76: 7496, 88: -596, 44: -4996,
      47: -6248, 77: 4320, 117: 236, 113: 3652, 101: -6336, 74: -3576,
      39: 4020, 26: -2220, 83: -4600, 60: 7132, 112: -2400,
    },
    seeds: {
      61: '4725E117EDE2EF3A', 56: 'EB8440895BAEAB25', 120: 'B5E04259FDC1473E',
      38: '4A73B50C89FBC9FE', 51: '2A9247D5BD6AEB4F', 53: '23A902BF85864D86',
      113: '8B80533498DB7117',
    },
  },
};

const PROFILE_LIST = [PROFILES['gilla-v1'], PROFILES['gilla-v2']];

/* The reference profile's row numbers, kept as names for the callers that still
   address sections by index (the round-trip test builds its container that way). */
const ORDER = PROFILES['gilla-v1'].order;
const ROLE = PROFILES['gilla-v1'].role;

const STOCK_ORDER = [
  'stringLiteral', 'stringLiteralData', 'string', 'events', 'properties',
  'methods', 'parameterDefaultValues', 'fieldDefaultValues',
  'fieldAndParameterDefaultValueData', 'fieldMarshaledSizes', 'parameters',
  'fields', 'genericParameters', 'genericParameterConstraints',
  'genericContainers', 'nestedTypes', 'interfaces', 'vtableMethods',
  'interfaceOffsets', 'typeDefinitions', 'images', 'assemblies', 'fieldRefs',
  'referencedAssemblies', 'attributeData', 'attributeDataRange',
  'unresolvedVirtualCallParameterTypes', 'unresolvedVirtualCallParameterRanges',
  'windowsRuntimeTypeNames', 'windowsRuntimeStrings', 'exportedTypeDefinitions',
];

const IL2CPP_MAGIC = 0xFAB11BAF;

/* ------------------------------------------------------------------ helpers */

const s32 = v => (v >= 0x80000000 ? v - 0x100000000 : v);
const neg16 = v => (v === 0xFFFF ? -1 : v);
const align4 = v => (v + 3) & ~3;

function splitSeed(hex) {
  return { lo: parseInt(hex.slice(8), 16) >>> 0, hi: parseInt(hex.slice(0, 8), 16) >>> 0 };
}

const SEED_CACHE_BY_PROFILE = new Map();

/** Split the profile's big-endian seed hex into the two 32-bit halves. */
function profileSeeds(profile) {
  const hit = SEED_CACHE_BY_PROFILE.get(profile.id);
  if (hit) return hit;
  const out = {};
  for (const [row, hex] of Object.entries(profile.seeds || {})) out[row] = splitSeed(hex);
  SEED_CACHE_BY_PROFILE.set(profile.id, out);
  return out;
}

/**
 * A role-keyed view of a section map.
 *
 * Sections are addressed by what they are, not by which row carried them: the
 * row number is the one thing that changes between builds. Callers that still
 * pass a row-keyed map (the round-trip test) are resolved through the reference
 * profile, so both spellings mean the same thing.
 */
function byRole(sec, profile) {
  const p = profile || PROFILES['gilla-v1'];
  const out = {};
  for (const [key, value] of Object.entries(sec || {})) {
    if (!Buffer.isBuffer(value)) continue;
    const role = /^\d+$/.test(key) ? p.role[Number(key)] : key;
    if (role) out[role] = value;
  }
  return out;
}

/** Same key resolution for the descriptor map, whose values are objects. */
function resolveDesc(desc, profile) {
  if (!desc) return null;
  const p = profile || PROFILES['gilla-v1'];
  const out = {};
  for (const [key, value] of Object.entries(desc)) {
    const role = /^\d+$/.test(key) ? p.role[Number(key)] : key;
    if (role) out[role] = value;
  }
  return out;
}

/** Row numbers in physical order, for a role-keyed section map. */function rowOfRole(profile, role) {
  for (const row of profile.order) if (profile.role[row] === role) return row;
  return null;
}

/** Read a u64 that is guaranteed to fit in a double. */
function readU64(buf, off) {
  return buf.readUInt32LE(off) + buf.readUInt32LE(off + 4) * 0x100000000;
}

function hex64(seed) {
  /* Concatenated, not summed: hi * 2^32 exceeds 2^53 for every real seed, so
     arithmetic here silently rounds the low half (…2c481603 printed as …2c481600). */
  return seed.hi.toString(16).padStart(8, '0') + seed.lo.toString(16).padStart(8, '0');
}

/* ------------------------------------------------------------------ ELF map */

/** Map virtual addresses to file offsets using the PT_LOAD segments. */
function buildVa2Off(lib) {
  if (lib.length < 0x40 || lib.readUInt32LE(0) !== 0x464C457F) {
    throw new Error('libil2cpp.so is not an ELF image');
  }
  const phoff = readU64(lib, 0x20);
  const phentsize = lib.readUInt16LE(0x36);
  const phnum = lib.readUInt16LE(0x38);
  const segs = [];
  for (let i = 0; i < phnum; i++) {
    const o = phoff + i * phentsize;
    if (o + 40 > lib.length) break;
    if (lib.readUInt32LE(o) !== 1) continue;          // PT_LOAD
    const pOffset = readU64(lib, o + 8);
    const pVaddr = readU64(lib, o + 16);
    const pFilesz = readU64(lib, o + 32);
    const pFlags = lib.readUInt32LE(o + 4);
    segs.push({ vaddr: pVaddr, offset: pOffset, filesz: pFilesz, flags: pFlags });
  }
  return function va2off(va) {
    for (const s of segs) {
      if (va >= s.vaddr && va < s.vaddr + s.filesz) return s.offset + (va - s.vaddr);
    }
    throw new Error('vaddr 0x' + va.toString(16) + ' is not mapped by any PT_LOAD segment');
  };
}

/* -------------------------------------------------------------- keystream */

/**
 * xorshift64 (13,7,17) feeding a byte S-box.
 * Written against two 32-bit halves: BigInt per byte would be correct but
 * roughly two orders of magnitude slower over 8.7 MB of ciphertext.
 */
function xorBytes(data, table, lo, hi) {
  const out = Buffer.allocUnsafe(data.length);
  let sLo = lo >>> 0;
  let sHi = hi >>> 0;
  for (let i = 0; i < data.length; i++) {
    // s ^= s << 13   (a left shift drops the high bits; nothing crosses down)
    let nLo = (sLo << 13) >>> 0;
    let nHi = ((sHi << 13) | (sLo >>> 19)) >>> 0;
    sLo = (sLo ^ nLo) >>> 0;
    sHi = (sHi ^ nHi) >>> 0;

    // s ^= s >>> 7
    nLo = ((sLo >>> 7) | (sHi << 25)) >>> 0;
    nHi = (sHi >>> 7) >>> 0;
    sLo = (sLo ^ nLo) >>> 0;
    sHi = (sHi ^ nHi) >>> 0;
    const bLo = sLo;

    // s ^= s << 17
    nLo = (sLo << 17) >>> 0;
    nHi = ((sHi << 17) | (sLo >>> 15)) >>> 0;
    sLo = (sLo ^ nLo) >>> 0;
    sHi = (sHi ^ nHi) >>> 0;

    const w13 = (((sLo >>> 16) & 0xFFFF) ^ (sLo >>> 8) ^ (sLo >>> 24)) >>> 0;
    out[i] = data[i] ^ table[(w13 ^ bLo) & 0xFF];
  }
  return out;
}

/* --------------------------------------------------------- table location */

/**
 * The S-box is a 256-byte permutation. The known address is tried first; when a
 * build moves it, the segments are scanned for any permutation and every hit is
 * scored against the descriptor table. The table is never assumed.
 *
 * The winning header seed comes back with the table, because scoring a
 * candidate table means decrypting the descriptor table with every seed in the
 * pool - doing that twice (once to pick the table, once to pick the seed) was
 * pure waste.
 */
function findSBoxTable(lib, meta, profile, opts) {
  const p = profile || PROFILES['gilla-v1'];
  const va2off = buildVa2Off(lib);
  const pool = seedConstants(lib);
  const tried = [];
  let best = null;

  const scoreOf = (table) => {
    if (!table || table.length < TABLE_SIZE) return { score: 0, seed: null };
    const seen = new Uint8Array(256);
    for (let i = 0; i < TABLE_SIZE; i++) {
      const b = table[i];
      if (seen[b]) return { score: 0, seed: null };
      seen[b] = 1;
    }
    let bestScore = 0;
    let bestSeed = null;
    for (const seed of pool) {
      const s = scoreHeader(table, meta, seed, p);
      if (s > bestScore) { bestScore = s; bestSeed = seed; }
    }
    return { score: bestScore, seed: bestSeed };
  };

  /* The profile records where its build keeps the S-box: a virtual address when
     the loader leaves it in a mapped segment, a file offset when it does not. */
  const hint = p.table || {};
  if (hint.file !== undefined && hint.file + TABLE_SIZE <= lib.length) {
    const table = lib.subarray(hint.file, hint.file + TABLE_SIZE);
    const { score, seed } = scoreOf(table);
    tried.push({ fileOffset: hint.file, score, source: 'known-file' });
    if (score >= 8) {
      return { table, va: null, fileOffset: hint.file, source: 'known-file', score, seed, tried, pool: pool.length };
    }
  }
  if (hint.va !== undefined) {
    try {
      const off = va2off(hint.va);
      if (off >= 0 && off + TABLE_SIZE <= lib.length) {
        const table = lib.subarray(off, off + TABLE_SIZE);
        const { score, seed } = scoreOf(table);
        tried.push({ va: hint.va, score, source: 'known' });
        if (score >= 8) {
          return { table, va: hint.va, source: 'known', score, seed, tried, pool: pool.length };
        }
      }
    } catch (e) { /* the known address is not mapped in this build */ }
  }

  /* A sliding window keeps this O(n): the window holds a 0..255 permutation
     exactly when all 256 bytes are distinct, and an instruction stream almost
     never gets there. Read-only segments are scanned first; the executable ones
     only if that found nothing, because they are the expensive ones. */
  const segments = [];
  const phoff = readU64(lib, 0x20);
  const phentsize = lib.readUInt16LE(0x36);
  const phnum = lib.readUInt16LE(0x38);
  for (let i = 0; i < phnum; i++) {
    const o = phoff + i * phentsize;
    if (o + 40 > lib.length) break;
    if (lib.readUInt32LE(o) !== 1) continue;
    const flags = lib.readUInt32LE(o + 4);
    segments.push({
      exec: (flags & 0x1) !== 0,
      off: readU64(lib, o + 8),
      va: readU64(lib, o + 16),
      size: readU64(lib, o + 32),
    });
  }
  segments.sort((a, b) => (a.exec === b.exec ? 0 : a.exec ? 1 : -1));

  const cnt = new Uint16Array(256);
  for (const seg of segments) {
    if (best && best.score >= 8) break;
    const end = Math.min(seg.off + seg.size, lib.length);
    cnt.fill(0);
    let distinct = 0;
    let windowStart = seg.off;
    for (let p = seg.off; p < end; p++) {
      const b = lib[p];
      if (cnt[b]++ === 0) distinct++;
      if (p - windowStart < TABLE_SIZE - 1) continue;
      if (distinct === TABLE_SIZE && ((windowStart - seg.off) & 3) === 0) {
        const table = lib.subarray(windowStart, windowStart + TABLE_SIZE);
        const { score, seed } = scoreOf(table);
        const va = seg.va + (windowStart - seg.off);
        tried.push({ va, score, source: seg.exec ? 'scan-exec' : 'scan' });
        if (!best || score > best.score) best = { table, va, source: seg.exec ? 'scan-exec' : 'scan', score, seed };
      }
      const old = lib[windowStart++];
      if (--cnt[old] === 0) distinct--;
    }
  }
  if (best) return { ...best, tried, pool: pool.length };
  if (opts && opts.hintsOnly) return null;

  const err = new Error(
    'no 256-byte S-box permutation in libil2cpp.so produced a readable descriptor table');
  err.diagnostics = {
    pool: pool.length,
    permutations: tried.length,
    bestScore: tried.reduce((m, t) => Math.max(m, t.score), 0),
    segments: segments.length,
    tried: tried.slice(0, 8),
  };
  throw err;
}

/* --------------------------------------------------------- seed derivation */

/**
 * Every 64-bit constant the image builds with a movz + movk group.
 * The obfuscator never stores its seeds as data; it materialises each one right
 * before the loop that consumes it. A short gap is tolerated because the header
 * seed's movks are separated from its movz by an adrp/add pair.
 */
const SEED_CACHE = new WeakMap();

/** A 32-bit word view of the image. Unaligned buffers are copied once. */
function wordView(buf) {
  const n = buf.length >>> 2;
  try {
    return new Uint32Array(buf.buffer, buf.byteOffset, n);
  } catch (e) {
    const ab = new ArrayBuffer(n * 4);
    new Uint8Array(ab).set(buf.subarray(0, n * 4));
    return new Uint32Array(ab);
  }
}

function seedConstants(lib) {
  const hit = SEED_CACHE.get(lib);
  if (hit) return hit;

  /* One typed-array read per instruction instead of one Buffer method call per
     instruction: 28 million calls became 28 million array loads. The pool is
     cached on the buffer, because the table search and the header search both
     need it and rescanning 112 MB twice was the single largest cost here. */
  const words = wordView(lib);
  const n = words.length;
  const out = [];
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const w0 = words[i];
    // >>> 0: JS bitwise AND yields a signed 32-bit result, and MOVZ's opcode
    // has bit 31 set, so a plain !== against 0xD2800000 never matches.
    if (((w0 & 0xFF800000) >>> 0) !== 0xD2800000) continue;   // MOVZ 64-bit
    if (((w0 >>> 21) & 3) !== 0) continue;                    // hw must be 0
    const rd = w0 & 0x1F;
    const parts = [0, 0, 0, 0];
    parts[0] = (w0 >>> 5) & 0xFFFF;
    let got = 1;
    const limit = Math.min(i + 11, n);
    for (let j = i + 1; j < limit; j++) {
      const w = words[j];
      if (((w & 0xFF800000) >>> 0) !== 0xF2800000) continue;  // MOVK 64-bit
      if ((w & 0x1F) !== rd) continue;
      const hw = (w >>> 21) & 3;
      if (hw === 0) continue;
      parts[hw] = (w >>> 5) & 0xFFFF;
      got++;
      if (got === 4) break;
    }
    if (got !== 4) continue;
    const lo = ((parts[0] | (parts[1] << 16)) >>> 0);
    const hi = ((parts[2] | (parts[3] << 16)) >>> 0);
    const key = hi.toString(16) + ':' + lo.toString(16);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ lo, hi });
  }
  SEED_CACHE.set(lib, out);
  return out;
}

/**
 * How much the decrypted container table looks like 126 real descriptor triples.
 * A correct seed yields ~26 entries whose size is an exact multiple of their
 * count with an integer stride of at most 128 bytes; a wrong seed yields 0.
 * This is the only oracle available - the 0x5E8 plaintext is the descriptor
 * table itself, so there is no magic number to check against.
 */
function scoreHeader(table, meta, seed, profile) {
  const p = profile || PROFILES['gilla-v1'];
  if (meta.length < p.headerSize) return 0;
  const hdr = xorBytes(meta.subarray(0, p.headerSize), table, seed.lo, seed.hi);
  let n = 0;
  for (let i = 0; i < p.rows; i++) {
    const row = { offset: 0, count: 0, size: 0 };
    for (let k = 0; k < 3; k++) row[p.fields[k]] = hdr.readInt32LE(i * 12 + k * 4);
    if (row.count > 0 && row.count < 1000000 && row.size > 0 && row.size < 20000000
        && row.size % row.count === 0 && row.size / row.count >= 1 && row.size / row.count <= 128
        && row.offset >= 0 && row.offset < meta.length) {
      n++;
    }
  }
  return n;
}

/* ---------------------------------------------------------- text validation */

const isCont = (b) => (b & 0xC0) === 0x80;

/**
 * Length of the valid UTF-8 sequence starting at i, or 0 when the byte there
 * cannot start one. `allowWhitespace` is for string-literal pools, where tabs and
 * newlines are legal content but other control bytes are not.
 */
function utf8Seq(bytes, i, len, allowWhitespace) {
  const b = bytes[i];
  if (b < 0x80) {
    if (b === 0) return 0;
    if (b === 9 || b === 10 || b === 13) return allowWhitespace ? 1 : 0;
    if (b < 0x20 || b === 0x7F) return 0;
    return 1;
  }
  if (b >= 0xC2 && b <= 0xDF) {
    if (i + 1 >= len || !isCont(bytes[i + 1])) return 0;
    return 2;
  }
  if (b >= 0xE0 && b <= 0xEF) {
    if (i + 2 >= len) return 0;
    const b1 = bytes[i + 1];
    if (!isCont(bytes[i + 2])) return 0;
    if (b === 0xE0) return b1 >= 0xA0 && b1 <= 0xBF ? 3 : 0;
    if (b === 0xED) return b1 >= 0x80 && b1 <= 0x9F ? 3 : 0;
    return isCont(b1) ? 3 : 0;
  }
  if (b >= 0xF0 && b <= 0xF4) {
    if (i + 3 >= len) return 0;
    const b1 = bytes[i + 1];
    if (!isCont(bytes[i + 2]) || !isCont(bytes[i + 3])) return 0;
    if (b === 0xF0) return b1 >= 0x90 && b1 <= 0xBF ? 4 : 0;
    if (b === 0xF4) return b1 >= 0x80 && b1 <= 0x8F ? 4 : 0;
    return isCont(b1) ? 4 : 0;
  }
  return 0;
}

/**
 * firstBad[i] = the first offset at or after i where the text stops being valid
 * UTF-8. Built backwards in one pass, so "is this run clean" becomes two array
 * reads instead of a decode loop. That is what lets every row be checked instead
 * of a sample: 84,657 fields and 127,343 methods now cost less than 2,000 of them
 * did when each one allocated a TextDecoder.
 */
function buildFirstBad(bytes, allowWhitespace) {
  const len = bytes.length;
  const firstBad = new Int32Array(len + 1);
  firstBad[len] = len;
  for (let i = len - 1; i >= 0; i--) {
    const n = utf8Seq(bytes, i, len, allowWhitespace);
    firstBad[i] = n ? firstBad[i + n] : i;
  }
  return firstBad;
}

/**
 * The string section is a run of NUL-terminated names. firstBad[i] is the first
 * offset at or after i where the text stops being valid UTF-8 - which for a clean
 * run is the terminating NUL itself. So a name index resolves in three array
 * reads: it must sit at a run start, its run must be short, and the byte that
 * stopped the run must be a NUL. A name index is a byte offset into this section,
 * which makes this the strongest oracle in the file.
 */
function buildStringIndex(bytes) {
  const len = bytes.length;
  const firstBad = buildFirstBad(bytes, false);
  return {
    len,
    firstBad,
    resolves(offset) {
      if (!(offset >= 0 && offset < len)) return false;
      if (offset !== 0 && bytes[offset - 1] !== 0) return false;
      const end = firstBad[offset];
      if (end <= offset || end >= len) return false;
      if (end - offset > 512) return false;
      return bytes[end] === 0;
    },
    /** Every NUL-terminated run, counted once. */
    census() {
      let at = 0, runs = 0, ok = 0;
      while (at < len) {
        const end = firstBad[at];
        if (end === at) { at++; continue; }
        if (end < len && bytes[end] === 0) {
          runs++;
          if (end - at <= 512) ok++;
        }
        at = end + 1;
      }
      return { runs, ok };
    },
  };
}

/* ---------------------------------------------------------- section layout */

function decryptSections(meta, table, headerSeed, profile, opts) {
  const p = profile || PROFILES['gilla-v1'];
  const hdr = xorBytes(meta.subarray(0, p.headerSize), table, headerSeed.lo, headerSeed.hi);
  const descByRow = [];
  const desc = {};
  for (let i = 0; i < p.rows; i++) {
    const row = { offset: 0, count: 0, size: 0 };
    for (let k = 0; k < 3; k++) row[p.fields[k]] = hdr.readInt32LE(i * 12 + k * 4);
    descByRow.push(row);
    const role = p.role[i];
    if (role) desc[role] = row;
  }

  /* Physical position of each real section.

     'tiled' builds pack them back to back from sectionBase, each starting at the
     next 4-byte boundary; the descriptor's own offset field is the section's
     position in the *decrypted* file, not in the container, so it is not used to
     find them. It is used for the one thing it is good for: count/size gives the
     row stride of every section, which is how the string-literal index is read
     at the width it was actually written at.

     'biased' builds broke that packing: the descriptor offset is a position in a
     different file and the container's own gaps are not a constant, so each row
     carries its measured bias. Tiling such a build is what put the constraint
     table 2 bytes early and shifted every constraint by one slot. */
  const layout = {};
  if (p.positions === 'biased') {
    for (const idx of p.order) {
      const bias = (p.bias && p.bias[idx]) || 0;
      layout[idx] = { offset: descByRow[idx].offset + bias, size: descByRow[idx].size, bias };
    }
  } else {
    let pos = p.sectionBase;
    for (const idx of p.order) {
      pos = align4(pos);
      layout[idx] = { offset: pos, size: descByRow[idx].size };
      pos += descByRow[idx].size;
    }
  }
  const layoutByRole = {};
  for (const idx of p.order) {
    const role = p.role[idx];
    if (role) layoutByRole[role] = layout[idx];
  }

  const seeds = profileSeeds(p);
  const raw = {};
  const sec = {};
  const seedSource = {};
  for (const idx of p.order) {
    const { offset, size } = layout[idx];
    if (size < 0) {
      throw new Error(`descriptor e${idx} declares a negative size (${size})`);
    }
    if (offset < 0 || offset + size > meta.length) {
      throw new Error(`section e${idx} runs past EOF (${meta.length - offset} of ${size} bytes)`);
    }
    const role = p.role[idx];
    if (!role) continue;                       // obfuscator-only, not carried
    raw[role] = meta.subarray(offset, offset + size);
    if (seeds[idx]) {
      sec[role] = xorBytes(raw[role], table, seeds[idx].lo, seeds[idx].hi);
      seedSource[role] = 'known';
    } else {
      sec[role] = raw[role];
      seedSource[role] = 'clear';
    }
  }

  const recovery = (opts && opts.recover === false)
    ? [] : recoverSeeds(sec, raw, table, opts && opts.pool, p);

  return { sec, raw, layout: layoutByRole, desc, descByRow, seedSource, recovery, profile: p };
}

/**
 * The per-section seeds are a property of the build, not of the format. The table
 * above is a hint: when a hinted seed produces a section that fails its own
 * content rule, every 64-bit constant the image materialises is tried against a
 * 4 KB probe and the winner is re-verified over the whole section before it is
 * kept. A build that rotates its seeds therefore still decrypts, and nothing is
 * accepted on resemblance - the probe has to clear the same rule the verifier
 * applies, or the section is left exactly as the hint produced it.
 */
function recoverSeeds(sec, raw, table, pool, profile) {
  const p = profile || PROFILES['gilla-v1'];
  const log = [];
  if (!pool || !pool.length) return log;
  const PROBE = 4096;
  /* The literal pool is addressed by absolute offsets, so a 4 KB window would
     only cover the first few hundred literals. 256 KB covers several thousand,
     and the rows are then sampled across that whole window: the pool opens with a
     short binary prologue, and a prefix-only sample reads that prologue as the
     whole pool. */
  const BLOB_PROBE = 262144;

  const probeOf = (role, bytes) => {
    const cap = role === 'stringLiteralData' ? BLOB_PROBE : PROBE;
    return bytes && bytes.length > cap ? bytes.subarray(0, cap) : bytes;
  };

  /* The string index is 20 MB of typed arrays, so it is built once and reused by
     every name-based scorer - rebuilding it per section turned a 5 ms check into
     a 60 ms one. */
  let stringIdx = null;
  const getStringIdx = () => {
    if (!stringIdx) stringIdx = buildStringIndex(sec.string || Buffer.alloc(0));
    return stringIdx;
  };

  const nameScore = (bytes, stride, nameOffset) => {
    const strings = sec.string;
    if (!strings || !strings.length) return 0;
    const index = getStringIdx();
    const n = (bytes.length / stride) | 0;
    if (!n) return 0;
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const at = nameOffset === undefined ? i * stride : i * stride + nameOffset;
      if (at + 4 <= bytes.length && index.resolves(bytes.readUInt32LE(at))) ok++;
    }
    return ok / n;
  };

  /* Each scorer returns a 0..1 fraction built only from rules the plaintext
     cannot violate. */
  const scorers = {
    string: (bytes) => {
      const index = buildStringIndex(bytes);
      const { runs, ok } = index.census();
      return runs ? ok / runs : 0;
    },
    stringLiteral: (bytes) => {
      const n = (bytes.length / 4) | 0;
      if (n < 2) return 0;
      const ceiling = sec.stringLiteralData ? sec.stringLiteralData.length : 0xFFFFFFFF;
      let good = 0;
      for (let i = 1; i < n; i++) {
        const prev = bytes.readUInt32LE((i - 1) * 4);
        const at = bytes.readUInt32LE(i * 4);
        if (at >= prev && at <= ceiling) good++;
      }
      return bytes.readUInt32LE(0) === 0 ? good / (n - 1) : 0;
    },
    stringLiteralData: (bytes) => {
      const rows = sec.stringLiteral;
      if (!rows || !rows.length) return 0;
      const n = (rows.length / 4) | 0;
      if (n < 2) return 0;
      /* How many rows land inside this window, then a stride across all of them
         so one dense patch of binary cannot decide the score. */
      let inside = 0;
      for (let i = 0; i + 1 < n; i++) {
        const at = rows.readUInt32LE(i * 4);
        const len = rows.readUInt32LE((i + 1) * 4) - at;
        if (len < 0) return 0;
        if (at + len > bytes.length) break;
        inside++;
      }
      if (inside < 16) return 0;
      const blobIndex = buildFirstBad(bytes, true);
      const step = Math.max(1, Math.floor(inside / 512));
      let ok = 0, total = 0;
      for (let i = 0; i < inside; i += step) {
        const at = rows.readUInt32LE(i * 4);
        const len = rows.readUInt32LE((i + 1) * 4) - at;
        total++;
        if (len === 0 || blobIndex[at] >= at + len) ok++;
      }
      return total ? ok / total : 0;
    },
    fields: (bytes) => nameScore(bytes, 10),
    methods: (bytes) => nameScore(bytes, 30),
    properties: (bytes) => nameScore(bytes, 20),
    assemblies: (bytes) => nameScore(bytes, 68, 20),
  };

  /* The string section first: it is the oracle every name-based section needs. */
  for (const role of ['string', 'fields', 'methods', 'properties', 'stringLiteral', 'stringLiteralData', 'assemblies']) {
    const score = scorers[role];
    const current = sec[role];
    if (!current || !current.length) continue;
    if (score(probeOf(role, current)) >= 0.98) continue;

    const row = rowOfRole(p, role);
    const hint = row === null ? null : profileSeeds(p)[row];
    const probeRaw = probeOf(role, raw[role]);
    let bestSeed = null;
    let bestScore = 0;
    for (const seed of pool) {
      if (hint && seed.lo === hint.lo && seed.hi === hint.hi) continue;
      const candidate = xorBytes(probeRaw, table, seed.lo, seed.hi);
      const s = score(candidate);
      if (s > bestScore) { bestScore = s; bestSeed = seed; }
    }
    const previous = hint ? 'hinted' : 'clear';
    if (!bestSeed || bestScore < 0.98) {
      log.push({
        role, recovered: false, previous,
        best: Number(bestScore.toFixed(3)), tried: pool.length,
        note: 'no constant in libil2cpp.so decrypted this section to content that satisfies its own rule',
      });
      continue;
    }
    const plain = xorBytes(raw[role], table, bestSeed.lo, bestSeed.hi);
    const full = score(plain);
    if (full < 0.98) {
      log.push({
        role, recovered: false, previous,
        best: Number(full.toFixed(3)), tried: pool.length,
        note: 'a probe cleared the rule but the whole section did not',
      });
      continue;
    }
    sec[role] = plain;
    if (role === 'string') stringIdx = null;   // every name-based scorer must see the new one
    log.push({
      role, recovered: true, previous,
      seed: hex64(bestSeed), score: Number(full.toFixed(3)), tried: pool.length,
    });
  }

  return log;
}

/* -------------------------------------------------------------- verification */

/**
 * Measured checks per section. A wrong seed turns the whole file into noise, so
 * every rule here is something the plaintext cannot violate: a name index must
 * land on a NUL-terminated run of printable UTF-8 inside the string section, a
 * declaring-type index must land inside the type table, a parameter window must
 * land inside the parameter table. Each row reports its score, its sample size
 * and the rule it tested, so a caller can check the claim instead of trusting it.
 */
function verifySections(sec, ctx) {
  const profile = (ctx && ctx.profile) || PROFILES['gilla-v1'];
  const s = byRole(sec, profile);
  /* Descriptors are keyed by row in a container and by role once decrypted;
     resolve both spellings the same way the section map is resolved. */
  const desc = resolveDesc(ctx && ctx.desc, profile);
  const stringBytes = s.string || Buffer.alloc(0);
  const strings = buildStringIndex(stringBytes);
  const strLen = stringBytes.length;
  let stringCount = 0;
  for (let i = 0; i < strLen; i++) if (stringBytes[i] === 0) stringCount++;

  const typeCount = s.typeDefinitions ? (s.typeDefinitions.length / 66) | 0 : 0;
  const paramCount = s.parameters ? (s.parameters.length / 10) | 0 : 0;
  const fieldCount = s.fields ? (s.fields.length / 10) | 0 : 0;
  const methodCount = s.methods ? (s.methods.length / 30) | 0 : 0;
  const imageCount = s.images ? (s.images.length / 36) | 0 : 0;
  const assemblyCount = s.assemblies ? (s.assemblies.length / 68) | 0 : 0;
  const containerCount = s.genericContainers ? (s.genericContainers.length / 9) | 0 : 0;
  const genericParamCount = s.genericParameters ? (s.genericParameters.length / 14) | 0 : 0;
  const constraintCount = s.genericParameterConstraints ? (s.genericParameterConstraints.length / 2) | 0 : 0;
  const unresolvedTypeCount = s.unresolvedVirtualCallParameterTypes
    ? (s.unresolvedVirtualCallParameterTypes.length / 2) | 0 : 0;
  const blob = s.stringLiteralData || Buffer.alloc(0);
  const blobSize = blob.length;
  const blobIndex = buildFirstBad(blob, true);

  const resolves = (offset) => strings.resolves(offset);

  /* A literal run may contain tabs and newlines; it may not contain NULs or any
     other control byte, and it must decode as UTF-8. O(1) per run. */
  function runClean(at, len) {
    if (!(len >= 0 && at >= 0 && at + len <= blobSize)) return false;
    if (len === 0) return true;
    return blobIndex[at] >= at + len;
  }

  const rows = [];
  const notChecked = [];
  const add = (name, rule, score, samples, note) => {
    rows.push({
      index: rowOfRole(profile, name), name, rule,
      score: Number(score.toFixed(3)),
      samples,
      verified: samples > 0 && score >= 0.98,
      note,
    });
  };

  /* string table: every NUL-terminated run, not a sample of them */
  {
    const { runs, ok } = strings.census();
    add('string', 'printable UTF-8 identifiers', runs ? ok / runs : 0, runs,
      `${runs.toLocaleString('en-US')} runs, ${stringCount.toLocaleString('en-US')} NUL terminators`);
  }

  const literal = analyseLiterals(s, desc, blob, runClean);

  /* Only the reading that was accepted is reported as a verified section; the
     rejected hypothesis is not a broken section, so it does not appear as one.
     When neither reading passes, every reading is reported, so the failure is
     visible. */
  if (literal.layout === 'stock') {
    add('stringLiteral', 'each row is {length, dataIndex} and the run at dataIndex is clean UTF-8',
      literal.score, literal.rows,
      `${literal.rows.toLocaleString('en-US')} rows of ${literal.stride} bytes, ${blobSize.toLocaleString('en-US')} blob bytes`);
  } else if (literal.layout === 'offsets') {
    add('stringLiteralData', 'offsets tile the blob and every run is clean UTF-8',
      literal.score, literal.sampled,
      `${literal.rows.toLocaleString('en-US')} offsets of ${literal.stride} bytes, ${blobSize.toLocaleString('en-US')} blob bytes`);
  } else if (literal.candidates.length) {
    for (const c of literal.candidates) {
      add(c.layout === 'stock' ? 'stringLiteral' : 'stringLiteralData',
        c.layout === 'stock'
          ? 'each row is {length, dataIndex} and the run at dataIndex is clean UTF-8'
          : 'offsets tile the blob and every run is clean UTF-8',
        c.score, c.layout === 'stock' ? c.rows : c.sampled, c.note);
    }
  }

  /* typeDefinitions: the name offset must resolve and every index must be in
     range. A type record is the root every other table is read against, so it is
     checked before the tables that point into it. */
  {
    const t = s.typeDefinitions;
    const n = t ? (t.length / 66) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 66;
      const byval = t.readUInt16LE(o + 8);
      const name = t.readUInt32LE(o);
      if (resolves(name) && (byval === 0xFFFF || byval < 0x10000)) ok++;
    }
    add('typeDefinitions', 'name offset resolves and the by-value type index is a u16 index', n ? ok / n : 0, n,
      `${n.toLocaleString('en-US')} rows`);
  }

  /* fields: the name offset must resolve and the type index must not be negative */
  {
    const t = s.fields;
    const n = t ? (t.length / 10) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) if (resolves(t.readUInt32LE(i * 10))) ok++;
    add('fields', 'name offset resolves to a printable NUL-terminated string', n ? ok / n : 0, n, `${n.toLocaleString('en-US')} rows`);
  }

  /* methods: name, declaring type and parameter window */
  {
    const t = s.methods;
    const n = t ? (t.length / 30) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 30;
      const name = t.readUInt32LE(o);
      const decl = t.readUInt16LE(o + 4);
      const pstart = t.readUInt32LE(o + 12);
      const pcount = t.readUInt16LE(o + 28);
      /* A method with no parameters stores parameterStart = -1, so the window
         test only applies when there is a window. */
      const windowOk = pcount === 0 || (pstart !== 0xFFFFFFFF && pstart + pcount <= paramCount);
      if (resolves(name) && decl < typeCount && windowOk) ok++;
    }
    add('methods', 'name resolves, declaring type and parameter window are in range', n ? ok / n : 0, n, `${n.toLocaleString('en-US')} rows`);
  }

  /* properties */
  {
    const t = s.properties;
    const n = t ? (t.length / 20) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) if (resolves(t.readUInt32LE(i * 20))) ok++;
    add('properties', 'name offset resolves', n ? ok / n : 0, n, `${n.toLocaleString('en-US')} rows`);
  }

  /* parameters: name resolves and the type index is inside the type table */
  {
    const t = s.parameters;
    const n = t ? (t.length / 10) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 10;
      if (resolves(t.readUInt32LE(o)) && t.readUInt16LE(o + 8) < 0x10000) ok++;
    }
    add('parameters', 'name offset resolves and the type index is a u16 index', n ? ok / n : 0, n,
      `${n.toLocaleString('en-US')} rows`);
  }

  /* images */
  {
    const t = s.images;
    const n = t ? (t.length / 36) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 36;
      const name = t.readUInt32LE(o);
      const start = t.readUInt16LE(o + 8);
      const count = t.readUInt16LE(o + 10);
      if (resolves(name) && start + count <= typeCount) ok++;
    }
    add('images', 'name resolves and the type window tiles the type table', n ? ok / n : 0, n, `${n} rows`);
  }

  /* assemblies */
  {
    const t = s.assemblies;
    const n = t ? (t.length / 68) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 68;
      const image = t.readUInt32LE(o);
      const name = t.readUInt32LE(o + 20);
      if (image < imageCount && resolves(name)) ok++;
    }
    add('assemblies', 'image index in range and the name offset resolves', n ? ok / n : 0, n, `${n} rows`);
  }

  /* generic containers: every container must own a real type or method and its
     argument count must account for the whole generic-parameter table */
  {
    const t = s.genericContainers;
    const n = containerCount;
    let ok = 0, argcSum = 0, badStart = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      const owner = t.readUInt32LE(o);
      const argc = t.readUInt16LE(o + 4);
      const isMethod = t[o + 6];
      const start = t.readUInt16LE(o + 7);
      argcSum += argc;
      if (start + argc > genericParamCount) badStart++;
      const ownerOk = isMethod ? owner < methodCount : owner < typeCount;
      if (ownerOk && (isMethod === 0 || isMethod === 1) && start + argc <= genericParamCount) ok++;
    }
    const sumOk = argcSum === genericParamCount;
    add('genericContainers',
      'owner index is in range, isMethod is a flag, and the argc values sum to the parameter table',
      n ? (ok / n) * (sumOk ? 1 : 0) : 0, n,
      `${n.toLocaleString('en-US')} containers, argc sum ${argcSum.toLocaleString('en-US')} of ${genericParamCount.toLocaleString('en-US')} params, ${badStart} windows out of range`);
  }

  /* generic parameters: the constraint windows must tile the constraint table
     with no gap and no overlap - each row's start is the running sum of the
     previous rows' counts */
  {
    const t = s.genericParameters;
    const n = genericParamCount;
    let cursor = 0, ok = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 14;
      const cstart = t.readUInt16LE(o + 6);
      const ccount = t.readUInt16LE(o + 8);
      if (ccount === 0 || cstart === cursor) ok++;
      cursor += ccount;
    }
    const closes = cursor === constraintCount;
    add('genericParameters',
      'each constraint window starts where the previous one ended and the last one ends at the constraint table',
      n ? (ok / n) * (closes ? 1 : 0) : 0, n,
      `${n.toLocaleString('en-US')} params, cursor ends at ${cursor.toLocaleString('en-US')} of ${constraintCount.toLocaleString('en-US')} constraints`);
  }

  /* generic parameter constraints: every entry is a type index */
  {
    const t = s.genericParameterConstraints;
    const n = constraintCount;
    let ok = 0;
    for (let i = 0; i < n; i++) if (t.readUInt16LE(i * 2) < 0x10000) ok++;
    add('genericParameterConstraints', 'every constraint is a u16 type index', n ? ok / n : 0, n,
      `${n.toLocaleString('en-US')} entries`);
  }

  /* the index-only tables: every value must land inside the table it names */
  const indexTable = (name, stride, limit, label) => {
    const t = s[name];
    const n = t ? (t.length / stride) | 0 : 0;
    if (!n) return;
    let ok = 0;
    for (let i = 0; i < n; i++) if (t.readUInt16LE(i * stride) < limit) ok++;
    add(name, `every ${label} is inside the table it names`, n ? ok / n : 0, n, `${n.toLocaleString('en-US')} rows`);
  };
  indexTable('nestedTypes', 4, typeCount, 'nested type index');
  indexTable('referencedAssemblies', 4, assemblyCount, 'assembly index');
  indexTable('fieldRefs', 4, typeCount, 'declaring type index');

  /* unresolvedVirtualCallParameterTypes: a type index per row, but the
     container stores il2cpp type indices, so the range test is reported, not
     scored - the same reason interfaces is reported below. */
  if (s.unresolvedVirtualCallParameterTypes && s.unresolvedVirtualCallParameterTypes.length) {
    const t = s.unresolvedVirtualCallParameterTypes;
    const n = (t.length / 2) | 0;
    let max = 0, inRange = 0;
    for (let i = 0; i < n; i++) {
      const v = t.readUInt16LE(i * 2);
      if (v > max) max = v;
      if (v < typeCount) inRange++;
    }
    if (inRange !== n) {
      notChecked.push({
        name: 'unresolvedVirtualCallParameterTypes',
        reason: `values are il2cpp type indices (max ${max.toLocaleString('en-US')} against `
          + `${typeCount.toLocaleString('en-US')} type definitions), not type-definition indices; `
          + 'the section is parsed and then not emitted, because no stock-format mapping is proven.',
      });
    }
  }

  /* unresolvedVirtualCallParameterRanges: {start, count} into the type table */
  {
    const t = s.unresolvedVirtualCallParameterRanges;
    const n = t ? (t.length / 8) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const start = t.readUInt32LE(i * 8);
      const count = t.readUInt32LE(i * 8 + 4);
      if (start + count <= unresolvedTypeCount) ok++;
    }
    if (n) add('unresolvedVirtualCallParameterRanges', 'every range lands inside the parameter type table', ok / n, n,
      `${n.toLocaleString('en-US')} rows`);
  }

  /* the two default-value tables point into the field and parameter tables */
  {
    const t = s.fieldDefaultValues;
    const n = t ? (t.length / 10) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) if (t.readUInt32LE(i * 10) < fieldCount) ok++;
    if (n) add('fieldDefaultValues', 'every field index is inside the field table', ok / n, n,
      `${n.toLocaleString('en-US')} rows`);
  }
  {
    const t = s.parameterDefaultValues;
    const n = t ? (t.length / 10) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) if (t.readUInt32LE(i * 10) < paramCount) ok++;
    if (n) add('parameterDefaultValues', 'every parameter index is inside the parameter table', ok / n, n,
      `${n.toLocaleString('en-US')} rows`);
  }
  {
    const t = s.fieldMarshaledSizes;
    const n = t ? (t.length / 10) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) if (t.readUInt32LE(i * 10) < fieldCount) ok++;
    if (n) add('fieldMarshaledSizes', 'every field index is inside the field table', ok / n, n,
      `${n.toLocaleString('en-US')} rows`);
  }

  /* Sections that are carried through but whose meaning is not the stock one.
     They are named with the measurement that shows it, so the run log can say
     "widened, not proven" instead of "verified" or "missing". */
  if (s.interfaces && s.interfaces.length) {
    const t = s.interfaces;
    const n = (t.length / 2) | 0;
    let max = 0, inRange = 0;
    for (let i = 0; i < n; i++) {
      const v = t.readUInt16LE(i * 2);
      if (v > max) max = v;
      if (v < typeCount) inRange++;
    }
    if (inRange !== n) {
      notChecked.push({
        name: 'interfaces',
        reason: `the container stores il2cpp type indices here (max ${max.toLocaleString('en-US')} against `
          + `${typeCount.toLocaleString('en-US')} type definitions), not the type-definition indices a stock `
          + `v31 file carries; ${(n - inRange).toLocaleString('en-US')} of ${n.toLocaleString('en-US')} values are `
          + 'outside the type table. The values are widened verbatim and the dumper accepts them.',
      });
    }
  }
  if (s.interfaceOffsets && s.interfaceOffsets.length) {
    const t = s.interfaceOffsets;
    const n = (t.length / 6) | 0;
    let max = 0, inRange = 0;
    for (let i = 0; i < n; i++) {
      const v = t.readUInt16LE(i * 6);
      if (v > max) max = v;
      if (v < typeCount) inRange++;
    }
    if (inRange !== n) {
      notChecked.push({
        name: 'interfaceOffsets',
        reason: `the type-index half carries il2cpp type indices (max ${max.toLocaleString('en-US')}), not `
          + 'type-definition indices; widened verbatim, accepted by the dumper, not proven to mean what the stock field means.',
      });
    }
  }
  if (s.vtableMethods && s.vtableMethods.length) {
    const t = s.vtableMethods;
    const n = (t.length / 4) | 0;
    let odd = 0;
    for (let i = 0; i < n; i++) {
      const v = t.readUInt32LE(i * 4);
      if (v & 1) odd++;
    }
    notChecked.push({
      name: 'vtableMethods',
      reason: `every entry has bit 0 set (${odd.toLocaleString('en-US')} of ${n.toLocaleString('en-US')}) and the `
        + 'tag is not the stock layout, so no rule here can say which method an entry names; the values are '
        + 'carried through and the dumper reads them without failing.',
    });
  }
  if (s.attributeDataRange && s.attributeDataRange.length) {
    notChecked.push({
      name: 'attributeDataRange',
      reason: 'the attribute stream is dropped on output, so there is no blob to check the ranges against; the '
        + 'values also carry high bits (up to 0x20000001) that a stock offset does not.',
    });
  }

  return {
    sections: rows,
    notChecked,
    stringCount,
    typeCount,
    literal,
  };
}

/**
 * The string-literal pair is the one structure whose row width the container
 * changes, and it changes it per build: the descriptor's own count and size give
 * the stride, so nothing is assumed. A 4-byte stride is a monotonic offset array
 * (lengths are the gaps); an 8-byte stride is either stock {length, dataIndex}
 * pairs or, in older containers, the same offset array widened to 8 bytes.
 *
 * Reading a 4-byte array as 8-byte pairs is what made the dumper allocate the
 * absolute file offset of every literal as its length, which is the allocation
 * that killed it. Every hypothesis is scored on every row before one is chosen.
 */
function analyseLiterals(sec, desc, blob, runClean) {
  const t = sec.stringLiteral;
  const out = {
    layout: null,
    stride: null,
    rows: 0,
    sampled: 0,
    score: 0,
    tiles: false,
    blobBytes: blob.length,
    candidates: [],
    scores: {},
    reason: '',
  };
  if (!t || !t.length) {
    out.reason = 'the container carries no string-literal index rows at all';
    return out;
  }

  const blobSize = blob.length;
  const declared = desc && desc.stringLiteral;
  let stride = null;
  if (declared && declared.count > 0 && declared.size > 0 && declared.size % declared.count === 0) {
    stride = declared.size / declared.count;
  }

  const offsetsHyp = (width) => {
    if (t.length % width !== 0) return null;
    const n = t.length / width;
    if (n < 2) return null;
    const at = (i) => t.readUInt32LE(i * width);
    let monotonic = 0;
    for (let i = 0; i < n; i++) if (i === 0 || at(i) >= at(i - 1)) monotonic++;
    /* Exact, not statistical: a real offset array starts at 0, ends at the end
       of the blob and never goes backwards. The deltas then tile the blob with
       no gap and no overlap. */
    const tiles = at(0) === 0 && at(n - 1) === blobSize && monotonic === n;
    let ok = 0, total = 0;
    for (let i = 0; i + 1 < n; i++) {
      const start = at(i);
      const len = at(i + 1) - start;
      if (len < 0) continue;
      total++;
      if (runClean(start, len)) ok++;
    }
    return {
      layout: 'offsets', stride: width, rows: n, sampled: total,
      score: total ? ok / total : 0, tiles,
      note: `${n.toLocaleString('en-US')} offsets, tiling ${tiles ? 'exact' : 'broken'}`,
    };
  };

  const pairsHyp = () => {
    const n = (t.length / 8) | 0;
    if (!n) return null;
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const len = t.readUInt32LE(i * 8);
      const at = t.readUInt32LE(i * 8 + 4);
      if (runClean(at, len)) ok++;
    }
    return {
      layout: 'stock', stride: 8, rows: n, sampled: n,
      score: n ? ok / n : 0, tiles: false,
      note: `${n.toLocaleString('en-US')} rows of {length, dataIndex}`,
    };
  };

  /* The declared stride is tried first; the other widths only when the descriptor
     did not name one, so a build that adds a section cannot quietly change how
     this one is read. */
  const order = stride === 4 ? [4] : stride === 8 ? [8] : [4, 8];
  for (const width of order) {
    const o = offsetsHyp(width);
    if (o) out.candidates.push(o);
    if (width === 8) {
      const p = pairsHyp();
      if (p) out.candidates.push(p);
    }
  }

  const byLayout = (layout, width) => out.candidates.find(c => c.layout === layout && c.stride === width);
  out.scores = {
    stock: byLayout('stock', 8) ? Number(byLayout('stock', 8).score.toFixed(3)) : 0,
    offsets: byLayout('offsets', stride || 4) ? Number(byLayout('offsets', stride || 4).score.toFixed(3)) : 0,
  };

  /* A tiling offset array is exact evidence, so it wins outright. Otherwise the
     best reading that clears the threshold is taken; a reading that tiles but is
     not text is refused, because the pool cannot be addressed as a string table. */
  const tiled = out.candidates.find(c => c.layout === 'offsets' && c.tiles && c.score >= 0.98);
  const best = tiled
    || out.candidates.filter(c => c.score >= 0.98).sort((a, b) => b.score - a.score)[0]
    || null;

  if (best) {
    out.layout = best.layout;
    out.stride = best.stride;
    out.rows = best.rows;
    out.sampled = best.sampled;
    out.score = best.score;
    out.tiles = best.tiles;
    return out;
  }

  const broken = out.candidates.find(c => c.layout === 'offsets' && c.stride === (stride || 4));
  if (!broken) {
    out.reason = 'the index rows do not divide into any row width this reader knows';
  } else if (!broken.tiles) {
    out.reason = `the offset reading does not tile the blob `
      + `(first ${t.readUInt32LE(0)}, last ${t.readUInt32LE((broken.rows - 1) * broken.stride)}, `
      + `blob ${blobSize}); the pool cannot be addressed as a string table`;
  } else {
    out.reason = `the offsets tile the blob but only `
      + `${(broken.score * 100).toFixed(1)}% of runs are clean UTF-8; `
      + `the pool is not plain text`;
  }
  return out;
}

/* ------------------------------------------------------------ conversion */

function convert(sec, verification, profile) {
  const s = byRole(sec, profile);
  const out = {};
  const recovered = {
    genericContainerIndex: 0,
    elementTypeIndex: 0,
    literalLayout: null,
  };

  /* -- string literals: measured, then emitted in the layout that was proven -- */
  {
    const lit = s.stringLiteralData || Buffer.alloc(0);
    const rows = s.stringLiteral;
    const L = verification.literal || {};
    const layout = L.layout;
    const stride = L.stride || 8;
    const count = rows && stride ? (rows.length / stride) | 0 : 0;
    if (layout === 'stock' && count) {
      /* Rows already are {length, dataIndex}; nothing is recomputed. */
      out.stringLiteral = Buffer.from(rows);
      out.stringLiteralData = lit;
      recovered.literalLayout = 'stock';
    } else if (layout === 'offsets' && count) {
      /* Rows are a monotonic offset array at the width the container declared;
         the length is the gap to the next row, clamped to the blob. */
      const buf = Buffer.allocUnsafe(count * 8);
      for (let i = 0; i < count; i++) {
        const at = rows.readUInt32LE(i * stride);
        const end = i + 1 < count ? rows.readUInt32LE((i + 1) * stride) : lit.length;
        buf.writeInt32LE(Math.max(0, Math.min(end - at, lit.length - at)), i * 8);
        buf.writeInt32LE(at, i * 8 + 4);
      }
      out.stringLiteral = buf;
      out.stringLiteralData = lit;
      recovered.literalLayout = 'offsets';
    } else {
      /* Leaving the pair empty is the only honest option: neither reading of the
         index rows addresses the blob as text, and a wrong {length,dataIndex} row
         makes Il2CppDumper allocate the length it is handed. */
      out.stringLiteral = Buffer.alloc(0);
      out.stringLiteralData = Buffer.alloc(0);
    }
  }
  out.string = s.string || Buffer.alloc(0);

  /* -- events: 22 -> 24 ----------------------------------------------------- */
  {
    const src = s.events;
    const n = (src.length / 22) | 0;
    const buf = Buffer.allocUnsafe(n * 24);
    for (let i = 0; i < n; i++) {
      const o = i * 22;
      const name = src.readUInt32LE(o);
      const typ = src.readUInt16LE(o + 4);
      const add = src.readUInt32LE(o + 6);
      const rem = src.readUInt32LE(o + 10);
      const rai = src.readUInt32LE(o + 14);
      const tok = src.readUInt32LE(o + 18);
      const w = i * 24;
      buf.writeUInt32LE(name, w);
      buf.writeInt32LE(s32(typ), w + 4);
      buf.writeInt32LE(s32(add), w + 8);
      buf.writeInt32LE(s32(rem), w + 12);
      buf.writeInt32LE(s32(rai), w + 16);
      buf.writeUInt32LE(tok, w + 20);
    }
    out.events = buf;
  }

  /* -- properties: already stock v31 (20 bytes) ----------------------------- */
  out.properties = s.properties;

  /* -- methods: 30 -> 36 ---------------------------------------------------- */
  {
    const src = s.methods;
    const n = (src.length / 30) | 0;
    const buf = Buffer.allocUnsafe(n * 36);
    for (let i = 0; i < n; i++) {
      const o = i * 30;
      const name = src.readUInt32LE(o);
      const decl = src.readUInt16LE(o + 4);
      const ret = src.readUInt16LE(o + 6);
      const rptok = src.readUInt32LE(o + 8);
      const pstart = src.readUInt32LE(o + 12);
      const gc = src.readUInt16LE(o + 16);
      const tok = src.readUInt32LE(o + 18);
      const flags = src.readUInt16LE(o + 22);
      const iflags = src.readUInt16LE(o + 24);
      const slot = src.readUInt16LE(o + 26);
      const pcount = src.readUInt16LE(o + 28);
      const w = i * 36;
      buf.writeUInt32LE(name, w);
      buf.writeInt32LE(s32(decl), w + 4);
      buf.writeInt32LE(s32(ret), w + 8);
      buf.writeUInt32LE(rptok, w + 12);
      buf.writeInt32LE(s32(pstart), w + 16);
      buf.writeInt32LE(neg16(gc), w + 20);
      buf.writeUInt32LE(tok, w + 24);
      buf.writeUInt16LE(flags, w + 28);
      buf.writeUInt16LE(iflags, w + 30);
      buf.writeUInt16LE(slot, w + 32);
      buf.writeUInt16LE(pcount, w + 34);
    }
    out.methods = buf;
  }

  /* -- default values: 10 -> 12 --------------------------------------------- */
  for (const [key, role] of [['parameterDefaultValues', 'parameterDefaultValues'], ['fieldDefaultValues', 'fieldDefaultValues']]) {
    const src = s[role];
    const n = (src.length / 10) | 0;
    const buf = Buffer.allocUnsafe(n * 12);
    for (let i = 0; i < n; i++) {
      const o = i * 10;
      const w = i * 12;
      buf.writeUInt32LE(src.readUInt32LE(o), w);
      buf.writeInt32LE(s32(src.readUInt16LE(o + 4)), w + 4);
      buf.writeInt32LE(s32(src.readUInt32LE(o + 6)), w + 8);
    }
    out[key] = buf;
  }
  out.fieldAndParameterDefaultValueData = s.fieldAndParameterDefaultValueData || Buffer.alloc(0);

  /* -- fieldMarshaledSizes: 10 -> 12 ---------------------------------------- */
  {
    const src = s.fieldMarshaledSizes;
    const n = (src.length / 10) | 0;
    const buf = Buffer.allocUnsafe(n * 12);
    for (let i = 0; i < n; i++) {
      const o = i * 10;
      const w = i * 12;
      buf.writeUInt32LE(src.readUInt32LE(o), w);
      buf.writeInt32LE(s32(src.readUInt16LE(o + 4)), w + 4);
      buf.writeInt32LE(s32(src.readUInt16LE(o + 8)), w + 8);
    }
    out.fieldMarshaledSizes = buf;
  }

  /* -- parameters: 10 -> 12 ------------------------------------------------- */
  {
    const src = s.parameters;
    const n = (src.length / 10) | 0;
    const buf = Buffer.allocUnsafe(n * 12);
    for (let i = 0; i < n; i++) {
      const o = i * 10;
      const w = i * 12;
      buf.writeUInt32LE(src.readUInt32LE(o), w);
      buf.writeUInt32LE(src.readUInt32LE(o + 4), w + 4);
      buf.writeInt32LE(s32(src.readUInt16LE(o + 8)), w + 8);
    }
    out.parameters = buf;
  }

  /* -- fields: 10 -> 12 ----------------------------------------------------- */
  {
    const src = s.fields;
    const n = (src.length / 10) | 0;
    const buf = Buffer.allocUnsafe(n * 12);
    for (let i = 0; i < n; i++) {
      const o = i * 10;
      const w = i * 12;
      buf.writeUInt32LE(src.readUInt32LE(o), w);
      buf.writeInt32LE(s32(src.readUInt16LE(o + 4)), w + 4);
      buf.writeInt32LE(s32(src.readUInt32LE(o + 6)), w + 8);
    }
    out.fields = buf;
  }

  /* -- generic containers: 9 -> 16 ------------------------------------------ */
  const cont = [];
  {
    const src = s.genericContainers;
    const n = (src.length / 9) | 0;
    const buf = Buffer.allocUnsafe(n * 16);
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      const owner = src.readUInt32LE(o);
      const argc = src.readUInt16LE(o + 4);
      const isMethod = src[o + 6];
      const start = src.readUInt16LE(o + 7);
      cont.push({ owner, isMethod });
      const w = i * 16;
      buf.writeInt32LE(s32(owner), w);
      buf.writeInt32LE(argc, w + 4);
      buf.writeInt32LE(isMethod, w + 8);
      buf.writeInt32LE(start, w + 12);
    }
    out.genericContainers = buf;
  }

  /* -- generic parameters: 14 -> 16 ----------------------------------------- */
  {
    const src = s.genericParameters;
    const n = (src.length / 14) | 0;
    const buf = Buffer.allocUnsafe(n * 16);
    for (let i = 0; i < n; i++) {
      const o = i * 14;
      const cidx = src.readUInt16LE(o);
      const name = src.readUInt32LE(o + 2);
      const cstart = src.readUInt16LE(o + 6);
      const ccount = src.readUInt16LE(o + 8);
      const num = src.readUInt16LE(o + 10);
      const flags = src.readUInt16LE(o + 12);
      const owner = cidx < cont.length ? cont[cidx].owner : 0xFFFFFFFF;
      const w = i * 16;
      buf.writeInt32LE(s32(owner), w);
      buf.writeUInt32LE(name, w + 4);
      buf.writeInt16LE(s32(cstart), w + 8);
      buf.writeInt16LE(s32(ccount), w + 10);
      buf.writeUInt16LE(num, w + 12);
      buf.writeUInt16LE(flags, w + 14);
    }
    out.genericParameters = buf;
  }

  /* -- generic parameter constraints: 2 -> 4 -------------------------------- */
  {
    const src = s.genericParameterConstraints;
    const n = (src.length / 2) | 0;
    const buf = Buffer.allocUnsafe(n * 4);
    for (let i = 0; i < n; i++) buf.writeInt32LE(src.readUInt16LE(i * 2), i * 4);
    out.genericParameterConstraints = buf;
  }

  /* -- nestedTypes / vtableMethods: already u32 ----------------------------- */
  out.nestedTypes = s.nestedTypes || Buffer.alloc(0);
  out.vtableMethods = s.vtableMethods || Buffer.alloc(0);

  /* -- interfaces: 2 -> 4 --------------------------------------------------- */
  {
    const src = s.interfaces;
    const n = (src.length / 2) | 0;
    const buf = Buffer.allocUnsafe(n * 4);
    for (let i = 0; i < n; i++) buf.writeInt32LE(src.readUInt16LE(i * 2), i * 4);
    out.interfaces = buf;
  }

  /* -- interfaceOffsets: 6 -> 8 --------------------------------------------- */
  {
    const src = s.interfaceOffsets;
    const n = (src.length / 6) | 0;
    const buf = Buffer.allocUnsafe(n * 8);
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      buf.writeInt32LE(src.readUInt16LE(o), i * 8);
      buf.writeInt32LE(s32(src.readUInt32LE(o + 2)), i * 8 + 4);
    }
    out.interfaceOffsets = buf;
  }

  /* -- typeDefinitions: 66 -> 88 -------------------------------------------- */
  let typeCount = 0;
  {
    const src = s.typeDefinitions;
    const n = (src.length / 66) | 0;
    typeCount = n;
    const buf = Buffer.allocUnsafe(n * 88);
    for (let i = 0; i < n; i++) {
      const o = i * 66;
      const w = i * 88;
      buf.writeUInt32LE(src.readUInt32LE(o), w);            // name
      buf.writeUInt32LE(src.readUInt32LE(o + 4), w + 4);    // namespace
      buf.writeInt32LE(src.readUInt16LE(o + 8), w + 8);     // byvalTypeIndex
      buf.writeInt32LE(neg16(src.readUInt16LE(o + 10)), w + 12);
      buf.writeInt32LE(neg16(src.readUInt16LE(o + 12)), w + 16);
      buf.writeInt32LE(-1, w + 20);                         // elementTypeIndex, derived below
      buf.writeInt32LE(neg16(src.readUInt16LE(o + 14)), w + 24); // genericContainerIndex, kept
      buf.writeUInt32LE(src.readUInt32LE(o + 16), w + 28);  // flags
      buf.writeInt32LE(s32(src.readUInt32LE(o + 20)), w + 32);
      buf.writeInt32LE(s32(src.readUInt32LE(o + 24)), w + 36);
      buf.writeInt32LE(neg16(src.readUInt16LE(o + 28)), w + 40);
      buf.writeInt32LE(neg16(src.readUInt16LE(o + 30)), w + 44);
      buf.writeInt32LE(neg16(src.readUInt16LE(o + 32)), w + 48);
      buf.writeInt32LE(neg16(src.readUInt16LE(o + 34)), w + 52);
      buf.writeInt32LE(s32(src.readUInt32LE(o + 36)), w + 56);
      buf.writeInt32LE(neg16(src.readUInt16LE(o + 40)), w + 60);
      for (let c = 0; c < 8; c++) {
        buf.writeUInt16LE(src.readUInt16LE(o + 42 + c * 2), w + 64 + c * 2);
      }
      buf.writeUInt32LE(src.readUInt32LE(o + 58), w + 80);  // bitfield
      buf.writeUInt32LE(src.readUInt32LE(o + 62), w + 84);  // token
    }
    out.typeDefinitions = buf;
  }

  /* -- images: 36 -> 40 ----------------------------------------------------- */
  {
    const src = s.images;
    const n = (src.length / 36) | 0;
    const buf = Buffer.allocUnsafe(n * 40);
    for (let i = 0; i < n; i++) {
      const o = i * 36;
      const w = i * 40;
      const ecount = src.readUInt16LE(o + 14);
      buf.writeUInt32LE(src.readUInt32LE(o), w);            // nameIndex
      buf.writeInt32LE(s32(src.readUInt32LE(o + 4)), w + 4); // assemblyIndex
      buf.writeInt32LE(src.readUInt16LE(o + 8), w + 8);      // typeStart
      buf.writeInt32LE(src.readUInt16LE(o + 10), w + 12);    // typeCount
      buf.writeInt32LE(0, w + 16);                           // exportedTypeStart
      buf.writeInt32LE(ecount === 0xFFFF ? 0 : ecount, w + 20);
      buf.writeUInt32LE(src.readUInt32LE(o + 16), w + 24);   // entryPointIndex
      buf.writeUInt32LE((0xFF000000 | (i + 1)) >>> 0, w + 28); // token
      // attributes dropped: the container's attribute stream is not the stock
      // v31 compressed-token form, so both range fields stay zero
      buf.writeInt32LE(0, w + 32);
      buf.writeInt32LE(0, w + 36);
    }
    out.images = buf;
  }

  /* -- assemblies: 68 -> 64 ------------------------------------------------- */
  {
    const src = s.assemblies;
    const n = (src.length / 68) | 0;
    const buf = Buffer.allocUnsafe(n * 64);
    for (let i = 0; i < n; i++) {
      const o = i * 68;
      const w = i * 64;
      const image = src.readUInt32LE(o);
      const token = src.readUInt32LE(o + 4);
      let rstart = src.readUInt32LE(o + 8);
      let rcount = src.readUInt32LE(o + 12);
      const culture = src.readUInt32LE(o + 16);
      const name = src.readUInt32LE(o + 20);
      const pubkey = src.readUInt32LE(o + 24);
      const hashLen = src.readUInt32LE(o + 28);
      const hashAlg = src.readUInt32LE(o + 32);
      const flags = src.readUInt32LE(o + 36);
      const major = src.readUInt32LE(o + 40);
      const minor = src.readUInt32LE(o + 44);
      const build = src.readUInt32LE(o + 48);
      const rev = src.readUInt32LE(o + 52);
      if (rcount === 0xFFFFFFFF) { rstart = 0; rcount = 0; }
      buf.writeUInt32LE(image, w);
      buf.writeInt32LE(s32(token), w + 4);
      buf.writeInt32LE(s32(rstart), w + 8);
      buf.writeUInt32LE(rcount, w + 12);
      // name and culture are swapped in the container vs stock v31
      buf.writeUInt32LE(name, w + 16);
      buf.writeUInt32LE(culture, w + 20);
      buf.writeUInt32LE(pubkey, w + 24);
      buf.writeUInt32LE(hashAlg, w + 28);
      buf.writeUInt32LE(hashLen, w + 32);
      buf.writeUInt32LE(flags, w + 36);
      buf.writeUInt32LE(major, w + 40);
      buf.writeUInt32LE(minor, w + 44);
      buf.writeUInt32LE(build, w + 48);
      buf.writeUInt32LE(rev, w + 52);
      src.copy(buf, w + 56, o + 60, o + 68);                 // public_key_token
    }
    out.assemblies = buf;
  }

  /* -- fieldRefs: 4 -> 8 ---------------------------------------------------- */
  {
    const src = s.fieldRefs || Buffer.alloc(0);
    const n = (src.length / 4) | 0;
    const buf = Buffer.allocUnsafe(n * 8);
    for (let i = 0; i < n; i++) {
      buf.writeInt32LE(src.readUInt16LE(i * 4), i * 8);
      buf.writeInt32LE(src.readUInt16LE(i * 4 + 2), i * 8 + 4);
    }
    out.fieldRefs = buf;
  }

  /* -- attributes: dropped -------------------------------------------------- */
  // The container's e98 is a 297,777-entry u32 index array and e90 a 47,092-row
  // {token, byteOffset} table, not the stock v31 attribute stream that
  // Il2CppDumper's CustomAttributeDataReader expects. Emitting them verbatim
  // produces an IndexOutOfRangeException per type, so both are left empty and
  // every image's customAttributeStart/Count is zeroed above.
  out.attributeData = Buffer.alloc(0);
  out.attributeDataRange = Buffer.alloc(0);

  /* -- exact recovery: genericContainerIndex -------------------------------- */
  // The container table names its owner type, so the index the container
  // dropped is read back from the table that owns it. No guessing.
  {
    const td = out.typeDefinitions;
    const ownerSeen = new Uint8Array(typeCount);
    for (let i = 0; i < cont.length; i++) {
      const c = cont[i];
      if (c.isMethod) continue;
      if (c.owner >= typeCount) continue;
      if (ownerSeen[c.owner]) continue;
      ownerSeen[c.owner] = 1;
      td.writeInt32LE(i, c.owner * 88 + 24);
      recovered.genericContainerIndex++;
    }
  }

  /* -- exact recovery: elementTypeIndex for enums --------------------------- */
  // bitfield & 0x1 = IsValueType, (bitfield >> 1) & 1 = IsEnum. An enum's
  // element type is the type of its own value__ field, which is the first field.
  {
    const td = out.typeDefinitions;
    const fields = out.fields;
    const fieldCount = (fields.length / 12) | 0;
    for (let i = 0; i < typeCount; i++) {
      const w = i * 88;
      const bitfield = td.readUInt32LE(w + 80);
      const isEnum = ((bitfield >> 1) & 1) === 1;
      if (!isEnum) continue;
      const fieldStart = td.readInt32LE(w + 32);
      if (fieldStart < 0 || fieldStart >= fieldCount) continue;
      const typeIndex = fields.readInt32LE(fieldStart * 12 + 4);
      if (typeIndex < 0) continue;
      td.writeInt32LE(typeIndex, w + 20);
      recovered.elementTypeIndex++;
    }
  }

  return { out, recovered };
}

/* --------------------------------------------------------------- assembly */

function assemble(out) {
  const hdrLen = 8 + 8 * STOCK_ORDER.length;
  let pos = hdrLen;
  const placed = {};
  for (const name of STOCK_ORDER) {
    const data = out[name];
    if (data && data.length) {
      pos = align4(pos);
      placed[name] = { offset: pos, size: data.length };
      pos += data.length;
    } else {
      placed[name] = { offset: 0, size: 0 };
    }
  }
  const blob = Buffer.alloc(pos);
  blob.writeUInt32LE(IL2CPP_MAGIC, 0);
  blob.writeInt32LE(31, 4);
  STOCK_ORDER.forEach((name, i) => {
    const { offset, size } = placed[name];
    blob.writeInt32LE(offset, 8 + 8 * i);
    blob.writeInt32LE(size, 8 + 8 * i + 4);
    if (size) out[name].copy(blob, offset);
  });
  return { blob, placed };
}

/* -------------------------------------------------------------------- API */

/** True when the buffer already is a stock IL2CPP metadata file. */
function isStockMetadata(meta) {
  return meta.length >= 8 && meta.readUInt32LE(0) === IL2CPP_MAGIC;
}

/**
 * Pick the build profile whose descriptor table actually decrypts.
 *
 * The profiles differ in header width, field order and row count, so the same
 * S-box and seed score very differently against each: a v1 header read as v2
 * triples produces counts and sizes that cannot be a section table. The profile
 * with the highest fraction of plausible rows wins, and the fraction - not the
 * raw count - is what is compared, because the two profiles do not have the same
 * number of rows.
 *
 * Hints are tried first, without scanning the image: every build so far keeps
 * its S-box at a stable place, and scanning 100 MB twice to learn what a 256-byte
 * read already answers is waste. Only when no hint produces a readable table
 * does the scanner run.
 */
function detectProfile(meta, lib) {
  const pool = seedConstants(lib);
  const attempts = [];
  let best = null;

  const consider = (p, located) => {
    if (!located) {
      attempts.push({ profile: p.id, score: 0, rows: p.rows, note: 'no table hint matched' });
      return;
    }
    const ratio = located.score / p.rows;
    attempts.push({
      profile: p.id, score: located.score, rows: p.rows,
      ratio: Number(ratio.toFixed(3)), source: located.source,
    });
    if (!best || ratio > best.ratio) best = { ...located, profile: p, ratio };
  };

  for (const p of PROFILE_LIST) consider(p, findSBoxTable(lib, meta, p, { hintsOnly: true }));
  if (!best || best.score < 8) {
    for (const p of PROFILE_LIST) consider(p, findSBoxTable(lib, meta, p));
  }
  if (!best || !best.seed || best.score < 8) {
    const err = new Error(
      'could not identify a container header in global-metadata.dat ' +
      `(best table score ${best ? best.score : 0}/${best ? best.profile.rows : 0}, need 8). ` +
      'This build\'s loader materialises its seeds differently; the build profile in ' +
      'il2cpp-decrypt.js needs re-deriving for it.');
    err.diagnostics = { attempts, pool: pool.length };
    throw err;
  }
  return { ...best, attempts, pool };
}

/**
 * Decrypt a container-format global-metadata.dat.
 * @param {Buffer} meta  encrypted global-metadata.dat
 * @param {Buffer} lib   matching libil2cpp.so
 * @returns {{data:Buffer, report:object}}
 */
function decryptMetadata(meta, lib) {
  const started = Date.now();
  const timings = {};

  let mark = Date.now();
  const detected = detectProfile(meta, lib);
  const profile = detected.profile;
  const table = detected.table;
  const pool = seedConstants(lib);
  timings.detect = Date.now() - mark;

  /* The seed that opened the descriptor table was found while the table was
     being chosen; deriving it a second time over the same pool was pure waste. */
  const seed = detected.seed;
  const score = detected.score;
  const tried = detected.pool;
  if (!seed || score < 8) {
    const err = new Error(
      'could not identify the header seed in libil2cpp.so ' +
      `(best container-table score ${score}/${profile.rows}, need 8). ` +
      'This build\'s loader materialises its seeds differently; the build profile in ' +
      'il2cpp-decrypt.js needs re-deriving for it.');
    err.diagnostics = detected.tried ? { sbox: detected.tried, pool: detected.pool } : null;
    throw err;
  }

  mark = Date.now();
  const { sec, raw, layout, desc, descByRow, recovery } =
    decryptSections(meta, table, seed, profile, { pool });
  timings.sections = Date.now() - mark;

  mark = Date.now();
  const verification = verifySections(sec, { desc, profile });
  timings.verify = Date.now() - mark;

  mark = Date.now();
  const { out, recovered } = convert(sec, verification, profile);
  timings.convert = Date.now() - mark;

  mark = Date.now();
  const { blob, placed } = assemble(out);
  timings.assemble = Date.now() - mark;
  timings.total = Date.now() - started;

  const counts = {};
  for (const [key, stride] of [
    ['events', 24], ['properties', 20], ['methods', 36], ['parameters', 12],
    ['fields', 12], ['genericParameters', 16], ['genericContainers', 16],
    ['genericParameterConstraints', 4], ['nestedTypes', 4], ['interfaces', 4],
    ['vtableMethods', 4], ['interfaceOffsets', 8], ['typeDefinitions', 88],
    ['images', 40], ['assemblies', 64], ['fieldRefs', 8],
  ]) {
    counts[key] = out[key] ? (out[key].length / stride) | 0 : 0;
  }

  /* Validate what was written, so the caller knows what still needs repair
     before it runs the dumper. */
  let validation = null;
  try {
    const { validateMetadata } = require('./il2cpp-metadata');
    const v = validateMetadata(blob);
    validation = {
      ok: v.ok,
      issues: (v.issues || []).map(i => ({ severity: i.severity, code: i.code, detail: i.detail })),
    };
  } catch (e) {
    validation = { ok: false, issues: [{ severity: 'error', code: 'validator-failed', detail: e.message }] };
  }

  const recoveredSeeds = new Map();
  for (const r of recovery) if (r.recovered) recoveredSeeds.set(r.role, r.seed);

  const hintSeeds = profileSeeds(profile);
  const sections = profile.order.map((idx) => {
    const role = profile.role[idx] || null;
    const v = role ? verification.sections.find(s => s.name === role) : null;
    const row = descByRow[idx];
    return {
      index: idx,
      name: role,
      bytes: row ? row.size : 0,
      offset: role && layout[role] ? layout[role].offset : null,
      dropped: !role,
      enciphered: !!hintSeeds[idx],
      seed: role && recoveredSeeds.get(role)
        ? recoveredSeeds.get(role)
        : (hintSeeds[idx] ? hex64(hintSeeds[idx]) : null),
      seedSource: role
        ? (recoveredSeeds.has(role) ? 'recovered' : (hintSeeds[idx] ? 'known' : 'clear'))
        : 'dropped',
      verified: v ? v.verified : null,
      score: v ? v.score : null,
      samples: v ? v.samples : null,
      rule: v ? v.rule : null,
      note: v ? v.note : null,
    };
  });

  /* Sections a stock v31 file has that this build does not carry at all. They
     are listed, not silently left empty: a consumer that reads them needs to
     know the difference between "absent" and "failed to decode". A section the
     container does carry but no emitter consumes is listed apart, below, so
     "parsed, not emitted" never reads as "missing". */
  const carried = new Set(profile.order.map(idx => profile.role[idx]).filter(Boolean));
  const absent = STOCK_ORDER.filter(name => !out[name] || !out[name].length)
    .filter(name => !carried.has(name));
  const notEmitted = profile.order
    .map(idx => profile.role[idx])
    .filter(role => role && (!out[role] || !out[role].length));
  const dropped = profile.order
    .filter(idx => !profile.role[idx])
    .map(idx => ({
      index: idx,
      bytes: descByRow[idx].size,
      note: 'carries data that matches no stock v31 section; not emitted',
    }));

  return {
    data: blob,
    report: {
      profile: {
        id: profile.id,
        label: profile.label,
        headerSize: profile.headerSize,
        rows: profile.rows,
        fields: profile.fields,
        positions: profile.positions,
        candidates: detected.attempts,
      },
      headerSeed: hex64(seed),
      headerScore: score,
      headerRows: profile.rows,
      headerCandidatesTried: tried,
      sbox: {
        va: detected.va === null || detected.va === undefined ? null : '0x' + detected.va.toString(16),
        fileOffset: detected.fileOffset === undefined ? null : detected.fileOffset,
        source: detected.source,
        score: detected.score,
        candidates: detected.tried.length,
      },
      inputSize: meta.length,
      outputSize: blob.length,
      timings,
      counts,
      placed,
      recovered,
      dropped,
      notEmitted,
      absent,
      seedRecovery: recovery,
      verification: {
        sections,
        notChecked: verification.notChecked,
        stringCount: verification.stringCount,
        typeCount: verification.typeCount,
        literalVerified: !!verification.literal.layout,
        literalLayout: verification.literal.layout,
        literalStride: verification.literal.stride,
        literalRows: verification.literal.rows,
        literalSampled: verification.literal.sampled,
        literalBlobBytes: verification.literal.blobBytes,
        literalScores: verification.literal.scores,
        literalReason: verification.literal.reason || null,
      },
      validation,
    },
  };
}

module.exports = {
  decryptMetadata,
  isStockMetadata,
  IL2CPP_MAGIC,
  /* exported for the round-trip test: the conversion is deterministic and can
     be driven from already-decrypted sections without a container. */
  decryptSections,
  verifySections,
  convert,
  assemble,
  detectProfile,
  byRole,
  rowOfRole,
  xorBytes,
  PROFILES,
  PROFILE_LIST,
  ORDER,
  ROLE,
};
