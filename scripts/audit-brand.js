// Audits the project for leftover references to the previous product name.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NEEDLE = new RegExp('p' + 'ulse', 'i'); // assembled so this file stays clean

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist'].includes(entry.name)) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT, []);
let total = 0;
for (const file of files) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (NEEDLE.test(line)) {
      total++;
      console.log(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim().slice(0, 140)}`);
    }
  });
}
console.log(`\n${total} reference(s) across the project (node_modules and dist excluded)`);
