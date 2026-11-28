#!/usr/bin/env node
/* ============================================================================
   clean-dist.js - empty dist/ before a build.

   electron-builder never removes old installers, so every release left the
   previous one behind and dist/ turned into a pile of 105 MB exes. This wipes
   the output folder first; the build then owns everything in it.

   The path is checked before anything is deleted: only <project>/dist is ever
   touched.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

if (path.dirname(dist) !== root || path.basename(dist) !== 'dist') {
  console.error(`refusing to clean ${dist}: not this project's dist folder`);
  process.exit(1);
}

function sizeOf(p) {
  try {
    const st = fs.lstatSync(p);
    if (st.isDirectory()) {
      let total = 0;
      for (const name of fs.readdirSync(p)) total += sizeOf(path.join(p, name));
      return total;
    }
    return st.size;
  } catch (e) {
    return 0;
  }
}

if (!fs.existsSync(dist)) {
  console.log('dist/ does not exist yet; nothing to clean');
  process.exit(0);
}

const entries = fs.readdirSync(dist);
let bytes = 0;
let removed = 0;
for (const name of entries) {
  const p = path.join(dist, name);
  bytes += sizeOf(p);
  try {
    fs.rmSync(p, { recursive: true, force: true });
    removed++;
  } catch (e) {
    console.error(`could not remove ${p}: ${e.message}`);
    process.exitCode = 1;
  }
}

console.log(`cleaned ${removed} item(s), ${(bytes / 1048576).toFixed(1)} MB from dist`);
