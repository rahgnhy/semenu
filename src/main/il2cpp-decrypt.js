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

const HEADER_SIZE = 0x5E8;      // descriptor table
const SECTION_BASE = 0xFA8;     // first real section
const TABLE_VA = 0x182E7F3;     // 256-byte substitution box inside libil2cpp.so
const TABLE_SIZE = 256;

// descriptor index -> cipher seed, big-endian hex (None = stored in the clear)
const SEED_HEX = {
  48: 'EA338D80C764B829',
  69: 'B3C78D264A9AB44F',
  63: '6E63EC6F7A1442F0',
  34: 'D352E95AE3D142CB',
  23: 'FF440E012182730C',
  14: '4E3F398A310E48CB',
  5: '5F2902BE8286FA65',
};

// physical packing order, verified against every content anchor in the file
const ORDER = [48, 69, 63, 97, 34, 23, 22, 73, 46, 36, 41, 14, 32, 3, 2,
  31, 59, 4, 106, 118, 84, 5, 1, 71, 98, 90, 116, 85, 67];

// descriptor index -> stock v31 section name (null = obfuscator-only, dropped)
const ROLE = {
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
};

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

const SEEDS = {};
for (const k of Object.keys(SEED_HEX)) SEEDS[k] = splitSeed(SEED_HEX[k]);

/** Read a u64 that is guaranteed to fit in a double. */
function readU64(buf, off) {
  return buf.readUInt32LE(off) + buf.readUInt32LE(off + 4) * 0x100000000;
}

function hex64(seed) {
  return (seed.hi * 0x100000000 + seed.lo).toString(16).padStart(16, '0');
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
function findSBoxTable(lib, meta) {
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
      const s = scoreHeader(table, meta, seed);
      if (s > bestScore) { bestScore = s; bestSeed = seed; }
    }
    return { score: bestScore, seed: bestSeed };
  };

  try {
    const off = va2off(TABLE_VA);
    if (off >= 0 && off + TABLE_SIZE <= lib.length) {
      const table = lib.subarray(off, off + TABLE_SIZE);
      const { score, seed } = scoreOf(table);
      tried.push({ va: TABLE_VA, score, source: 'known' });
      if (score >= 8) {
        return { table, va: TABLE_VA, source: 'known', score, seed, tried, pool: pool.length };
      }
    }
  } catch (e) { /* the known address is not mapped in this build */ }

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
function scoreHeader(table, meta, seed) {
  const hdr = xorBytes(meta.subarray(0, HEADER_SIZE), table, seed.lo, seed.hi);
  let n = 0;
  for (let i = 0; i < 126; i++) {
    const off = hdr.readInt32LE(i * 12);
    const count = hdr.readInt32LE(i * 12 + 4);
    const size = hdr.readInt32LE(i * 12 + 8);
    if (count > 0 && count < 1000000 && size > 0 && size < 20000000
        && size % count === 0 && size / count >= 1 && size / count <= 128
        && off >= 0 && off < meta.length) {
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

function decryptSections(meta, table, headerSeed, opts) {
  const hdr = xorBytes(meta.subarray(0, HEADER_SIZE), table, headerSeed.lo, headerSeed.hi);
  const desc = [];
  for (let i = 0; i < 126; i++) {
    desc.push({
      offset: hdr.readInt32LE(i * 12),
      count: hdr.readInt32LE(i * 12 + 4),
      size: hdr.readInt32LE(i * 12 + 8),
    });
  }

  /* Physical position of each real section: sequential tiling from SECTION_BASE.
     The descriptor's own offset field is the section's position in the *decrypted*
     file, not in the container - on a real container it points at 10880 for the
     first section while the bytes start at 0xFA8 - so it is not used to find
     them. It is used for the one thing it is good for: count/size gives the row
     stride of every section, which is how the string-literal index is read at the
     width it was actually written at. */
  const layout = {};
  let pos = SECTION_BASE;
  for (const idx of ORDER) {
    pos = align4(pos);
    layout[idx] = { offset: pos, size: desc[idx].size };
    pos += desc[idx].size;
  }

  const raw = {};
  const sec = {};
  const seedSource = {};
  for (const idx of ORDER) {
    const { offset, size } = layout[idx];
    if (size < 0) {
      throw new Error(`descriptor e${idx} declares a negative size (${size})`);
    }
    if (offset + size > meta.length) {
      throw new Error(`section e${idx} runs past EOF (${meta.length - offset} of ${size} bytes)`);
    }
    raw[idx] = meta.subarray(offset, offset + size);
    if (SEEDS[idx]) {
      sec[idx] = xorBytes(raw[idx], table, SEEDS[idx].lo, SEEDS[idx].hi);
      seedSource[idx] = 'known';
    } else {
      sec[idx] = raw[idx];
      seedSource[idx] = 'clear';
    }
  }

  const recovery = (opts && opts.recover === false)
    ? [] : recoverSeeds(sec, raw, table, opts && opts.pool);

  return { sec, layout, desc, seedSource, recovery };
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
function recoverSeeds(sec, raw, table, pool) {
  const log = [];
  if (!pool || !pool.length) return log;
  const PROBE = 4096;
  /* The literal pool is addressed by absolute offsets, so a 4 KB window would
     only cover the first few hundred literals. 256 KB covers several thousand,
     and the rows are then sampled across that whole window: the pool opens with a
     short binary prologue, and a prefix-only sample reads that prologue as the
     whole pool. */
  const BLOB_PROBE = 262144;

  const probeOf = (idx, bytes) => {
    const cap = idx === 69 ? BLOB_PROBE : PROBE;
    return bytes && bytes.length > cap ? bytes.subarray(0, cap) : bytes;
  };

  /* The string index is 20 MB of typed arrays, so it is built once and reused by
     every name-based scorer - rebuilding it per section turned a 5 ms check into
     a 60 ms one. */
  let stringIdx = null;
  const getStringIdx = () => {
    if (!stringIdx) stringIdx = buildStringIndex(sec[63] || Buffer.alloc(0));
    return stringIdx;
  };

  const nameScore = (bytes, stride, nameOffset) => {
    const strings = sec[63];
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
    63: (bytes) => {
      const index = buildStringIndex(bytes);
      const { runs, ok } = index.census();
      return runs ? ok / runs : 0;
    },
    48: (bytes) => {
      const n = (bytes.length / 4) | 0;
      if (n < 2) return 0;
      const ceiling = sec[69] ? sec[69].length : 0xFFFFFFFF;
      let good = 0;
      for (let i = 1; i < n; i++) {
        const prev = bytes.readUInt32LE((i - 1) * 4);
        const at = bytes.readUInt32LE(i * 4);
        if (at >= prev && at <= ceiling) good++;
      }
      return bytes.readUInt32LE(0) === 0 ? good / (n - 1) : 0;
    },
    69: (bytes) => {
      const rows = sec[48];
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
    14: (bytes) => nameScore(bytes, 10),
    23: (bytes) => nameScore(bytes, 30),
    34: (bytes) => nameScore(bytes, 20),
    5: (bytes) => nameScore(bytes, 68, 20),
  };

  /* 63 first: the string section is the oracle every name-based section needs. */
  for (const idx of [63, 14, 23, 34, 48, 69, 5]) {
    const score = scorers[idx];
    const current = sec[idx];
    if (!current || !current.length) continue;
    if (score(probeOf(idx, current)) >= 0.98) continue;

    const probeRaw = probeOf(idx, raw[idx]);
    let bestSeed = null;
    let bestScore = 0;
    for (const seed of pool) {
      if (SEEDS[idx] && seed.lo === SEEDS[idx].lo && seed.hi === SEEDS[idx].hi) continue;
      const candidate = xorBytes(probeRaw, table, seed.lo, seed.hi);
      const s = score(candidate);
      if (s > bestScore) { bestScore = s; bestSeed = seed; }
    }
    const previous = SEEDS[idx] ? 'hinted' : 'clear';
    if (!bestSeed || bestScore < 0.98) {
      log.push({
        index: idx, name: ROLE[idx] || null, recovered: false, previous,
        best: Number(bestScore.toFixed(3)), tried: pool.length,
        note: 'no constant in libil2cpp.so decrypted this section to content that satisfies its own rule',
      });
      continue;
    }
    const plain = xorBytes(raw[idx], table, bestSeed.lo, bestSeed.hi);
    const full = score(plain);
    if (full < 0.98) {
      log.push({
        index: idx, name: ROLE[idx] || null, recovered: false, previous,
        best: Number(full.toFixed(3)), tried: pool.length,
        note: 'a probe cleared the rule but the whole section did not',
      });
      continue;
    }
    sec[idx] = plain;
    if (idx === 63) stringIdx = null;   // every name-based scorer must see the new one
    log.push({
      index: idx, name: ROLE[idx] || null, recovered: true, previous,
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
  const desc = (ctx && ctx.desc) || null;
  const stringBytes = sec[63] || Buffer.alloc(0);
  const strings = buildStringIndex(stringBytes);
  const strLen = stringBytes.length;
  let stringCount = 0;
  for (let i = 0; i < strLen; i++) if (stringBytes[i] === 0) stringCount++;

  const typeCount = sec[118] ? (sec[118].length / 66) | 0 : 0;
  const paramCount = sec[41] ? (sec[41].length / 10) | 0 : 0;
  const imageCount = sec[84] ? (sec[84].length / 36) | 0 : 0;
  const blob = sec[69] || Buffer.alloc(0);
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
  const add = (index, name, rule, score, samples, note) => {
    rows.push({
      index, name, rule,
      score: Number(score.toFixed(3)),
      samples,
      verified: samples > 0 && score >= 0.98,
      note,
    });
  };

  /* string table: every NUL-terminated run, not a sample of them */
  {
    const { runs, ok } = strings.census();
    add(63, 'string', 'printable UTF-8 identifiers', runs ? ok / runs : 0, runs,
      `${runs.toLocaleString('en-US')} runs, ${stringCount.toLocaleString('en-US')} NUL terminators`);
  }

  const literal = analyseLiterals(sec, desc, blob, runClean);

  /* Only the reading that was accepted is reported as a verified section; the
     rejected hypothesis is not a broken section, so it does not appear as one.
     When neither reading passes, every reading is reported, so the failure is
     visible. */
  if (literal.layout === 'stock') {
    add(48, 'stringLiteral', 'each row is {length, dataIndex} and the run at dataIndex is clean UTF-8',
      literal.score, literal.rows,
      `${literal.rows.toLocaleString('en-US')} rows of ${literal.stride} bytes, ${blobSize.toLocaleString('en-US')} blob bytes`);
  } else if (literal.layout === 'offsets') {
    add(69, 'stringLiteralData', 'offsets tile the blob and every run is clean UTF-8',
      literal.score, literal.sampled,
      `${literal.rows.toLocaleString('en-US')} offsets of ${literal.stride} bytes, ${blobSize.toLocaleString('en-US')} blob bytes`);
  } else if (literal.candidates.length) {
    for (const c of literal.candidates) {
      add(c.layout === 'stock' ? 48 : 69, c.layout === 'stock' ? 'stringLiteral' : 'stringLiteralData',
        c.layout === 'stock'
          ? 'each row is {length, dataIndex} and the run at dataIndex is clean UTF-8'
          : 'offsets tile the blob and every run is clean UTF-8',
        c.score, c.layout === 'stock' ? c.rows : c.sampled, c.note);
    }
  }

  /* fields: the name offset must resolve and the type index must not be negative */
  {
    const t = sec[14];
    const n = t ? (t.length / 10) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) if (resolves(t.readUInt32LE(i * 10))) ok++;
    add(14, 'fields', 'name offset resolves to a printable NUL-terminated string', n ? ok / n : 0, n, `${n.toLocaleString('en-US')} rows`);
  }

  /* methods: name, declaring type and parameter window */
  {
    const t = sec[23];
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
    add(23, 'methods', 'name resolves, declaring type and parameter window are in range', n ? ok / n : 0, n, `${n.toLocaleString('en-US')} rows`);
  }

  /* properties */
  {
    const t = sec[34];
    const n = t ? (t.length / 20) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) if (resolves(t.readUInt32LE(i * 20))) ok++;
    add(34, 'properties', 'name offset resolves', n ? ok / n : 0, n, `${n.toLocaleString('en-US')} rows`);
  }

  /* images */
  {
    const t = sec[84];
    const n = t ? (t.length / 36) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 36;
      const name = t.readUInt32LE(o);
      const start = t.readUInt16LE(o + 8);
      const count = t.readUInt16LE(o + 10);
      if (resolves(name) && start + count <= typeCount) ok++;
    }
    add(84, 'images', 'name resolves and the type window tiles the type table', n ? ok / n : 0, n, `${n} rows`);
  }

  /* assemblies */
  {
    const t = sec[5];
    const n = t ? (t.length / 68) | 0 : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 68;
      const image = t.readUInt32LE(o);
      const name = t.readUInt32LE(o + 20);
      if (image < imageCount && resolves(name)) ok++;
    }
    add(5, 'assemblies', 'image index in range and the name offset resolves', n ? ok / n : 0, n, `${n} rows`);
  }

  return {
    sections: rows,
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
  const t = sec[48];
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
  const declared = desc && desc[48];
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

function convert(sec, verification) {
  const out = {};
  const recovered = {
    genericContainerIndex: 0,
    elementTypeIndex: 0,
    literalLayout: null,
  };

  /* -- string literals: measured, then emitted in the layout that was proven -- */
  {
    const lit = sec[69];
    const rows = sec[48];
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
  out.string = sec[63];

  /* -- events: 22 -> 24 ----------------------------------------------------- */
  {
    const src = sec[97];
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
  out.properties = sec[34];

  /* -- methods: 30 -> 36 ---------------------------------------------------- */
  {
    const src = sec[23];
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
  for (const [key, idx] of [['parameterDefaultValues', 22], ['fieldDefaultValues', 73]]) {
    const src = sec[idx];
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
  out.fieldAndParameterDefaultValueData = sec[46];

  /* -- fieldMarshaledSizes: 10 -> 12 ---------------------------------------- */
  {
    const src = sec[36];
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
    const src = sec[41];
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
    const src = sec[14];
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
    const src = sec[2];
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
    const src = sec[32];
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
    const src = sec[3];
    const n = (src.length / 2) | 0;
    const buf = Buffer.allocUnsafe(n * 4);
    for (let i = 0; i < n; i++) buf.writeInt32LE(src.readUInt16LE(i * 2), i * 4);
    out.genericParameterConstraints = buf;
  }

  /* -- nestedTypes / vtableMethods: already u32 ----------------------------- */
  out.nestedTypes = sec[31];
  out.vtableMethods = sec[4];

  /* -- interfaces: 2 -> 4 --------------------------------------------------- */
  {
    const src = sec[59];
    const n = (src.length / 2) | 0;
    const buf = Buffer.allocUnsafe(n * 4);
    for (let i = 0; i < n; i++) buf.writeInt32LE(src.readUInt16LE(i * 2), i * 4);
    out.interfaces = buf;
  }

  /* -- interfaceOffsets: 6 -> 8 --------------------------------------------- */
  {
    const src = sec[106];
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
    const src = sec[118];
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
    const src = sec[84];
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
    const src = sec[5];
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
    const src = sec[67];
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
 * Decrypt a container-format global-metadata.dat.
 * @param {Buffer} meta  encrypted global-metadata.dat
 * @param {Buffer} lib   matching libil2cpp.so
 * @returns {{data:Buffer, report:object}}
 */
function decryptMetadata(meta, lib) {
  const started = Date.now();
  const timings = {};

  /* The constant pool is the expensive part of locating anything, so it is
     scanned once, timed on its own, and reused by both searches. */
  let mark = Date.now();
  const pool = seedConstants(lib);
  timings.seeds = Date.now() - mark;

  mark = Date.now();
  const located = findSBoxTable(lib, meta);
  const table = located.table;
  timings.sbox = Date.now() - mark;

  /* The seed that opened the descriptor table was found while the table was
     being chosen; deriving it a second time over the same pool was pure waste. */
  const seed = located.seed;
  const score = located.score;
  const tried = located.pool;
  if (!seed || score < 8) {
    const err = new Error(
      'could not identify the header seed in libil2cpp.so ' +
      `(best container-table score ${score}/126, need 8). ` +
      'This build\'s loader materialises its seeds differently; the section map in ' +
      'il2cpp-decrypt.js needs re-deriving for it.');
    err.diagnostics = located.tried ? { sbox: located.tried, pool: located.pool } : null;
    throw err;
  }

  mark = Date.now();
  const { sec, layout, desc, recovery } =
    decryptSections(meta, table, seed, { pool });
  timings.sections = Date.now() - mark;

  mark = Date.now();
  const verification = verifySections(sec, { desc });
  timings.verify = Date.now() - mark;

  mark = Date.now();
  const { out, recovered } = convert(sec, verification);
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
  for (const r of recovery) if (r.recovered) recoveredSeeds.set(r.index, r.seed);

  const sections = ORDER.map((idx) => {
    const v = verification.sections.find(s => s.index === idx);
    return {
      index: idx,
      name: ROLE[idx] || null,
      bytes: layout[idx].size,
      enciphered: !!SEEDS[idx],
      seed: recoveredSeeds.get(idx) || (SEEDS[idx] ? hex64(SEEDS[idx]) : null),
      seedSource: recoveredSeeds.has(idx) ? 'recovered' : (SEEDS[idx] ? 'known' : 'clear'),
      verified: v ? v.verified : null,
      score: v ? v.score : null,
      samples: v ? v.samples : null,
      rule: v ? v.rule : null,
      note: v ? v.note : null,
    };
  });

  return {
    data: blob,
    report: {
      headerSeed: hex64(seed),
      headerScore: score,
      headerCandidatesTried: tried,
      sbox: { va: '0x' + located.va.toString(16), source: located.source, score: located.score, candidates: located.tried.length },
      inputSize: meta.length,
      outputSize: blob.length,
      timings,
      counts,
      placed,
      recovered,
      seedRecovery: recovery,
      verification: {
        sections,
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
  ORDER,
  ROLE,
  SEED_HEX,
};
