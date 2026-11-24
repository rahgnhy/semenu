// Branding scrub helper — one-pass alternation over the whole project.
//
// Terms are assembled at runtime so this file never contains the literal brand
// string (a previous version scrubbed itself and lost its own search terms).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SELF = path.join(__dirname, 'scrub-brand.js');

const P = 'P';
const ULSE = 'ULSE';
const OLD = P + ULSE;          // previous brand, upper case
const OLDC = P + 'ulse';       // previous brand, mixed case

const SPECIFIC = [
  ['com.' + P + 'ulselabs.console', 'com.sside.semenu'],
  ['data-icon="' + OLDC + '"', 'data-icon="wave"'],
  [OLD + ': \'<path', 'wave: \'<path'],
  ["'Blur " + OLDC + "'", "'Fog drift'"],
  ['{ value: \'' + OLDC + '\' }', '{ value: \'breathe\' }'],
  ['value="' + OLDC + '"', 'value="breathe"'],
  ['>' + OLDC + '<', '>Breathe<'],
  ['>Blur ' + OLDC + '<', '>Fog drift<'],
  ['anim-type-' + OLDC, 'anim-type-breathe'],
  ['anim-' + OLDC, 'anim-breathe'],
  ['fog-' + OLDC, 'fog-drift'],
  ['blur-' + OLDC, 'fog-drift'],
  [OLDC + '-dot', 'dot-breathe'],
  [OLDC + '-diagnostics-', 'se-menu-diagnostics-'],
  [OLDC + '-screenshot-', 'se-menu-screenshot-'],
  [OLDC + '.reactionBest', 'se-menu.reactionBest'],
  ['window.' + OLD, 'window.SEMENU'],
  ['window.' + OLDC, 'window.seMenu'],
  [OLD + ' Labs', 'sside'],
  [OLD + '-Setup', 'se-menu-Setup'],
  [OLD + '-Portable', 'se-menu-Portable'],
  [OLD + '-Update', 'SE-MENU-Update'],
  [OLD + '-Updater', 'SE-MENU-Updater'],
  [OLD + ' TEST CONSOLE', 'SE-MENU'],
  [OLD + ' — Test Console', 'SE-MENU'],
  [OLDC + '-test-console', 'se-menu'],
];

const RX = new RegExp(
  SPECIFIC.map(([from]) => from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).concat([OLD, OLDC, 'p' + 'ulse']).join('|'),
  'g'
);

function replaceBrand(text) {
  return text.replace(RX, match => {
    for (const [from, to] of SPECIFIC) if (match === from) return to;
    if (match === OLD || match === OLDC) return 'SE-MENU';
    return 'se-menu';
  });
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const targets = process.argv.slice(2);
let files;
if (!targets.length) {
  files = walk(ROOT, []);
} else {
  files = [];
  for (const t of targets) walk(path.join(ROOT, t), files);
}

let changed = 0;
for (const file of files) {
  if (path.resolve(file) === path.resolve(SELF)) continue;
  if (!/\.(js|html|css|md|json|yml|py)$/i.test(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = replaceBrand(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed++;
    console.log('[scrub]', path.relative(ROOT, file));
  }
}
console.log(`[scrub] ${changed} file(s) updated`);
