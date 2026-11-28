/* ============================================================================
   il2cpp-binary.js - minimal reader for a shipped libil2cpp.so / GameAssembly.dll.

   Enough of the loader to answer two questions without Il2CppDumper:
     * what does Il2CppType[n] actually say (type enum, class index)
     * is an address inside an executable segment

   Shipped images store pointer slots as zero and describe them in .rela.dyn, so
   relocations are applied in a copy before anything is read. This mirrors what
   Il2CppDumper prints as "Applying relocations...".
   ========================================================================== */
'use strict';

const EM_ARM = 40;
const EM_AARCH64 = 183;
const EM_X86_64 = 62;
const R_AARCH64_RELATIVE = 1027;
const R_AARCH64_ABS64 = 257;
const R_X86_64_RELATIVE = 8;
const R_X86_64_64 = 1;

const TYPE_NAMES = {
  1: 'VOID', 2: 'BOOLEAN', 3: 'CHAR', 4: 'I1', 5: 'U1', 6: 'I2', 7: 'U2',
  8: 'I4', 9: 'U4', 10: 'I8', 11: 'U8', 12: 'R4', 13: 'R8', 14: 'STRING',
  15: 'PTR', 16: 'BYREF', 17: 'VALUETYPE', 18: 'CLASS', 19: 'VAR', 20: 'ARRAY',
  21: 'GENERICINST', 22: 'TYPEDBYREF',
  /* 0x17 is not used by Il2CppTypeEnum; the numeric values are not contiguous
     from here on. 0x1a is unused too. Labelling 30 as CMOD_OPT made every
     method-level MVAR constraint read as an optional modifier. */
  24: 'I', 25: 'U', 27: 'FNPTR', 28: 'OBJECT', 29: 'SZARRAY', 30: 'MVAR',
  31: 'CMOD_REQD', 32: 'CMOD_OPT', 33: 'INTERNAL',
};

function isElf(buf) {
  return buf.length >= 0x40 && buf.readUInt32LE(0) === 0x464C457F;
}

function isPe(buf) {
  return buf.length >= 0x40 && buf[0] === 0x4D && buf[1] === 0x5A;
}

/**
 * Open a binary for reading.
 * @returns {object} reader with va2off(), readU64(), readIl2CppType(), isExecutable()
 */
function openBinary(buf) {
  if (!isElf(buf)) {
    if (isPe(buf)) {
      throw new Error('GameAssembly.dll (PE) is not supported by this reader; pass libil2cpp.so or use the metadata checks only');
    }
    throw new Error('binary is neither an ELF image nor a PE file');
  }

  const phoff = Number(buf.readBigUInt64LE(0x20));
  const phentsize = buf.readUInt16LE(0x36);
  const phnum = buf.readUInt16LE(0x38);
  const segments = [];
  let dynamic = null;
  for (let i = 0; i < phnum; i++) {
    const at = phoff + i * phentsize;
    if (at + 56 > buf.length) break;
    const type = buf.readUInt32LE(at);
    const offset = Number(buf.readBigUInt64LE(at + 8));
    const vaddr = Number(buf.readBigUInt64LE(at + 16));
    const filesz = Number(buf.readBigUInt64LE(at + 32));
    const memsz = Number(buf.readBigUInt64LE(at + 40));
    const flags = buf.readUInt32LE(at + 4);
    if (type === 1) segments.push({ vaddr, offset, filesz, memsz, exec: (flags & 1) !== 0, write: (flags & 2) !== 0 });
    if (type === 2) dynamic = { offset, filesz };
  }

  function va2off(va) {
    for (const s of segments) {
      if (va >= s.vaddr && va < s.vaddr + s.filesz) return s.offset + (va - s.vaddr);
    }
    throw new Error('address 0x' + va.toString(16) + ' is not backed by any PT_LOAD segment');
  }

  const image = Buffer.from(buf);   // relocations rewrite pointer slots in place

  /* ---- apply relocations ---- */
  let relocationsApplied = 0;
  let relocationsSkipped = 0;
  if (dynamic) {
    let relaOff = 0; let relaSize = 0; let relaEnt = 24;
    let relOff = 0; let relSize = 0; let relEnt = 16;
    let rela = null; let rel = null;
    for (let p = dynamic.offset; p + 16 <= dynamic.offset + dynamic.filesz; p += 16) {
      const tag = Number(image.readBigUInt64LE(p));
      const val = Number(image.readBigUInt64LE(p + 8));
      if (tag === 0) break;
      if (tag === 7) rela = val;        // DT_RELA
      if (tag === 8) relaSize = val;    // DT_RELASZ
      if (tag === 9) relaEnt = val;     // DT_RELAENT
      if (tag === 17) rel = val;        // DT_REL
      if (tag === 18) relSize = val;    // DT_RELSZ
      if (tag === 19) relEnt = val;     // DT_RELENT
    }
    if (rela && relaSize) {
      relaOff = va2off(rela);
      for (let i = 0; i < (relaSize / relaEnt) | 0; i++) {
        const at = relaOff + i * relaEnt;
        if (at + 24 > image.length) break;
        const rOffset = Number(image.readBigUInt64LE(at));
        const rInfo = Number(image.readBigUInt64LE(at + 8));
        const rAddend = Number(image.readBigUInt64LE(at + 16));
        const rType = rInfo & 0xFFFFFFFF;
        const isRelative = rType === R_AARCH64_RELATIVE || rType === R_X86_64_RELATIVE;
        const isAbs = rType === R_AARCH64_ABS64 || rType === R_X86_64_64;
        if (!isRelative && !isAbs) { relocationsSkipped++; continue; }
        let slot;
        try { slot = va2off(rOffset); } catch (e) { relocationsSkipped++; continue; }
        if (slot + 8 > image.length) { relocationsSkipped++; continue; }
        image.writeBigUInt64LE(BigInt(rAddend), slot);
        relocationsApplied++;
      }
    }
    if (rel && relSize) {
      relOff = va2off(rel);
      for (let i = 0; i < (relSize / relEnt) | 0; i++) {
        const at = relOff + i * relEnt;
        if (at + 16 > image.length) break;
        const rOffset = Number(image.readBigUInt64LE(at));
        const rInfo = Number(image.readBigUInt64LE(at + 8));
        const rType = rInfo & 0xFFFFFFFF;
        if (rType !== R_AARCH64_RELATIVE && rType !== R_X86_64_RELATIVE) { relocationsSkipped++; continue; }
        let slot;
        try { slot = va2off(rOffset); } catch (e) { relocationsSkipped++; continue; }
        if (slot + 8 > image.length) { relocationsSkipped++; continue; }
        image.writeBigUInt64LE(BigInt(rOffset), slot);
        relocationsApplied++;
      }
    }
  }

  const readU64 = (va) => Number(image.readBigUInt64LE(va2off(va)));
  const readU32 = (va) => image.readUInt32LE(va2off(va));

  /**
   * Il2CppType on 64-bit is 8 bytes of data plus one packed 32-bit word:
   *   attrs:16 (bytes 8-9) | type:8 (byte 10) | num_mods:5, byref:1, pinned:1 (byte 11)
   */
  function readIl2CppTypeAt(va) {
    const o = va2off(va);
    const packed = image.readUInt32LE(o + 8);
    return {
      address: va,
      data: Number(image.readBigUInt64LE(o)),
      attrs: packed & 0xFFFF,
      type: (packed >>> 16) & 0xFF,
      typeName: TYPE_NAMES[(packed >>> 16) & 0xFF] || ('UNKNOWN_' + ((packed >>> 16) & 0xFF)),
      numMods: (packed >>> 24) & 0x1F,
      byref: (packed >>> 29) & 1,
      pinned: (packed >>> 30) & 1,
    };
  }

  function isExecutable(va) {
    return segments.some(s => s.exec && va >= s.vaddr && va < s.vaddr + s.memsz);
  }

  const executableRanges = segments
    .filter(s => s.exec)
    .map(s => ({ start: s.vaddr, end: s.vaddr + s.memsz }));

  /**
   * Locate the Il2CppType*[] table inside an Il2CppMetadataRegistration.
   *
   * The struct layout has changed between versions, so nothing is assumed about
   * offsets: every (count, pointer) pair in the first 24 slots is tried and the
   * first one whose samples all decode as real Il2CppType records wins. A count
   * of 61k with a pointer into .data proves nothing on its own - the type byte
   * of the records it points at does.
   *
   * @param {number} registrationVa address of the Il2CppMetadataRegistration
   * @param {{samples?:number}} [opts]
   * @returns {{count:number, pointer:number, slot:number, validated:number, types:string[]}}
   */
  function findTypeTable(registrationVa, opts) {
    const o = opts || {};
    const samples = o.samples || 64;
    const base = va2off(registrationVa);
    const slots = [];
    for (let i = 0; i < 24; i++) {
      const at = base + i * 8;
      if (at + 8 > image.length) break;
      slots.push(Number(image.readBigUInt64LE(at)));
    }

    const attempts = [];
    for (let i = 0; i + 1 < slots.length; i += 2) {
      const count = slots[i];
      const pointer = slots[i + 1];
      if (!Number.isInteger(count) || count < 64 || count > 4_000_000) continue;
      if (!pointer) continue;
      let arr;
      try { arr = va2off(pointer); } catch (e) { continue; }
      if (arr + Math.min(count, 16) * 8 > image.length) continue;

      /* every sampled entry must point at a record whose packed type byte is a
         real Il2CppType enum value */
      const step = Math.max(1, Math.floor(count / samples));
      let checked = 0;
      let valid = 0;
      const seen = [];
      for (let k = 0; k < count && checked < samples; k += step, checked++) {
        let ptr;
        try { ptr = Number(image.readBigUInt64LE(arr + k * 8)); } catch (e) { break; }
        if (!ptr) continue;
        let rec;
        try { rec = readIl2CppTypeAt(ptr); } catch (e) { continue; }
        if (rec.type >= 1 && rec.type <= 31) { valid++; if (seen.length < 8) seen.push(rec.typeName); }
      }
      attempts.push({ slot: i * 8, count, pointer, checked, valid });
      if (checked >= 8 && valid === checked) {
        return { count, pointer, slot: i * 8, validated: valid, types: seen, attempts };
      }
    }

    const best = attempts.slice().sort((a, b) => (b.valid / Math.max(b.checked, 1)) - (a.valid / Math.max(a.checked, 1)))[0];
    return {
      count: 0,
      pointer: 0,
      slot: best ? best.slot : -1,
      validated: best ? best.valid : 0,
      types: [],
      attempts,
      error: 'no (count, pointer) pair in the registration decoded as an Il2CppType table',
    };
  }

  return {
    image,
    segments,
    executableRanges,
    relocationsApplied,
    relocationsSkipped,
    va2off,
    readU64,
    readU32,
    readIl2CppTypeAt,
    isExecutable,
    findTypeTable,
    /** Build a reader over the binary's Il2CppType*[] table. */
    typeTable(count, pointerArrayVa) {
      const arr = va2off(pointerArrayVa);
      const cache = new Map();
      return {
        count,
        pointerAt(i) {
          if (i < 0 || i >= count) throw new Error(`Il2CppType index ${i} is outside 0..${count}`);
          return Number(image.readBigUInt64LE(arr + i * 8));
        },
        get(i) {
          if (cache.has(i)) return cache.get(i);
          const t = readIl2CppTypeAt(this.pointerAt(i));
          cache.set(i, t);
          return t;
        },
      };
    },
  };
}

module.exports = { openBinary, isElf, isPe, TYPE_NAMES };
