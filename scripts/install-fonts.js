// Copies the bundled font files from node_modules into assets/fonts so the
// packaged app ships with its own typography and never depends on a CDN.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets', 'fonts');

const FILES = [
  ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter-var.woff2'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', 'jetbrains-mono-400.woff2'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2', 'jetbrains-mono-500.woff2'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2', 'jetbrains-mono-700.woff2'],
];

fs.mkdirSync(outDir, { recursive: true });

let copied = 0;
for (const [from, to] of FILES) {
  const src = path.join(root, 'node_modules', from);
  const dest = path.join(outDir, to);
  try {
    if (!fs.existsSync(src)) {
      console.warn(`[fonts] missing ${from} — skipping (system font fallback will be used)`);
      continue;
    }
    fs.copyFileSync(src, dest);
    copied++;
  } catch (err) {
    console.warn(`[fonts] failed to copy ${from}: ${err.message}`);
  }
}

console.log(`[fonts] ${copied}/${FILES.length} font files installed into assets/fonts`);
