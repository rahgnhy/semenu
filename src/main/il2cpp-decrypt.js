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
   ========================================================================== */
'use strict';

const MASK32 = 0xFFFFFFFF;

const HEADER_SIZE = 0x5E8;      // descriptor table
const SECTION_BASE = 0xFA8;     // first real section
const TABLE_VA = 0x182E7F3;     // 256-byte substitution box inside libil2cpp.so

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
    segs.push({ vaddr: pVaddr, offset: pOffset, filesz: pFilesz });
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

/* --------------------------------------------------------- seed derivation */

/**
 * Every 64-bit constant the image builds with a movz + movk group.
 * The obfuscator never stores its seeds as data; it materialises each one right
 * before the loop that consumes it. A short gap is tolerated because the header
 * seed's movks are separated from its movz by an adrp/add pair.
 */
function seedConstants(lib) {
  const n = (lib.length / 4) | 0;
  const out = [];
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const w0 = lib.readUInt32LE(i * 4);
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
      const w = lib.readUInt32LE(j * 4);
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

function deriveHeaderSeed(lib, table, meta) {
  let best = null;
  let bestScore = 0;
  for (const seed of seedConstants(lib)) {
    const s = scoreHeader(table, meta, seed);
    if (s > bestScore) { best = seed; bestScore = s; }
  }
  return { seed: best, score: bestScore };
}

/* ------------------------------------------------------------ conversion */

function convert(meta, table, headerSeed) {
  const hdr = xorBytes(meta.subarray(0, HEADER_SIZE), table, headerSeed.lo, headerSeed.hi);
  const desc = [];
  for (let i = 0; i < 126; i++) {
    desc.push({
      offset: hdr.readInt32LE(i * 12),
      count: hdr.readInt32LE(i * 12 + 4),
      size: hdr.readInt32LE(i * 12 + 8),
    });
  }

  // physical position of each real section: sequential tiling from SECTION_BASE
  const layout = {};
  let pos = SECTION_BASE;
  for (const idx of ORDER) {
    pos = align4(pos);
    layout[idx] = { offset: pos, size: desc[idx].size };
    pos += desc[idx].size;
  }

  const sec = {};
  for (const idx of ORDER) {
    const { offset, size } = layout[idx];
    if (offset + size > meta.length) {
      throw new Error(`section e${idx} runs past EOF (${meta.length - offset} of ${size} bytes)`);
    }
    const raw = meta.subarray(offset, offset + size);
    sec[idx] = SEEDS[idx] ? xorBytes(raw, table, SEEDS[idx].lo, SEEDS[idx].hi) : raw;
  }

  const out = {};

  /* -- string literals: u32 offset array over the literal data blob --------- */
  {
    const lit = sec[69];
    const offsets = sec[48];
    const count = (offsets.length / 4) | 0;
    const buf = Buffer.allocUnsafe(count * 8);
    for (let i = 0; i < count; i++) {
      const o = offsets.readUInt32LE(i * 4);
      const end = lit.indexOf(0, o);
      buf.writeInt32LE(end >= 0 ? end - o : 0, i * 8);
      buf.writeInt32LE(o, i * 8 + 4);
    }
    out.stringLiteral = buf;
    out.stringLiteralData = lit;
    out.string = sec[63];
  }

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
      cont.push({ owner });
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
  {
    const src = sec[118];
    const n = (src.length / 66) | 0;
    const buf = Buffer.allocUnsafe(n * 88);
    for (let i = 0; i < n; i++) {
      const o = i * 66;
      const w = i * 88;
      buf.writeUInt32LE(src.readUInt32LE(o), w);            // name
      buf.writeUInt32LE(src.readUInt32LE(o + 4), w + 4);    // namespace
      buf.writeInt32LE(src.readUInt16LE(o + 8), w + 8);     // byvalTypeIndex
      buf.writeInt32LE(neg16(src.readUInt16LE(o + 10)), w + 12);
      buf.writeInt32LE(neg16(src.readUInt16LE(o + 12)), w + 16);
      buf.writeInt32LE(neg16(src.readUInt16LE(o + 14)), w + 20);
      buf.writeInt32LE(-1, w + 24);                         // genericContainerIndex dropped
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

  return { out, layout, desc };
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
  const va2off = buildVa2Off(lib);
  const tableOff = va2off(TABLE_VA);
  if (tableOff + 256 > lib.length) throw new Error('S-box table runs past end of libil2cpp.so');
  const table = lib.subarray(tableOff, tableOff + 256);

  const { seed, score } = deriveHeaderSeed(lib, table, meta);
  if (!seed || score < 8) {
    throw new Error(
      'could not identify the header seed in libil2cpp.so ' +
      `(best container-table score ${score}/126, need 8). ` +
      'This build\'s loader materialises its seeds differently; the section map in ' +
      'il2cpp-decrypt.js needs re-deriving for it.');
  }

  const { out } = convert(meta, table, seed);
  const { blob, placed } = assemble(out);

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

  return {
    data: blob,
    report: {
      headerSeed: (seed.hi * 0x100000000 + seed.lo).toString(16).padStart(16, '0'),
      headerScore: score,
      inputSize: meta.length,
      outputSize: blob.length,
      counts,
      placed,
    },
  };
}

module.exports = { decryptMetadata, isStockMetadata, IL2CPP_MAGIC };
