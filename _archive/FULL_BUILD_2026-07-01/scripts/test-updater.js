// Development probe: exercises the real updater pipeline against a local
// release server — manifest fetch, version compare, resumable download,
// SHA-256 verification, corrupt-download rejection and state transitions.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Updater } = require('../src/main/updater');

const VERSION = '99.0.0';
const FILE_SIZE = 2 * 1024 * 1024;
const payload = crypto.randomBytes(FILE_SIZE);
const sha = crypto.createHash('sha256').update(payload).digest('hex');
const fileName = `se-menu-Setup-${VERSION}.exe`;

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

const server = http.createServer((req, res) => {
  const port = server.address().port;
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      version: VERSION,
      downloadUrl: `http://127.0.0.1:${port}/${fileName}`,
      sha256: sha,
      notes: 'Test release with a longer note body.\nSecond line.',
      fileName,
    }));
    return;
  }
  if (url.pathname === '/manifest-equal.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: '1.0.0', downloadUrl: `http://127.0.0.1:${port}/${fileName}`, sha256: sha, fileName }));
    return;
  }
  if (url.pathname === '/manifest-corrupt.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      version: VERSION,
      downloadUrl: `http://127.0.0.1:${port}/${fileName}`,
      sha256: crypto.createHash('sha256').update('something else').digest('hex'),
      fileName,
    }));
    return;
  }
  if (url.pathname === `/${fileName}`) {
    const range = req.headers.range;
    if (range) {
      const m = range.match(/bytes=(\d+)-(\d*)/);
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : payload.length - 1;
      const chunk = payload.slice(start, end + 1);
      res.writeHead(206, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': chunk.length,
        'Content-Range': `bytes ${start}-${end}/${payload.length}`,
      });
      res.end(chunk);
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': payload.length,
      'Accept-Ranges': 'bytes',
    });
    res.end(payload);
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

function makeUpdater(userData, currentVersion) {
  const fakeApp = { getPath: () => userData, isPackaged: false, quit: () => {} };
  return new Updater(fakeApp, currentVersion || '1.0.0');
}

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    // 1. not configured
    const userData1 = fs.mkdtempSync(path.join(os.tmpdir(), 'se-menu-upd-'));
    const u1 = makeUpdater(userData1);
    const s1 = await u1.check();
    check('unconfigured endpoint reports notConfigured', s1.phase === 'notConfigured', s1.phase);

    // 2. up to date
    const userData2 = fs.mkdtempSync(path.join(os.tmpdir(), 'se-menu-upd-'));
    const u2 = makeUpdater(userData2);
    u2.updateConfig({ mode: 'custom', customManifestUrl: `${base}/manifest-equal.json` });
    const s2 = await u2.check();
    check('equal version reports upToDate', s2.phase === 'upToDate', s2.phase);

    // 3. available + download + verify
    const userData3 = fs.mkdtempSync(path.join(os.tmpdir(), 'se-menu-upd-'));
    const u3 = makeUpdater(userData3);
    u3.updateConfig({ mode: 'custom', customManifestUrl: `${base}/manifest.json` });
    const seen = [];
    u3.on('state', s => seen.push(s.phase));
    const s3 = await u3.check();
    check('newer version reports available', s3.phase === 'available', `${s3.phase} latest=${s3.latest}`);
    check('manifest metadata parsed', s3.latest === VERSION && /Test release/.test(s3.notes), `latest=${s3.latest}`);
    const s4 = await u3.download();
    check('download completes', s4.phase === 'downloaded', s4.phase);
    check('integrity verified', s4.verified === true, `verified=${s4.verified}`);
    const downloaded = path.join(os.tmpdir(), fileName);
    const onDisk = crypto.createHash('sha256').update(fs.readFileSync(downloaded)).digest('hex');
    check('downloaded bytes match published digest', onDisk === sha, `${onDisk.slice(0, 16)}…`);
    check('progress events emitted', seen.includes('downloading'), seen.join(' → '));

    // 4. resume: pre-seed a partial file and confirm the final bytes verify
    const userData4 = fs.mkdtempSync(path.join(os.tmpdir(), 'se-menu-upd-'));
    const u4 = makeUpdater(userData4);
    u4.updateConfig({ mode: 'custom', customManifestUrl: `${base}/manifest.json` });
    await u4.check();
    const partPath = `${downloaded}.part`;
    fs.writeFileSync(partPath, payload.slice(0, 1000));
    const s5 = await u4.download();
    check('interrupted download resumes and verifies', s5.phase === 'downloaded' && s5.verified === true, s5.phase);
    const resumed = crypto.createHash('sha256').update(fs.readFileSync(downloaded)).digest('hex');
    check('resumed bytes match published digest', resumed === sha);

    // 5. corrupt download rejected
    const userData5 = fs.mkdtempSync(path.join(os.tmpdir(), 'se-menu-upd-'));
    const u5 = makeUpdater(userData5);
    u5.updateConfig({ mode: 'custom', customManifestUrl: `${base}/manifest-corrupt.json` });
    await u5.check();
    const s6 = await u5.download();
    check('checksum mismatch is rejected', s6.phase === 'error' && /integrity/i.test(s6.error || ''), s6.error);

    // 6. version comparison
    check('semver compare: 1.10.0 > 1.9.9', require('../src/main/updater').isNewer('1.10.0', '1.9.9'));
    check('semver compare: prerelease ordering', require('../src/main/updater').compareVersions('2.0.0-beta.1', '2.0.0') < 0);
  } catch (e) {
    check('updater probe exception', false, e.message);
  } finally {
    server.close();
    // cleanup downloaded artifacts
    try { fs.unlinkSync(path.join(os.tmpdir(), fileName)); } catch (e) { /* noop */ }
    try { fs.unlinkSync(`${path.join(os.tmpdir(), fileName)}.part`); } catch (e) { /* noop */ }
    console.log(failures ? `\n${failures} failure(s)` : '\nall updater checks passed');
    process.exit(failures ? 1 : 0);
  }
});
