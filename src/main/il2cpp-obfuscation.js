/* ============================================================================
   il2cpp-obfuscation.js - decide whether a dump is actually obfuscated, say what
   each type is for, and propose names for the ones that are machine-named.

   Three judgements, deliberately kept apart:

   1. Corpus verdict. Obfuscation is a property of the whole assembly, not of a
      single name. A type called "Id" is not evidence of anything; 400 types
      called "a", "b", "aa" and "ab" are. The verdict is built from counts over
      every name in the dump, each compared against what a normal Unity/BCL
      assembly produces, and every number is reported so the verdict can be
      checked rather than trusted.

   2. Per-type suspicion. Scored for every type, always, never gated on the
      corpus verdict. A clean corpus with one machine-shaped type still has one
      machine-shaped type, and it should be visible.

   3. Role inference. Independent of naming, what does this type do? Base class,
      interfaces, field types, method names and Unity lifecycle methods are
      enough to label most behaviours, and the label always carries its evidence.
      A second pass pushes those labels across the field-type graph, so a type
      that is only ever held by a Player is not left unclassified.

   Nothing here rewrites a name. Suggestions exist only for types that are
   already flagged, they carry the evidence that produced them, and their
   confidence is below 1.0 by construction. Suggested names are de-duplicated
   before they leave this module: two different obfuscated types must never be
   handed the same replacement. A rename map is written next to the report for a
   human to review; the dump itself is never touched.
   ========================================================================== */
'use strict';

const { fqName } = require('./il2cpp-dump-index');

/* --------------------------------------------------------------- shape tests */

const ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/;
/* Compiler-generated names legitimately look like <>c, <Module>, <Wait>d__32,
   __StaticArrayInitTypeSize=120 and <<Read>g__Local|44_0>d. Roslyn emits all of
   these in un-obfuscated assemblies, so they are not evidence of anything. */
const IDENT = /^[\p{L}_<$][\p{L}\p{N}_`<>$.=|]*$/u;
const NON_ASCII = /[^\x20-\x7E]/;
const CONSONANTS = /^[bcdfghjklmnpqrstvwxz]+$/i;
const REPEAT_RUN = /(.)\1{3,}/;
const LONG_DIGITS = /\d{4,}/;
const LETTER_DIGIT = /^[A-Za-z]\d$/;
const DIGITS_ONLY = /^\d+$/;
const VOWEL = /[aeiouy]/i;

/* Names a toolchain emits, not names an obfuscator invents. Every Unity IL2CPP
   build carries these: Burst mangles its entry points deterministically, Roslyn
   emits closure classes and anonymous types, and the runtime emits fixed-buffer
   and shared-generic shells. They look machine-made because they are, and they
   are still not evidence of obfuscation. Matching one zeroes the score. */
const COMPILER_GENERATED = new RegExp([
  '\\$PostfixBurstDelegate$',
  '\\$BurstDirectCall$',
  '\\$BurstCompiler',
  '__StaticArrayInitTypeSize=',
  '^<PrivateImplementationDetails>',
  '^<Module>$',
  '^<>[cf]',
  '>c__DisplayClass',
  '>d__\\d+$',
  '__Il2CppFullySharedGenericType',
  '^__' + 'FIXED_BUFFER',
].join('|'));

function isCompilerGenerated(leaf) {
  if (!leaf) return false;
  if (leaf.includes('$PostfixBurstDelegate') || leaf.includes('$BurstDirectCall')) return true;
  if (leaf.startsWith('<>') || leaf.startsWith('<PrivateImplementationDetails>')) return true;
  if (/__StaticArrayInitTypeSize=/.test(leaf)) return true;
  if (/^<[A-Za-z_][A-Za-z0-9_]*>/.test(leaf)) return true;   // Roslyn backing types
  return COMPILER_GENERATED.test(leaf);
}

/** Unicode block of a non-ASCII character, coarse enough to catch homoglyphs. */
function scriptOf(cp) {
  if (cp < 0x80) return 'ascii';
  if (cp >= 0x00C0 && cp <= 0x024F) return 'latin';
  if (cp >= 0x0370 && cp <= 0x03FF) return 'greek';
  if (cp >= 0x0400 && cp <= 0x04FF) return 'cyrillic';
  if (cp >= 0x0530 && cp <= 0x058F) return 'armenian';
  if (cp >= 0x0590 && cp <= 0x05FF) return 'hebrew';
  if (cp >= 0x0600 && cp <= 0x06FF) return 'arabic';
  if (cp >= 0x3040 && cp <= 0x30FF) return 'kana';
  if (cp >= 0x4E00 && cp <= 0x9FFF) return 'han';
  if (cp >= 0xAC00 && cp <= 0xD7AF) return 'hangul';
  return 'other';
}

/** Scripts present in a name, ignoring ASCII. */
const NO_SCRIPTS = new Set();

function scriptsIn(name) {
  /* Every name in a normal dump is ASCII; allocating a Set for each of 18,299
     types to discover that is pure waste. Scan for the first non-ASCII byte and
     return the shared empty set when there is none. */
  let nonAscii = false;
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) > 0x7F) { nonAscii = true; break; }
  }
  if (!nonAscii) return NO_SCRIPTS;

  const set = new Set();
  for (const ch of name) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) continue;
    const s = scriptOf(cp);
    if (s !== 'ascii') set.add(s);
  }
  return set;
}

/* Shannon entropy over a reused 128-slot counter. Every identifier in an IL2CPP
   dump is ASCII, so a fixed table beats allocating a Map per name; the touched
   list keeps the reset cost proportional to distinct characters, not 128. */
const ENTROPY_SLOTS = new Uint16Array(256);
const ENTROPY_TOUCHED = new Uint16Array(64);

function entropy(name) {
  if (!name.length) return 0;
  let touched = 0;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i) & 0xFF;
    if (ENTROPY_SLOTS[c] === 0) ENTROPY_TOUCHED[touched++] = c;
    ENTROPY_SLOTS[c]++;
  }
  let h = 0;
  for (let i = 0; i < touched; i++) {
    const c = ENTROPY_TOUCHED[i];
    const p = ENTROPY_SLOTS[c] / name.length;
    h -= p * Math.log2(p);
    ENTROPY_SLOTS[c] = 0;
  }
  return h;
}

/** Leaf name without its generic argument list or backtick arity.
 *
 *  dump.cs writes a generic type's parameters inline ("ValueTuple<T1, T2>"), and
 *  the argument list can itself contain '<' for anonymous types
 *  ("<>f__AnonymousType1<<url>j__TPar>"). The trailing balanced list is syntax,
 *  not name: leaving it in makes every multi-parameter generic look like an
 *  illegal identifier to the shape scorer. */
function leafOf(name) {
  let leaf = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;
  leaf = leaf.replace(/`\d+$/, '');
  if (leaf.endsWith('>')) {
    let depth = 0;
    for (let i = leaf.length - 1; i >= 0; i--) {
      if (leaf[i] === '>') depth++;
      else if (leaf[i] === '<') {
        depth--;
        if (depth === 0) { if (i > 0) leaf = leaf.slice(0, i); break; }
      }
    }
  }
  return leaf;
}

/**
 * Per-name shape score. Only ever used to rank names for a human, never to
 * decide the corpus verdict on its own.
 * @returns {{score:number, reasons:string[]}}
 */
function suspicion(name) {
  const reasons = [];
  let score = 0;
  if (!name) return { score: 0, reasons };
  const leaf = leafOf(name);

  /* A toolchain name is not an obfuscated name. Saying so explicitly beats
     silently scoring it low, because the reason is then visible in the report. */
  if (isCompilerGenerated(leaf)) {
    return { score: 0, reasons: ['compiler-generated name shape, not evidence of obfuscation'], compilerGenerated: true };
  }

  if (!IDENT.test(leaf)) { score += 0.7; reasons.push('not a legal C# identifier'); }
  if (ZERO_WIDTH.test(name)) { score += 0.7; reasons.push('zero-width or bidi control character'); }
  if (NON_ASCII.test(name)) { score += 0.5; reasons.push('non-ASCII character'); }
  if (scriptsIn(name).size > 1) { score += 0.4; reasons.push('mixes scripts'); }
  if (leaf.length === 1) { score += 0.4; reasons.push('single character'); }
  else if (leaf.length === 2) { score += 0.15; reasons.push('two characters'); }
  if (LETTER_DIGIT.test(leaf)) { score += 0.35; reasons.push('letter plus digit'); }
  if (DIGITS_ONLY.test(leaf)) { score += 0.6; reasons.push('digits only'); }
  /* Acronyms and CamelCase names are vowel-poor by design (WMRHMD, SqlXml,
     XRNode). Only an all-lowercase consonant run is letter soup. */
  if (leaf.length >= 4 && CONSONANTS.test(leaf) && leaf === leaf.toLowerCase()) {
    score += 0.45; reasons.push('lowercase name with no vowel');
  }
  if (REPEAT_RUN.test(leaf)) { score += 0.2; reasons.push('repeated character run'); }
  if (LONG_DIGITS.test(leaf)) { score += 0.2; reasons.push('long digit run'); }

  return { score: Math.min(Number(score.toFixed(2)), 1), reasons };
}

/* -------------------------------------------------------------- corpus scan */

/** Namespaces whose contents are engine or framework code, not the game. */
const FRAMEWORK_NS = /^(System|Microsoft|Mono|Unity|UnityEngine|Newtonsoft|Fusion|PlayFab|Oculus|TMPro|JetBrains|nunit|AOT|Il2Cpp|Interop|Internal|LibCpp2IL|Arm|Samsung|Google|Firebase|Amazon|RestSharp|Cysharp|MessagePack|NAudio|NLayer)/;

/** Assemblies that ship with the engine, the BCL or a third-party SDK. */
const FRAMEWORK_ASSEMBLY = /^(mscorlib|netstandard|System|Microsoft|Mono|Unity|UnityEngine|Newtonsoft|PlayFab|Fusion|Photon|Oculus|TMPro|JetBrains|nunit|AOT|Il2Cpp|Interop|Internal|LibCpp2IL|Arm|Samsung|Google|Firebase|Amazon|RestSharp|Cysharp|MessagePack|NAudio|NLayer|LIV|__Generated)/i;

function isFramework(type) {
  return FRAMEWORK_NS.test(type.namespace || '');
}

/**
 * Which assembly each type came from, as a dense array.
 *
 * Namespaces are not enough to tell game code from framework code: dump.cs
 * writes nested types with their outer prefix and an empty namespace, so 6,531
 * of the 18,299 types here look namespace-less whether they are BCL or the
 * game's own. The image table is exact - it comes from the metadata itself - so
 * every "is this the game's code" question is answered from it instead.
 */
function imageIndex(index) {
  const types = index.types || [];
  const images = (index.images || []).slice().sort((a, b) => a.typeStart - b.typeStart);
  const owner = new Array(types.length).fill(null);
  for (let i = 0; i < images.length; i++) {
    const from = images[i].typeStart;
    const to = i + 1 < images.length ? images[i + 1].typeStart : types.length;
    const name = images[i].name || '';
    for (let t = from; t < to && t < types.length; t++) owner[t] = name;
  }
  return owner;
}

/** True when the type belongs to a game assembly rather than an engine/SDK one. */
function isGameType(owner, i) {
  const name = owner[i];
  if (!name) return false;
  return !FRAMEWORK_ASSEMBLY.test(name);
}

/** Generic arity: backtick form in metadata ("Dictionary`2"), inline list in
 *  dump.cs ("Dictionary<TKey, TValue>"). */
function arityOf(name) {
  const m = /`(\d+)$/.exec(name);
  if (m) return Number(m[1]);
  if (!name.endsWith('>')) return 0;
  let depth = 0;
  for (let i = name.length - 1; i >= 0; i--) {
    if (name[i] === '>') depth++;
    else if (name[i] === '<') {
      depth--;
      if (depth === 0) {
        if (i === 0) return 0;               // "<Module>" is a name, not a list
        const args = name.slice(i + 1, -1).trim();
        return args ? args.split(',').length : 0;
      }
    }
  }
  return 0;
}

/**
 * Every name-shape measurement, in one pass and without building leaf arrays.
 * Each counter is a fact about the corpus; nothing here decides anything.
 */
function nameStats(index) {
  const types = index.types || [];
  const methods = index.methods || [];
  const fields = index.fields || [];

  const s = {
    types: types.length,
    methods: methods.length,
    fields: fields.length,
    nonAsciiTypes: 0,
    nonAsciiMethods: 0,
    nonAsciiFields: 0,
    zeroWidth: 0,
    illegal: 0,
    mixedScript: 0,
    oneChar: 0,
    twoChar: 0,
    consonantOnly: 0,
    totalLeafChars: 0,
    entropySum: 0,
    methodEntropySum: 0,
    fieldEntropySum: 0,
    shortMethods: 0,
    shortFields: 0,
    methodOneChar: 0,
    fieldOneChar: 0,
    aritySum: 0,
    arityHigh: 0,
    emptyTypes: 0,
    moduleTypes: 0,
    enumFields: 0,
    enumShortFields: 0,
    leafCounts: new Map(),
    nsLeaves: new Map(),
    nsCounts: new Map(),
    suspicion: new Array(types.length),
  };

  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    const name = t.name || '';
    const leaf = leafOf(name);
    s.totalLeafChars += leaf.length;
    s.entropySum += leaf ? entropy(leaf) : 0;
    /* Scored once, here, and reused by analyse(). The score depends on the name
       alone, so a second pass would be the same work again. */
    s.suspicion[i] = suspicion(name);
    if (NON_ASCII.test(name)) s.nonAsciiTypes++;
    if (ZERO_WIDTH.test(name)) s.zeroWidth++;
    if (leaf && !IDENT.test(leaf)) s.illegal++;
    if (leaf.length === 1) s.oneChar++;
    else if (leaf.length === 2) s.twoChar++;
    if (leaf.length >= 4 && CONSONANTS.test(leaf)) s.consonantOnly++;
    if (name !== '<Module>' && scriptsIn(name).size > 1) s.mixedScript++;

    const arity = arityOf(name);
    s.aritySum += arity;
    if (arity >= 3) s.arityHigh++;

    s.leafCounts.set(leaf, (s.leafCounts.get(leaf) || 0) + 1);
    const ns = t.namespace || '';
    s.nsCounts.set(ns, (s.nsCounts.get(ns) || 0) + 1);
    let bucket = s.nsLeaves.get(ns);
    if (!bucket) { bucket = new Map(); s.nsLeaves.set(ns, bucket); }
    bucket.set(leaf, (bucket.get(leaf) || 0) + 1);

    if (t.kind === 'class' && name === '<Module>') { s.moduleTypes++; continue; }
    if (t.kind === 'class' && !t.methodCount && !t.fieldCount && !t.propertyCount && !t.eventCount
      && !/Delegate$|EventArgs$|Attribute$/.test(leaf)) s.emptyTypes++;
  }

  for (let i = 0; i < methods.length; i++) {
    const m = methods[i];
    const leaf = leafOf(m.name || '');
    s.methodEntropySum += leaf ? entropy(leaf) : 0;
    if (NON_ASCII.test(m.name || '')) s.nonAsciiMethods++;
    if (leaf.length <= 2) s.shortMethods++;
    if (leaf.length === 1) s.methodOneChar++;
  }

  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const leaf = leafOf(f.name || '');
    s.fieldEntropySum += leaf ? entropy(leaf) : 0;
    if (NON_ASCII.test(f.name || '')) s.nonAsciiFields++;
    if (leaf.length <= 2) s.shortFields++;
    if (leaf.length === 1) s.fieldOneChar++;
  }

  /* enum members: an obfuscator renames value__ neighbours to A, B, C */
  for (let i = 0; i < types.length; i++) {
    if (types[i].kind !== 'enum') continue;
    const own = index.fieldsByTypeIndex && index.fieldsByTypeIndex.get(i);
    if (!own) continue;
    for (const f of own) {
      if (f.name === 'value__') continue;
      s.enumFields++;
      if (leafOf(f.name || '').length <= 2) s.enumShortFields++;
    }
  }

  return s;
}

/**
 * Structural measurements. Names can be left intact while the body is stripped,
 * and names can be scrubbed while the structure stays perfectly normal; the two
 * families of signal answer different questions and both are reported.
 */
function structureStats(index, lookups) {
  const types = index.types || [];
  const methods = index.methods || [];
  const out = {
    methods: methods.length,
    withoutRva: 0,
    withRva: 0,
    duplicateSignatures: 0,
    signaturePairs: 0,
    interfaceSetReuse: 0,
    interfaceBearingTypes: 0,
    distinctInterfaceSets: 0,
  };

  for (let i = 0; i < methods.length; i++) {
    const m = methods[i];
    if (m.rva > 0) out.withRva++;
    else out.withoutRva++;
  }

  /* Two methods inside one type with the same name and signature cannot exist in
     valid C#; a renamed overload set that collided is a tool artefact. */
  const perType = new Map();
  for (let i = 0; i < methods.length; i++) {
    const m = methods[i];
    if (!m.signature) continue;
    let set = perType.get(m.type);
    if (!set) { set = new Set(); perType.set(m.type, set); }
    const key = m.name + '|' + m.signature;
    out.signaturePairs++;
    if (set.has(key)) out.duplicateSignatures++;
    else set.add(key);
  }

  /* Interfaces survive renaming. An assembly where hundreds of unrelated types
     declare the same interface list has had its own interfaces removed. */
  const seenSets = new Map();
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    const ifaces = interfacesOf(t);
    if (!ifaces.length) continue;
    out.interfaceBearingTypes++;
    const key = ifaces.slice().sort().join(',');
    seenSets.set(key, (seenSets.get(key) || 0) + 1);
  }
  out.distinctInterfaceSets = seenSets.size;
  for (const [, c] of seenSets) if (c >= 10) out.interfaceSetReuse += c;

  return out;
}

/**
 * Measure every name in the dump against the shape a normal Unity + BCL
 * assembly produces. Each row is a fact, not an opinion. Rows with `of: 0`
 * are absolute measurements (means and shares), not counts.
 */
function corpusSignals(index, lookups, stats) {
  const n = stats || nameStats(index);
  const st = structureStats(index, lookups);

  const typeDen = Math.max(n.types, 1);
  const methodDen = Math.max(n.methods, 1);
  const fieldDen = Math.max(n.fields, 1);
  const enumDen = Math.max(n.enumFields, 1);

  const meanLength = n.totalLeafChars / typeDen;
  const meanEntropy = n.entropySum / typeDen;
  const meanMethodEntropy = n.methodEntropySum / methodDen;
  const meanFieldEntropy = n.fieldEntropySum / fieldDen;
  const diversity = n.leafCounts.size / typeDen;

  /* an obfuscator reuses the same handful of names across unrelated types */
  let collisionTypes = 0;
  for (const [, leaves] of n.nsLeaves) {
    if (leaves.size && leavesTotal(leaves) < 20) continue;
    let total = 0;
    let hit = 0;
    for (const [, c] of leaves) { total += c; if (c >= 3) hit += c; }
    if (total >= 20 && hit / total >= 0.15) collisionTypes += hit;
  }

  /* a flattened assembly puts everything in one namespace */
  let largestNs = '';
  let largestNsCount = 0;
  for (const [ns, c] of n.nsCounts) {
    if (c > largestNsCount) { largestNsCount = c; largestNs = ns || '(global)'; }
  }
  const concentration = largestNsCount / typeDen;

  /* one leaf name, many namespaces: the same generated token reused everywhere */
  let globalReuse = 0;
  for (const [, c] of n.leafCounts) if (c >= 3) globalReuse += c;

  const rows = [
    {
      name: 'non-ascii-type-names', measured: n.nonAsciiTypes, of: n.types,
      normal: '0', weight: 0.30,
      note: 'Obfuscators that emit lookalike or invisible characters always show up here.',
    },
    {
      name: 'zero-width-or-bidi', measured: n.zeroWidth, of: n.types,
      normal: '0', weight: 0.30,
      note: 'Names that render identically but differ in bytes.',
    },
    {
      name: 'script-mixing', measured: n.mixedScript, of: n.types,
      normal: '0', weight: 0.30,
      note: 'One name drawing from two alphabets - the homoglyph attack.',
    },
    {
      name: 'illegal-identifiers', measured: n.illegal, of: n.types,
      normal: '0', weight: 0.25,
      note: 'Type names that could not have been written in C# source.',
    },
    {
      name: 'one-char-type-names', measured: n.oneChar, of: n.types,
      normal: 'under 1%', weight: 0.20,
      note: 'The BCL has a handful (GC, GL, SR); a dump full of them is machine-generated.',
    },
    {
      name: 'two-char-type-names', measured: n.twoChar, of: n.types,
      normal: 'under 1%', weight: 0.10,
      note: 'Short names are normal for vector structs and resource classes.',
    },
    {
      name: 'consonant-only-type-names', measured: n.consonantOnly, of: n.types,
      normal: 'under 0.5%', weight: 0.15,
      note: 'Readable names always contain a vowel unless they are acronyms.',
    },
    {
      name: 'mean-type-name-length', measured: Number(meanLength.toFixed(2)), of: 0,
      normal: '8 to 18', weight: 0.25,
      note: 'A whole assembly whose names average four characters was renamed by a tool.',
    },
    {
      name: 'mean-name-entropy', measured: Number(meanEntropy.toFixed(2)), of: 0,
      normal: '2.4 to 3.8', weight: 0.20,
      note: 'Bits per character in a leaf name. Letter-soup names sit low, prose sits in range.',
    },
    {
      name: 'name-diversity', measured: Number(diversity.toFixed(3)), of: 1,
      normal: 'above 0.70', weight: 0.20, inverted: true,
      note: 'Unique leaf names divided by type count. Obfuscators recycle names.',
    },
    {
      name: 'leaf-name-collisions', measured: collisionTypes, of: n.types,
      normal: 'under 30%', weight: 0.15,
      note: 'Types inside one namespace sharing a leaf name with 3+ siblings.',
    },
    {
      name: 'namespace-concentration', measured: Number(concentration.toFixed(3)), of: 0,
      normal: 'under 0.80', weight: 0.15,
      note: `Largest namespace is ${largestNs || '(none)'} with ${largestNsCount.toLocaleString('en-US')} types. Flatteners move everything into one.`,
    },
    {
      name: 'empty-type-share', measured: n.emptyTypes, of: n.types,
      normal: 'under 5%', weight: 0.10,
      note: 'Classes with no members at all. Junk shells look like this; so do stripped builds.',
    },
    {
      name: 'short-method-names', measured: n.shortMethods, of: n.methods,
      normal: 'under 3%', weight: 0.10,
      note: 'Crypto round functions and math helpers are legitimately short (F, G, FF, Sq).',
    },
    {
      name: 'short-field-names', measured: n.shortFields, of: n.fields,
      normal: 'under 15%', weight: 0.05,
      note: 'Unity serialized fields are often single letters by hand.',
    },
    {
      name: 'non-ascii-method-names', measured: n.nonAsciiMethods, of: n.methods,
      normal: '0', weight: 0.15,
      note: 'Method names outside ASCII, where the type names were clean.',
    },

    /* ---- structural family: renaming and stripping are different attacks ---- */
    {
      name: 'methods-without-rva', measured: st.withoutRva, of: st.methods,
      normal: 'under 20%', weight: 0.25,
      note: 'A method with no code address has had its body removed, encrypted or stubbed. Names stay readable while this number climbs.',
    },
    {
      name: 'duplicate-member-signatures', measured: st.duplicateSignatures, of: st.signaturePairs,
      normal: 'under 0.1%', weight: 0.25,
      note: 'Two members in one type with the same name and signature cannot come from valid C#. A handful can survive a partial dump; a share of the table means a renaming pass collided.',
    },
    {
      name: 'mean-method-name-entropy', measured: Number(meanMethodEntropy.toFixed(2)), of: 0,
      normal: '2.2 to 3.6', weight: 0.15,
      note: 'Method names carry the most prose in a real assembly. Letter soup drags this down even when type names were left alone.',
    },
    {
      name: 'mean-field-name-entropy', measured: Number(meanFieldEntropy.toFixed(2)), of: 0,
      normal: '2.0 to 3.4', weight: 0.10,
      note: 'Field names, measured separately: Unity serialized fields are short but still wordlike.',
    },
    {
      name: 'global-leaf-reuse', measured: globalReuse, of: n.types,
      normal: 'under 30%', weight: 0.15,
      note: 'One leaf name appearing on 3+ types anywhere in the dump. Real assemblies reuse List, Entry, Item and Node across namespaces; a generator reuses its whole alphabet.',
    },
    {
      name: 'high-arity-types', measured: n.arityHigh, of: n.types,
      normal: 'under 2%', weight: 0.10,
      note: 'Types with three or more generic parameters. Generators sometimes emit arity at random.',
    },
    {
      name: 'short-enum-members', measured: n.enumShortFields, of: n.enumFields,
      normal: 'under 20%', weight: 0.15,
      note: 'Enum members named with one or two characters. Unity enums are spelled out (Red, Blue, None).',
    },
  ];

  return rows;
}

/* Total of a leaf->count map, without materialising an array. */
function leavesTotal(map) {
  let total = 0;
  for (const [, c] of map) total += c;
  return total;
}

/**
 * Turn the measurements into one verdict.
 * @returns {{verdict:string, score:number, signals:Array, summary:string}}
 */
function corpusVerdict(signals) {
  let score = 0;
  for (const s of signals) {
    const ratio = s.of ? s.measured / s.of : s.measured;
    let pressure;
    switch (s.name) {
      case 'non-ascii-type-names':
      case 'zero-width-or-bidi':
      case 'script-mixing':
      case 'illegal-identifiers':
        pressure = ratio > 0 ? 1 : 0;
        break;
      case 'duplicate-member-signatures':
        pressure = ratio > 0.01 ? 1 : ratio > 0.001 ? (ratio - 0.001) / 0.009 : 0;
        break;
      case 'name-diversity':
        pressure = ratio < 0.5 ? 1 : ratio < 0.7 ? (0.7 - ratio) / 0.2 : 0;
        break;
      case 'mean-type-name-length':
        pressure = ratio < 4 ? 1 : ratio < 7 ? (7 - ratio) / 3 : 0;
        break;
      case 'mean-name-entropy':
        pressure = ratio < 1.6 ? 1 : ratio < 2.4 ? (2.4 - ratio) / 0.8 : 0;
        break;
      case 'mean-method-name-entropy':
        pressure = ratio < 1.4 ? 1 : ratio < 2.2 ? (2.2 - ratio) / 0.8 : 0;
        break;
      case 'mean-field-name-entropy':
        pressure = ratio < 1.2 ? 1 : ratio < 2.0 ? (2.0 - ratio) / 0.8 : 0;
        break;
      case 'namespace-concentration':
        pressure = ratio > 0.95 ? 1 : ratio > 0.80 ? (ratio - 0.80) / 0.15 : 0;
        break;
      case 'empty-type-share':
        pressure = ratio > 0.15 ? 1 : ratio > 0.05 ? (ratio - 0.05) / 0.10 : 0;
        break;
      case 'one-char-type-names':
        pressure = ratio > 0.10 ? 1 : ratio > 0.01 ? (ratio - 0.01) / 0.09 : 0;
        break;
      case 'consonant-only-type-names':
        pressure = ratio > 0.02 ? 1 : ratio > 0.005 ? (ratio - 0.005) / 0.015 : 0;
        break;
      case 'leaf-name-collisions':
        pressure = ratio > 0.70 ? 1 : ratio > 0.30 ? (ratio - 0.30) / 0.40 : 0;
        break;
      case 'short-method-names':
        pressure = ratio > 0.15 ? 1 : ratio > 0.03 ? (ratio - 0.03) / 0.12 : 0;
        break;
      case 'short-field-names':
        pressure = ratio > 0.30 ? 1 : ratio > 0.15 ? (ratio - 0.15) / 0.15 : 0;
        break;
      case 'short-enum-members':
        pressure = ratio > 0.60 ? 1 : ratio > 0.20 ? (ratio - 0.20) / 0.40 : 0;
        break;
      case 'methods-without-rva':
        pressure = ratio > 0.60 ? 1 : ratio > 0.20 ? (ratio - 0.20) / 0.40 : 0;
        break;
      case 'interface-set-reuse':
        pressure = ratio > 0.75 ? 1 : ratio > 0.40 ? (ratio - 0.40) / 0.35 : 0;
        break;
      case 'global-leaf-reuse':
        pressure = ratio > 0.60 ? 1 : ratio > 0.30 ? (ratio - 0.30) / 0.30 : 0;
        break;
      case 'high-arity-types':
        pressure = ratio > 0.08 ? 1 : ratio > 0.02 ? (ratio - 0.02) / 0.06 : 0;
        break;
      default:
        pressure = ratio > 0.20 ? 1 : ratio > 0.01 ? (ratio - 0.01) / 0.19 : 0;
    }
    s.pressure = Number(pressure.toFixed(2));
    score += pressure * s.weight;
  }
  score = Number(Math.min(score, 1).toFixed(2));

  const verdict = score >= 0.55 ? 'obfuscated' : score >= 0.25 ? 'suspicious' : 'clean';
  const summary = verdict === 'clean'
    ? 'Names are consistent with a normal Unity assembly. No obfuscation indicator in any of the measured signals.'
    : verdict === 'suspicious'
      ? 'Some signals are above the range a normal assembly produces. Review the flagged rows before treating any name as obfuscated.'
      : 'Multiple independent signals are far outside normal range. The assembly is obfuscated.';

  return { verdict, score, signals, summary };
}

/* ------------------------------------------------------------------- roles */

const LIFECYCLE = ['Awake', 'Start', 'Update', 'FixedUpdate', 'LateUpdate', 'OnEnable', 'OnDisable', 'OnDestroy'];
const LIFECYCLE_SET = new Set(LIFECYCLE);
const NETWORK = ['NetworkRunner', 'NetworkObject', 'NetworkBehaviour', 'NetworkTransform', 'PlayerRef', 'NetworkInput', 'NetworkBool'];
const AUDIO = ['AudioSource', 'AudioClip', 'AudioMixer', 'AudioListener'];
const UI = ['Button', 'Text', 'TMP_Text', 'Image', 'CanvasGroup', 'Slider', 'Toggle', 'Dropdown', 'ScrollRect', 'VisualElement', 'Label'];
const PHYSICS = ['Rigidbody', 'Rigidbody2D', 'Collider', 'BoxCollider', 'SphereCollider', 'CharacterController'];
const RENDER = ['Renderer', 'MeshRenderer', 'SkinnedMeshRenderer', 'Material', 'MeshFilter', 'Mesh'];
const ANIM = ['Animator', 'Animation', 'RuntimeAnimatorController'];

function baseLeafOf(type) {
  const base = (type.parent || '').split(',')[0].trim();
  if (!base) return '';
  const noGeneric = base.replace(/<.*$/, '');
  return noGeneric.includes('.') ? noGeneric.slice(noGeneric.lastIndexOf('.') + 1) : noGeneric;
}

/** Interfaces declared after the base class in "class X : Base, IThing". */
function interfacesOf(type) {
  const parts = (type.parent || '').split(',');
  return parts.slice(1).map(s => s.trim().replace(/<.*$/, '')).filter(Boolean);
}

const ROLE_INTERFACES = [
  [/IInteractable|IPointerClickHandler|IPointerEnterHandler|IPointerDownHandler|IPointerUpHandler|IEventSystemHandler/, 'interactable'],
  [/IDamageable|IDestructible|IHealth/, 'damageable'],
  [/INetworkRunnerCallbacks|INetworkObject|INetworkBehaviour|IStateAuthorityChanged/, 'networked behaviour'],
  [/ISaveable|ISerializationCallbackReceiver|ISaveData/, 'persistence holder'],
  [/IEnumerator/, 'coroutine host'],
];

/** Field types repeat across tens of thousands of fields (int, bool, string),
 *  so the token split is memoised once instead of regex-matched per field. */
const FIELD_TYPE_TOKENS = new Map();

function fieldTypeTokens(typeString) {
  if (!typeString) return null;
  let tokens = FIELD_TYPE_TOKENS.get(typeString);
  if (tokens !== undefined) return tokens;
  tokens = String(typeString).match(/[A-Za-z_][A-Za-z0-9_]*/g) || null;
  if (FIELD_TYPE_TOKENS.size < 20000) FIELD_TYPE_TOKENS.set(typeString, tokens);
  return tokens;
}

/** Field types as leaf names, so `List<UnityEngine.UI.Text>` matches `Text`. */
function heldLeaves(fields) {
  const out = [];
  for (let i = 0; i < fields.length; i++) {
    const tokens = fieldTypeTokens(fields[i].fieldType);
    if (tokens) for (let k = 0; k < tokens.length; k++) out.push(tokens[k]);
  }
  return out;
}

/**
 * Label what a type is for, with the evidence that produced the label.
 * @returns {{role:string|null, evidence:string[], confidence:number}}
 */
function inferRole(type, members) {
  const evidence = [];
  let confidence = 0;
  const base = baseLeafOf(type);
  const interfaces = interfacesOf(type);
  const fieldTypes = heldLeaves(members.fields || []);
  const methodNames = (members.methods || []).map(m => m.name);
  const holds = (name) => fieldTypes.some(t => t === name || t.startsWith(name + '<') || t.endsWith('.' + name));

  if (base === 'MonoBehaviour') { evidence.push('derives from MonoBehaviour'); confidence += 0.3; }
  if (base === 'ScriptableObject') { evidence.push('derives from ScriptableObject'); confidence += 0.35; }
  if (base && /Exception$/.test(base)) { evidence.push(`derives from ${base}`); confidence += 0.45; }
  if (base && /Attribute$/.test(base)) { evidence.push(`derives from ${base}`); confidence += 0.35; }

  let interfaceRole = null;
  for (const [re, role] of ROLE_INTERFACES) {
    const hit = interfaces.find(i => re.test(i));
    if (hit) { interfaceRole = role; evidence.push(`implements ${hit}`); confidence += 0.3; break; }
  }

  const netHits = NETWORK.filter(holds);
  if (netHits.length) { evidence.push(`fields hold ${netHits.slice(0, 3).join(', ')}`); confidence += 0.3; }
  const audioHits = AUDIO.filter(holds);
  if (audioHits.length) { evidence.push(`fields hold ${audioHits.slice(0, 3).join(', ')}`); confidence += 0.25; }
  const uiHits = UI.filter(holds);
  if (uiHits.length) { evidence.push(`fields hold ${uiHits.slice(0, 3).join(', ')}`); confidence += 0.2; }
  const physHits = PHYSICS.filter(holds);
  if (physHits.length) { evidence.push(`fields hold ${physHits.slice(0, 3).join(', ')}`); confidence += 0.2; }
  const renderHits = RENDER.filter(holds);
  if (renderHits.length) { evidence.push(`fields hold ${renderHits.slice(0, 3).join(', ')}`); confidence += 0.15; }
  const animHits = ANIM.filter(holds);
  if (animHits.length) { evidence.push(`fields hold ${animHits.slice(0, 3).join(', ')}`); confidence += 0.2; }

  const lifecycle = methodNames.filter(n => LIFECYCLE_SET.has(n));
  if (lifecycle.length) { evidence.push(`Unity lifecycle: ${lifecycle.slice(0, 4).join(', ')}`); confidence += Math.min(lifecycle.length * 0.08, 0.24); }

  const has = (re) => methodNames.filter(n => re.test(n));
  const combat = has(/^(TakeDamage|Die|OnDeath|Damage|Kill|Hit|Hurt)$/i);
  if (combat.length) { evidence.push(`combat methods: ${combat.slice(0, 3).join(', ')}`); confidence += 0.3; }
  const interact = has(/^(Interact|OnInteract|OnPointerClick|OnClick|Use)$/i);
  if (interact.length) { evidence.push(`interaction methods: ${interact.slice(0, 3).join(', ')}`); confidence += 0.25; }
  const movement = has(/^(Move|Jump|Sprint|Crouch|Dash|Teleport)$/i);
  if (movement.length) { evidence.push(`movement methods: ${movement.slice(0, 3).join(', ')}`); confidence += 0.25; }
  const save = has(/^(Save|Load|Serialize|Deserialize|ToJson|FromJson)$/i);
  if (save.length) { evidence.push(`persistence methods: ${save.slice(0, 3).join(', ')}`); confidence += 0.2; }
  const net = has(/^(RPC_|OnPlayer|Spawn|Despawn|OnJoined|OnLeft)/i);
  if (net.length) { evidence.push(`network callbacks: ${net.slice(0, 3).join(', ')}`); confidence += 0.25; }

  let role = null;
  if (base && /Exception$/.test(base)) role = 'exception type';
  else if (base && /Attribute$/.test(base)) role = 'attribute';
  else if (interfaceRole) role = interfaceRole;
  else if (netHits.length || net.length) role = 'networked behaviour';
  else if (combat.length) role = 'damageable';
  else if (interact.length) role = 'interactable';
  else if (movement.length) role = 'movement controller';
  else if (audioHits.length) role = 'audio controller';
  else if (animHits.length) role = 'animation driver';
  else if (uiHits.length) role = 'UI controller';
  else if (physHits.length) role = 'physics object';
  else if (renderHits.length) role = 'renderable';
  else if (base === 'ScriptableObject') role = 'data asset';
  else if (base === 'MonoBehaviour') role = 'behaviour component';
  else if (type.kind === 'enum') role = 'enumeration';
  else if (type.kind === 'interface') role = 'interface';
  else if (type.kind === 'struct') role = 'value type';
  else if (type.kind === 'class') role = 'class';

  return { role, evidence, confidence: Number(Math.min(confidence, 0.9).toFixed(2)) };
}

/* ------------------------------------------------------- role propagation */

/**
 * Push a confident role across the field-type graph.
 *
 * A component that nothing derives from and that holds no recognisable engine
 * type is invisible to inferRole: it is just a class with three ints. But when
 * sixty types of a "Player" hold it, or when it holds the Player, it is a player
 * part and saying so is useful. One breadth-first pass over the reference graph,
 * capped at two hops, only fills in types that inferRole left unlabelled - it
 * never overwrites measured evidence.
 *
 * @returns {{roles:Array<{role:string|null, confidence:number}>, promoted:number}}
 */
function propagateRoles(index, lookups, roles, opts) {
  const o = opts || {};
  const hops = typeof o.hops === 'number' ? o.hops : 2;
  const minSeed = typeof o.minSeed === 'number' ? o.minSeed : 0.5;
  const types = index.types || [];
  const n = types.length;

  /* typeDefIndex is the public handle but the arrays are dense, so map once. */
  const byDef = new Map();
  for (let i = 0; i < n; i++) byDef.set(types[i].typeDefIndex, i);

  /* Leaf name -> type indices, for resolving a field type string to a type.
     A nested type (`CommandEvent.Type`) is indexed under its full path, never
     under its bare leaf: there are hundreds of nested `Type` enums in a Unity
     assembly, and matching `Type` alone would wire every one of them to every
     field that mentions it. */
  const byLeaf = new Map();
  const byNested = new Map();
  for (let i = 0; i < n; i++) {
    const name = types[i].name || '';
    const key = name.includes('.') ? name : leafOf(name);
    const target = name.includes('.') ? byNested : byLeaf;
    let list = target.get(key);
    if (!list) { list = []; target.set(key, list); }
    list.push(i);
  }

  /* A leaf name carried by many types (List, Entry, Item, Node) cannot say which
     type a field holds: `List<Foo>` would otherwise point at every List in the
     assembly and make the reference graph meaningless. Ambiguous leaves are
     dropped from the graph and reported, not silently ignored. */
  const AMBIGUOUS = 8;
  let ambiguousLeaves = 0;
  for (const [, list] of byLeaf) if (list.length > AMBIGUOUS) ambiguousLeaves++;

  /* Container and shape names are never the game type being held. A field typed
     `List<Player>` holds a Player; the List itself is the BCL's, not the dump's. */
  const STRUCTURAL = new Set([
    'List', 'Dictionary', 'HashSet', 'SortedDictionary', 'SortedList', 'SortedSet',
    'Queue', 'Stack', 'LinkedList', 'Array', 'ArraySegment', 'Span', 'Memory',
    'IEnumerable', 'IList', 'ICollection', 'IDictionary', 'IReadOnlyList',
    'IReadOnlyCollection', 'IReadOnlyDictionary', 'ISet', 'Nullable',
    'KeyValuePair', 'Entry', 'Node', 'Item', 'Value', 'Pair', 'Tuple',
  ]);

  /* edges: holder -> held, and held -> holder, both game-specific only */
  const outEdges = new Array(n);
  const inDegree = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const fields = lookups.fieldsByType.get(i);
    if (!fields) continue;
    let edges = null;
    const link = (list) => {
      for (let t = 0; t < list.length; t++) {
        const to = list[t];
        if (to === i) continue;
        if (!edges) edges = [];
        edges.push(to);
        if (inDegree[to] < 65535) inDegree[to]++;
      }
    };
    for (let f = 0; f < fields.length; f++) {
      const tokens = fieldTypeTokens(fields[f].fieldType);
      if (!tokens) continue;
      for (let k = 0; k < tokens.length; k++) {
        const tok = tokens[k];
        /* a two-token window first, so `CommandEvent.Type` resolves to the nested
           enum rather than to a bare `Type` that does not exist */
        if (k + 1 < tokens.length) {
          const nested = byNested.get(tok + '.' + tokens[k + 1]);
          if (nested) { link(nested); continue; }
        }
        if (STRUCTURAL.has(tok)) continue;
        const targets = byLeaf.get(tok);
        if (!targets || targets.length > AMBIGUOUS) continue;
        link(targets);
      }
    }
    if (edges) outEdges[i] = edges;
  }

  const next = roles.map(r => ({ role: r.role, confidence: r.confidence }));
  const provenance = new Array(n).fill(null);
  let promoted = 0;

  /* Only types whose label is a bare kind - "class", "struct", "value type" -
     are open to inheritance. A measured label is never overwritten. */
  const PLACEHOLDER = new Set(['class', 'struct', 'value type', 'unclassified']);
  const isOpen = (r) => !r.role || PLACEHOLDER.has(r.role) || r.confidence < 0.3;

  let frontier = [];
  for (let i = 0; i < n; i++) {
    if (!isOpen(next[i])) frontier.push(i);
  }

  for (let hop = 0; hop < hops && frontier.length; hop++) {
    const additions = [];
    for (const src of frontier) {
      const targets = outEdges[src];
      if (!targets) continue;
      for (let k = 0; k < targets.length; k++) {
        const t = targets[k];
        if (!isOpen(next[t])) continue;
        const inherited = Number((next[src].confidence * (hop === 0 ? 0.55 : 0.3)).toFixed(2));
        if (inherited < 0.2) continue;
        next[t].role = 'part of ' + leafOf(types[src].name);
        next[t].bucket = 'part of another type';
        next[t].confidence = inherited;
        provenance[t] = { from: types[src].typeDefIndex, fromName: fqName(types[src]), hop: hop + 1, edge: 'held by' };
        additions.push(t);
        promoted++;
      }
    }
    frontier = additions;
  }

  return { roles: next, promoted, provenance, inDegree, ambiguousLeaves };
}

/* --------------------------------------------------------------- suggestions */

/* Subjects a Unity game names its own types after. Each entry is a pattern over
   field types, method names and the base type, plus the noun it contributes. */
const SUBJECTS = [
  [/Player|Avatar|Character|Rig\b|Body\b/i, 'Player'],
  [/Enemy|Monster|Ape|Gorilla|Bot\b|NPC/i, 'Enemy'],
  [/Weapon|Gun|Shoot|Blaster|Sword|Bat\b|Punch/i, 'Weapon'],
  [/Health|Damage|HitPoint|Vital/i, 'Health'],
  [/Inventory|Item|Backpack|Slot\b|Pickup/i, 'Inventory'],
  [/Quest|Mission|Objective|Task/i, 'Quest'],
  [/Score|Point|Combo|Streak/i, 'Score'],
  [/Timer|Countdown|Clock|TimeLimit/i, 'Timer'],
  [/Wave|Round|Stage|Level/i, 'Wave'],
  [/Shop|Store|Currency|Coin|Purchase/i, 'Shop'],
  [/Door|Gate|Lever|Button|Switch/i, 'Door'],
  [/Spawn|Respawn|Pool\b/i, 'Spawn'],
  [/Network|RPC|Sync|Photon|Fusion/i, 'Network'],
  [/Audio|Sound|Music|Clip/i, 'Audio'],
  [/Camera|View|Look\b/i, 'Camera'],
  [/UI|Canvas|Panel|Menu|HUD/i, 'UI'],
  [/Save|Config|Setting|Profile|Prefs/i, 'Settings'],
  [/Vehicle|Car\b|Kart|Bike/i, 'Vehicle'],
  [/Hand|Grab|Grip|Finger/i, 'Hand'],
  [/Locomotion|Move|Jump|Sprint|Teleport/i, 'Movement'],
];

const VERBS = [
  [/TakeDamage|Damage|Hurt|Hit/i, 'Damage'],
  [/Interact|Use\b|Activate/i, 'Interact'],
  [/Pickup|PickUp|Grab|Collect/i, 'Pickup'],
  [/Spawn|Instantiate|Create/i, 'Spawn'],
  [/Destroy|Despawn|Kill/i, 'Despawn'],
  [/Move|Jump|Dash|Teleport/i, 'Move'],
  [/Shoot|Fire|Attack|Punch/i, 'Attack'],
  [/Open|Close|Toggle/i, 'Toggle'],
  [/Save|Load|Serialize/i, 'State'],
  [/Reload|Equip|Unequip/i, 'Equip'],
  [/Play|Start|Begin/i, 'Play'],
];

const SUFFIX_BY_ROLE = {
  'damageable': 'Health',
  'interactable': 'Interactable',
  'movement controller': 'Movement',
  'audio controller': 'Audio',
  'animation driver': 'Animator',
  'UI controller': 'View',
  'physics object': 'Body',
  'networked behaviour': 'Networked',
  'data asset': 'Data',
  'persistence holder': 'State',
  'coroutine host': 'Routine',
  'exception type': 'Exception',
  'attribute': 'Attribute',
  'behaviour component': 'Behaviour',
  'renderable': 'Renderer',
};

function pascal(s) {
  return String(s || '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1)).join('');
}

/**
 * Compose a name from what the type actually holds. Every token that goes into
 * the name is reported, so a reviewer can reject a suggestion on sight.
 * @returns {{name:string|null, confidence:number, evidence:string[]}}
 */
function suggestName(type, roleInfo, members) {
  const role = roleInfo && roleInfo.role ? roleInfo.role : null;
  const roleConfidence = roleInfo && roleInfo.confidence ? roleInfo.confidence : 0;
  const fieldTypes = (members.fields || []).map(f => f.fieldType);
  const methodNames = (members.methods || []).map(m => m.name);
  const base = baseLeafOf(type);
  const evidence = [];

  const pool = [...fieldTypes, ...methodNames, base, (type.parent || '')];
  let subject = '';
  for (const [re, noun] of SUBJECTS) {
    if (pool.some(s => re.test(String(s)))) { subject = noun; evidence.push(`subject "${noun}" from a matching member`); break; }
  }
  let verb = '';
  for (const [re, word] of VERBS) {
    if (methodNames.some(m => re.test(m))) { verb = word; evidence.push(`verb "${word}" from a method name`); break; }
  }

  let name = null;
  if (type.kind === 'enum') {
    name = (subject || 'Value') + 'Kind';
  } else if (type.kind === 'interface') {
    name = 'I' + (verb || subject || 'Game') + (subject && verb ? subject : 'Contract');
  } else if (base && /Delegate$/.test(base)) {
    name = (subject || 'Game') + (verb || 'Event') + 'Handler';
  } else if (subject && verb) {
    name = subject + verb;
  } else if (subject) {
    name = subject + (SUFFIX_BY_ROLE[role] || 'Behaviour');
  } else if (role && SUFFIX_BY_ROLE[role]) {
    name = SUFFIX_BY_ROLE[role];
  } else if (verb) {
    name = verb + 'Behaviour';
  }
  if (!name) return { name: null, confidence: 0, evidence };

  const evidenceWeight = Math.min((subject ? 0.2 : 0) + (verb ? 0.15 : 0), 0.35);
  const confidence = Number(Math.min(0.35 + evidenceWeight + roleConfidence * 0.45, 0.85).toFixed(2));
  if (role) evidence.unshift(`role: ${role}`);
  return { name: pascal(name), confidence, evidence };
}

/**
 * Two obfuscated types must never receive the same replacement name. Names are
 * grouped, and every collision after the first is suffixed with the ordinal that
 * its typeDefIndex gives it, so the result is stable across runs.
 *
 * @param {Array<{typeDefIndex:number, suggestion:string}>} rows
 * @returns {Array} the same rows, with `suggestion` made unique
 */
function dedupeSuggestions(rows) {
  const byName = new Map();
  for (const r of rows) {
    if (!r.suggestion) continue;
    let list = byName.get(r.suggestion);
    if (!list) { list = []; byName.set(r.suggestion, list); }
    list.push(r);
  }
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.typeDefIndex - b.typeDefIndex);
    for (let i = 0; i < list.length; i++) {
      list[i].suggestion = i === 0 ? name : `${name}_${i + 1}`;
      list[i].suggestionNote = i === 0
        ? `unique name among ${list.length} candidates`
        : `disambiguated: ${list.length} types shared the base name "${name}"`;
    }
  }
  return rows;
}

/* ------------------------------------------------------------------ analyse */

/**
 * Rank game types by how much the rest of the assembly leans on them, not by
 * raw member count. A class held by forty other game types is more central than
 * a class with a long method list that nothing references.
 */
function rankGameTypes(index, lookups, limit, inDegree) {
  const scored = [];
  const types = index.types || [];
  const owner = imageIndex(index);
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    if (!isGameType(owner, i) || t.name === '<Module>') continue;
    const methods = lookups.methodsByType.get(i);
    const fields = lookups.fieldsByType.get(i);
    let lifecycle = 0;
    let rvaMethods = 0;
    if (methods) {
      for (let k = 0; k < methods.length; k++) {
        if (LIFECYCLE_SET.has(methods[k].name)) lifecycle++;
        if (methods[k].rva > 0) rvaMethods++;
      }
    }
    const refs = inDegree ? inDegree[i] : 0;
    const score = (methods ? methods.length : 0) * 2
      + (fields ? fields.length : 0)
      + lifecycle * 6
      + rvaMethods
      + refs * 8;
    scored.push({
      name: fqName(t),
      kind: t.kind,
      typeDefIndex: t.typeDefIndex,
      methods: t.methodCount,
      fields: t.fieldCount,
      properties: t.propertyCount,
      lifecycle,
      references: refs,
      parent: t.parent || '',
      line: t.lineStart,
      score,
    });
  }
  scored.sort((a, b) => b.score - a.score || b.methods - a.methods);
  return scored.slice(0, limit);
}

/**
 * Full analysis of a parsed index.
 * @param {object} index
 * @param {object} lookups from buildLookups()
 * @param {{threshold?:number, limit?:number, roles?:boolean, hops?:number}} [opts]
 */
function analyse(index, lookups, opts) {
  const o = opts || {};
  const threshold = typeof o.threshold === 'number' ? o.threshold : 0.5;
  const limit = o.limit || 500;

  const stats = nameStats(index);
  const signals = corpusSignals(index, lookups, stats);
  const corpus = corpusVerdict(signals);

  /* Role census runs regardless of naming: it is navigation, not forensics. */
  let roles = null;
  let roleMap = null;
  let propagation = null;
  if (o.roles !== false) {
    const buckets = {};
    const byRole = {};
    const interesting = [];
    const nsPressure = new Map();
    const measured = new Array(index.types.length);
    const owner = imageIndex(index);

    for (let i = 0; i < index.types.length; i++) {
      const t = index.types[i];
      const members = {
        fields: lookups.fieldsByType.get(i) || [],
        methods: lookups.methodsByType.get(i) || [],
      };
      const r = inferRole(t, members);
      measured[i] = { role: r.role, confidence: r.confidence, evidence: r.evidence };

      /* game-specific types: anything outside the engine and SDK assemblies */
      if (isGameType(owner, i) && t.name !== '<Module>') {
        if (interesting.length < 400) interesting.push({ name: fqName(t), kind: t.kind, typeDefIndex: t.typeDefIndex, methods: t.methodCount, fields: t.fieldCount, parent: t.parent, line: t.lineStart });
        const leaf = leafOf(t.name);
        if (leaf.length <= 2 || scriptsIn(t.name).size > 1) {
          const ns = t.namespace || '(global)';
          nsPressure.set(ns, (nsPressure.get(ns) || 0) + 1);
        }
      }
    }

    propagation = propagateRoles(index, lookups, measured, { hops: o.hops });
    roleMap = propagation.roles.map(r => ({ role: r.role, confidence: r.confidence, bucket: r.bucket || r.role || null }));

    for (let i = 0; i < roleMap.length; i++) {
      /* Inherited labels all share one census bucket, so the census stays a
         census. The specific "part of Player" label is kept per type. */
      const key = roleMap[i].bucket || 'unclassified';
      buckets[key] = (buckets[key] || 0) + 1;
      if (roleMap[i].role && roleMap[i].confidence >= 0.3) {
        if (!byRole[key]) byRole[key] = [];
        if (byRole[key].length < 40) {
          const t = index.types[i];
          byRole[key].push({
            name: fqName(t), kind: t.kind, typeDefIndex: t.typeDefIndex, line: t.lineStart,
            role: roleMap[i].role,
            confidence: roleMap[i].confidence,
            evidence: measured[i].evidence.length ? measured[i].evidence : [
              `inherited from ${propagation.provenance[i].fromName} (${propagation.provenance[i].hop} hop${propagation.provenance[i].hop === 1 ? '' : 's'})`,
            ],
          });
        }
      }
    }

    const hotNamespaces = [...nsPressure.entries()]
      .map(([ns, shortNames]) => ({ namespace: ns, shortNames }))
      .sort((a, b) => b.shortNames - a.shortNames)
      .slice(0, 12);

    roles = {
      buckets,
      examples: byRole,
      gameSpecific: interesting,
      hotNamespaces,
      promoted: propagation.promoted,
      ranked: rankGameTypes(index, lookups, 200, propagation.inDegree),
    };
  } else {
    propagation = { inDegree: null };
    roles = null;
  }

  /* Per-type suspicion is scored for every type, always. The corpus verdict says
     whether the assembly is obfuscated; it does not make an individual type less
     machine-shaped, and hiding the score behind the verdict loses the one type
     that mattered. */
  const findings = [];
  const scored = [];
  const precomputed = stats.suspicion;
  for (let i = 0; i < index.types.length; i++) {
    const t = index.types[i];
    const s = precomputed[i];
    if (s.score > 0) scored.push({ index: i, type: t, suspicion: s });
    if (s.score < threshold) continue;
    const members = {
      fields: lookups.fieldsByType.get(i) || [],
      methods: lookups.methodsByType.get(i) || [],
    };
    const role = inferRole(t, members);
    const suggestion = suggestName(t, role, members);
    findings.push({
      typeDefIndex: t.typeDefIndex,
      original: fqName(t),
      namespace: t.namespace,
      kind: t.kind,
      line: t.lineStart,
      suspicion: s,
      role: role.role,
      evidence: role.evidence,
      suggestion: suggestion.name,
      suggestionEvidence: suggestion.evidence,
      suggestionConfidence: suggestion.confidence,
      confidence: Number((role.confidence * s.score).toFixed(2)),
      members: { methods: members.methods.length, fields: members.fields.length },
    });
    if (findings.length >= limit) break;
  }
  dedupeSuggestions(findings);
  findings.sort((a, b) => b.suspicion.score - a.suspicion.score || b.confidence - a.confidence);

  const renameMap = findings
    .filter(f => f.suggestion)
    .map(f => ({
      typeDefIndex: f.typeDefIndex,
      original: f.original,
      suggestion: f.suggestion,
      confidence: f.suggestionConfidence,
      role: f.role,
      evidence: f.suggestionEvidence,
      note: f.suggestionNote || null,
    }));

  return {
    threshold,
    scannedTypes: index.types.length,
    verdict: corpus.verdict,
    score: corpus.score,
    summary: corpus.summary,
    signals: corpus.signals,
    suspicious: findings.length,
    withSuggestion: renameMap.length,
    scoredTypes: scored.length,
    findings,
    renameMap,
    roles,
    roleMap,
    note: 'Suggestions are inferred from members and base types. They are never written back to the dump.',
  };
}

module.exports = {
  analyse, corpusSignals, corpusVerdict, suspicion, inferRole, suggestName,
  leafOf, entropy, scriptsIn, interfacesOf, isFramework, rankGameTypes,
  propagateRoles, dedupeSuggestions, nameStats, structureStats,
};
