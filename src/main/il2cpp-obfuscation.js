/* ============================================================================
   il2cpp-obfuscation.js - decide whether a dump is actually obfuscated, and say
   what each type is for.

   Two judgements, deliberately kept apart:

   1. Corpus verdict. Obfuscation is a property of the whole assembly, not of a
      single name. A type called "Id" is not evidence of anything; 400 types
      called "a", "b", "aa" and "ab" are. The verdict is built from counts over
      every name in the dump, each compared against what a normal Unity/BCL
      assembly produces, and every number is reported so the verdict can be
      checked rather than trusted.

   2. Role inference. Independent of naming, what does this type do? Base class,
      interfaces, field types, method names and Unity lifecycle methods are
      enough to label most behaviours, and the label always carries its evidence.

   Nothing here rewrites a name. Suggestions exist only for types that are
   already flagged, and they are marked as guesses with a confidence below 1.0.
   ========================================================================== */
'use strict';

const { fqName } = require('./il2cpp-dump-index');

/* --------------------------------------------------------------- shape tests */

const ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/;
/* Compiler-generated names legitimately look like <>c, <Module>, <Wait>d__32,
   __StaticArrayInitTypeSize=120 and <<Read>g__Local|44_0>d. Roslyn emits all of
   these in un-obfuscated assemblies, so they are not evidence of anything. */
const IDENT = /^[\p{L}_<$][\p{L}\p{N}_`<>$.=|]*$/u;

function entropy(name) {
  const counts = new Map();
  for (const ch of name) counts.set(ch, (counts.get(ch) || 0) + 1);
  let h = 0;
  for (const c of counts.values()) { const p = c / name.length; h -= p * Math.log2(p); }
  return h;
}

/** Leaf name without its generic arity suffix. */
function leafOf(name) {
  const leaf = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;
  return leaf.replace(/`\d+$/, '');
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

  if (!IDENT.test(leaf)) { score += 0.7; reasons.push('not a legal C# identifier'); }
  if (ZERO_WIDTH.test(name)) { score += 0.7; reasons.push('zero-width or bidi control character'); }
  if (/[^\x20-\x7E]/.test(name)) { score += 0.5; reasons.push('non-ASCII character'); }
  if (leaf.length === 1) { score += 0.4; reasons.push('single character'); }
  else if (leaf.length === 2) { score += 0.15; reasons.push('two characters'); }
  if (/^[A-Za-z]\d$/.test(leaf)) { score += 0.35; reasons.push('letter plus digit'); }
  if (/^\d+$/.test(leaf)) { score += 0.6; reasons.push('digits only'); }
  if (leaf.length >= 4 && /^[bcdfghjklmnpqrstvwxz]+$/i.test(leaf)) { score += 0.35; reasons.push('no vowels'); }
  if (/(.)\1{3,}/.test(leaf)) { score += 0.2; reasons.push('repeated character run'); }
  if (leaf.length >= 8 && entropy(leaf) > 3.7) { score += 0.25; reasons.push(`character entropy ${entropy(leaf).toFixed(2)}`); }
  if (/\d{4,}/.test(leaf)) { score += 0.2; reasons.push('long digit run'); }

  return { score: Math.min(Number(score.toFixed(2)), 1), reasons };
}

/* -------------------------------------------------------------- corpus scan */

/**
 * Measure every name in the dump against the shape a normal Unity + BCL
 * assembly produces. Each row is a fact, not an opinion.
 */
function corpusSignals(index) {
  const types = index.types;
  const methods = index.methods;
  const fields = index.fields;

  const typeLeaves = types.map(t => leafOf(t.name));
  const methodLeaves = methods.map(m => leafOf(m.name || ''));
  const fieldLeaves = fields.map(f => leafOf(f.name || ''));

  const nonAsciiTypes = types.filter(t => /[^\x20-\x7E]/.test(t.name)).length;
  const nonAsciiMethods = methods.filter(m => /[^\x20-\x7E]/.test(m.name || '')).length;
  const zeroWidth = types.filter(t => ZERO_WIDTH.test(t.name)).length;
  const illegal = typeLeaves.filter(n => n && !IDENT.test(n)).length;

  const oneChar = typeLeaves.filter(n => n.length === 1).length;
  const twoChar = typeLeaves.filter(n => n.length === 2).length;
  const consonantOnly = typeLeaves.filter(n => n.length >= 4 && /^[bcdfghjklmnpqrstvwxz]+$/i.test(n)).length;

  const uniqueTypeLeaves = new Set(typeLeaves).size;
  const diversity = types.length ? uniqueTypeLeaves / types.length : 1;

  /* an obfuscator reuses the same handful of names across unrelated types */
  const byNs = new Map();
  for (const t of types) {
    const ns = t.namespace || '';
    if (!byNs.has(ns)) byNs.set(ns, []);
    byNs.get(ns).push(leafOf(t.name));
  }
  let collisionTypes = 0;
  let collisionNamespaces = 0;
  for (const [, leaves] of byNs) {
    if (leaves.length < 20) continue;
    const counts = new Map();
    for (const l of leaves) counts.set(l, (counts.get(l) || 0) + 1);
    let hit = 0;
    for (const [, c] of counts) if (c >= 3) hit += c;
    if (hit / leaves.length >= 0.15) { collisionNamespaces++; collisionTypes += hit; }
  }

  const rows = [
    {
      name: 'non-ascii-type-names', measured: nonAsciiTypes, of: types.length,
      normal: '0', weight: 0.30,
      note: 'Obfuscators that emit lookalike or invisible characters always show up here.',
    },
    {
      name: 'zero-width-or-bidi', measured: zeroWidth, of: types.length,
      normal: '0', weight: 0.30,
      note: 'Names that render identically but differ in bytes.',
    },
    {
      name: 'illegal-identifiers', measured: illegal, of: types.length,
      normal: '0', weight: 0.25,
      note: 'Type names that could not have been written in C# source.',
    },
    {
      name: 'one-char-type-names', measured: oneChar, of: types.length,
      normal: 'under 1%', weight: 0.20,
      note: 'The BCL has a handful (GC, GL, SR); a dump full of them is machine-generated.',
    },
    {
      name: 'two-char-type-names', measured: twoChar, of: types.length,
      normal: 'under 1%', weight: 0.10,
      note: 'Short names are normal for vector structs and resource classes.',
    },
    {
      name: 'consonant-only-type-names', measured: consonantOnly, of: types.length,
      normal: 'under 0.5%', weight: 0.15,
      note: 'Readable names always contain a vowel unless they are acronyms.',
    },
    {
      name: 'name-diversity', measured: Number(diversity.toFixed(3)), of: 1,
      normal: 'above 0.70', weight: 0.20, inverted: true,
      note: 'Unique leaf names divided by type count. Obfuscators recycle names.',
    },
    {
      name: 'leaf-name-collisions', measured: collisionTypes, of: types.length,
      normal: 'under 30%', weight: 0.15,
      note: 'Types inside one namespace sharing a leaf name with 3+ siblings.',
    },
    {
      name: 'short-method-names', measured: methodLeaves.filter(n => n.length <= 2).length, of: methods.length,
      normal: 'under 3%', weight: 0.10,
      note: 'Crypto round functions and math helpers are legitimately short (F, G, FF, Sq).',
    },
    {
      name: 'short-field-names', measured: fieldLeaves.filter(n => n.length <= 2).length, of: fields.length,
      normal: 'under 15%', weight: 0.05,
      note: 'Unity serialized fields are often single letters by hand.',
    },
  ];

  return rows;
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
      case 'illegal-identifiers':
        pressure = ratio > 0 ? 1 : 0;
        break;
      case 'name-diversity':
        pressure = ratio < 0.5 ? 1 : ratio < 0.7 ? (0.7 - ratio) / 0.2 : 0;
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
      default:
        pressure = ratio > 0.20 ? 1 : ratio > 0.01 ? (ratio - 0.01) / 0.19 : 0;
    }
    s.pressure = Number(pressure.toFixed(2));
    score += pressure * s.weight;
  }
  score = Number(Math.min(score, 1).toFixed(2));

  const verdict = score >= 0.55 ? 'obfuscated' : score >= 0.25 ? 'suspicious' : 'clean';
  const summary = verdict === 'clean'
    ? 'Names are consistent with a normal Unity assembly. No obfuscation indicators in any of the measured signals.'
    : verdict === 'suspicious'
      ? 'Some signals are above the range a normal assembly produces. Review the flagged rows before treating any name as obfuscated.'
      : 'Multiple independent signals are far outside normal range. The assembly is obfuscated.';

  return { verdict, score, signals, summary };
}

/* ------------------------------------------------------------------- roles */

const LIFECYCLE = ['Awake', 'Start', 'Update', 'FixedUpdate', 'LateUpdate', 'OnEnable', 'OnDisable', 'OnDestroy'];
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

/**
 * Label what a type is for, with the evidence that produced the label.
 * @returns {{role:string|null, evidence:string[], confidence:number}}
 */
function inferRole(type, members) {
  const evidence = [];
  let confidence = 0;
  const base = baseLeafOf(type);
  const fieldTypes = (members.fields || []).map(f => f.fieldType);
  const methodNames = (members.methods || []).map(m => m.name);
  const holds = (name) => fieldTypes.some(t => t === name || t.startsWith(name + '<') || t.endsWith('.' + name));

  if (base === 'MonoBehaviour') { evidence.push('derives from MonoBehaviour'); confidence += 0.3; }
  if (base === 'ScriptableObject') { evidence.push('derives from ScriptableObject'); confidence += 0.35; }
  if (base && /Exception$/.test(base)) { evidence.push(`derives from ${base}`); confidence += 0.45; }
  if (base && /Attribute$/.test(base)) { evidence.push(`derives from ${base}`); confidence += 0.35; }

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

  const lifecycle = methodNames.filter(n => LIFECYCLE.includes(n));
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

/** Suggest a name for a type that is already flagged as machine-named. */
function suggestName(type, role, members) {
  const fieldTypes = (members.fields || []).map(f => f.fieldType);
  const methodNames = (members.methods || []).map(m => m.name);
  const pascal = (s) => String(s || '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1)).join('');

  const subjectFromFields = () => {
    const order = [
      [/Audio/, 'Audio'], [/Camera/, 'Camera'], [/Weapon|Gun|Shoot/, 'Weapon'],
      [/Health|Damage/, 'Health'], [/Player/, 'Player'], [/Enemy|Monster|Ape/, 'Enemy'],
      [/Inventory|Item|Backpack/, 'Inventory'], [/Quest|Mission/, 'Quest'], [/Button|Panel|UI/, 'UI'],
      [/Network/, 'Network'], [/Spawn/, 'Spawn'], [/Door/, 'Door'], [/Lever/, 'Lever'],
      [/Save|Config|Settings/, 'Settings'],
    ];
    for (const [re, label] of order) if (fieldTypes.some(t => re.test(t))) return label;
    return '';
  };

  const subject = subjectFromFields();
  switch (role) {
    case 'damageable': return pascal(subject || 'Health') + 'Behaviour';
    case 'interactable': return 'Interactable' + pascal(subject);
    case 'movement controller': return pascal(subject || 'Character') + 'Movement';
    case 'audio controller': return pascal(subject || 'Audio') + 'Controller';
    case 'animation driver': return pascal(subject || 'Animation') + 'Driver';
    case 'UI controller': return pascal(subject || 'UI') + 'Controller';
    case 'physics object': return pascal(subject || 'Physics') + 'Body';
    case 'networked behaviour': return 'Networked' + pascal(subject || 'Object');
    case 'data asset': return pascal(subject || 'Game') + 'Data';
    case 'exception type': return pascal(subject || 'Game') + 'Exception';
    case 'enumeration': return pascal(subject || 'Value') + 'Kind';
    case 'behaviour component': return pascal(subject || 'Game') + 'Behaviour';
    default: return null;
  }
}

/* ------------------------------------------------------------------ analyse */

/**
 * Full analysis of a parsed index.
 * @param {object} index
 * @param {object} lookups from buildLookups()
 * @param {{threshold?:number, limit?:number, roles?:boolean}} [opts]
 */
function analyse(index, lookups, opts) {
  const o = opts || {};
  const threshold = typeof o.threshold === 'number' ? o.threshold : 0.5;
  const limit = o.limit || 500;

  const signals = corpusSignals(index);
  const corpus = corpusVerdict(signals);

  const findings = [];
  if (corpus.verdict !== 'clean') {
    for (let i = 0; i < index.types.length; i++) {
      const t = index.types[i];
      const s = suspicion(t.name);
      if (s.score < threshold) continue;
      const members = {
        fields: lookups.fieldsByType.get(i) || [],
        methods: lookups.methodsByType.get(i) || [],
      };
      const role = inferRole(t, members);
      findings.push({
        typeDefIndex: t.typeDefIndex,
        original: fqName(t),
        namespace: t.namespace,
        kind: t.kind,
        line: t.lineStart,
        suspicion: s,
        role: role.role,
        evidence: role.evidence,
        suggestion: role.role ? suggestName(t, role.role, members) : null,
        confidence: Number((role.confidence * s.score).toFixed(2)),
        members: { methods: members.methods.length, fields: members.fields.length },
      });
      if (findings.length >= limit) break;
    }
    findings.sort((a, b) => b.suspicion.score - a.suspicion.score || b.confidence - a.confidence);
  }

  /* Role census runs regardless of naming: it is navigation, not forensics. */
  let roles = null;
  const roleMap = new Array(index.types.length).fill(null);
  if (o.roles !== false) {
    const buckets = {};
    const byRole = {};
    const interesting = [];
    for (let i = 0; i < index.types.length; i++) {
      const t = index.types[i];
      const members = {
        fields: lookups.fieldsByType.get(i) || [],
        methods: lookups.methodsByType.get(i) || [],
      };
      const r = inferRole(t, members);
      roleMap[i] = { role: r.role, confidence: r.confidence };
      const key = r.role || 'unclassified';
      buckets[key] = (buckets[key] || 0) + 1;
      if (r.role && r.confidence >= 0.3) {
        if (!byRole[key]) byRole[key] = [];
        if (byRole[key].length < 40) {
          byRole[key].push({ name: fqName(t), kind: t.kind, typeDefIndex: t.typeDefIndex, line: t.lineStart, confidence: r.confidence, evidence: r.evidence });
        }
      }
      /* game-specific types: anything outside the BCL/Unity namespaces */
      const ns = t.namespace || '';
      if (!/^(System|Microsoft|Mono|Unity|UnityEngine|Newtonsoft|Fusion|PlayFab|Oculus|TMPro|JetBrains|nunit|AOT|Il2Cpp|Interop|Internal|LibCpp2IL)/.test(ns) && t.name !== '<Module>') {
        if (interesting.length < 400) interesting.push({ name: fqName(t), kind: t.kind, typeDefIndex: t.typeDefIndex, methods: t.methodCount, fields: t.fieldCount, parent: t.parent, line: t.lineStart });
      }
    }
    roles = { buckets, examples: byRole, gameSpecific: interesting };
  }

  return {
    threshold,
    scannedTypes: index.types.length,
    verdict: corpus.verdict,
    score: corpus.score,
    summary: corpus.summary,
    signals: corpus.signals,
    suspicious: findings.length,
    withSuggestion: findings.filter(f => f.suggestion).length,
    findings,
    roles,
    roleMap,
    note: 'Suggestions are inferred from members and base types. They are never written back to the dump.',
  };
}

module.exports = { analyse, corpusSignals, corpusVerdict, suspicion, inferRole, leafOf, entropy };
