'use strict';

/**
 * SE-MENU — main process.
 * Frameless transparent window, custom title bar, system/network engines,
 * automatic update pipeline, tray, diagnostics and self-test harness.
 */

const {
  app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, Notification,
  powerMonitor, nativeImage, screen, desktopCapturer,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const { SystemProvider } = require('./system');
const net = require('./net');
const { Updater } = require('./updater');

const DEV = process.argv.includes('--dev');
const SELFTEST = process.argv.includes('--selftest');

// Under self-test the window may sit behind other windows; Windows then marks
// it occluded and Chromium suspends requestAnimationFrame. Disable occlusion
// accounting so the measurements reflect a real user session.
if (SELFTEST) {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const PROJECT = path.join(__dirname, '..', '..');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('com.se-menulabs.console');
  Menu.setApplicationMenu(null);
  bootstrap();
}

/* ------------------------------------------------------------- app state */

let win = null;
let tray = null;
let provider = null;
let updater = null;
let config = null;
let stressWorker = null;
let selftestRendererReport = null;
let selftestWritten = false;

const DEFAULT_CONFIG = {
  appearance: { accent: 'aurora', bgAurora: true, bgIntensity: 0.85, blur: 18, noise: true },
  animations: { enabled: true, speed: 1, reduceMotion: false },
  ui: { scale: 1, compact: false },
  notifications: { toasts: true, sound: false, duration: 4200 },
  network: {
    pingHost: '1.1.1.1',
    pingIntervalMs: 1000,
    pingHistory: 120,
    speedDownUrl: 'https://speed.cloudflare.com/__down?bytes=25000000',
    speedUpUrl: 'https://speed.cloudflare.com/__up',
    speedDurationMs: 12000,
  },
  app: { launchOnStartup: false, minimizeToTray: true, closeToTray: false },
};

/* ---------------------------------------------------------------- helpers */

function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over || {})) {
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch (e) { /* first run */ }
  config = deepMerge(DEFAULT_CONFIG, saved);
  return config;
}

function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  } catch (e) { /* non-fatal */ }
}

function appInfo() {
  return {
    name: 'SE-MENU',
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    hostname: os.hostname(),
    userData: app.getPath('userData'),
    execPath: process.execPath,
    isPackaged: app.isPackaged,
    cwd: process.cwd(),
  };
}

function logCrash(where, err) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), `[${new Date().toISOString()}] ${where}: ${err && err.stack || err}\n`);
  } catch (e) { /* noop */ }
}

process.on('uncaughtException', err => logCrash('uncaughtException', err));
process.on('unhandledRejection', err => logCrash('unhandledRejection', err));

/* ----------------------------------------------------------------- window */

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1120,
    minHeight: 760,
    x: undefined,
    y: undefined,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    icon: path.join(ASSETS, 'icon.png'),
    title: 'SE-MENU',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false,
      enableWebSQL: false,
    },
  });

  const query = {};
  if (SELFTEST) query.selftest = '1';
  if (DEV) query.dev = '1';
  if (process.argv.includes('--lowfx')) query.lowfx = '1';
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), Object.keys(query).length ? { query } : undefined);

  // surface renderer console output in the terminal (diagnostics + self-test)
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const where = `${(sourceId || '').split('/').pop()}:${line || 0}`;
    if (level >= 3) console.error(`[renderer] ${message}  (${where})`);
    else if (level === 2) console.warn(`[renderer] ${message}  (${where})`);
    else console.log(`[renderer] ${message}  (${where})`);
  });
  win.webContents.on('render-process-gone', (event, details) => {
    console.error('[renderer] render process gone:', details);
  });
  win.webContents.on('unresponsive', () => {
    console.error('[renderer] unresponsive');
  });

  win.once('ready-to-show', () => {
    win.show();
    if (DEV) win.webContents.openDevTools({ mode: 'detach' });
  });

  win.on('maximize', () => { if (win) win.webContents.send('win:maximized', true); });
  win.on('unmaximize', () => { if (win) win.webContents.send('win:maximized', false); });
  win.on('close', e => {
    if (config && config.app.closeToTray && tray && !app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => { win = null; });
}

function buildTray() {
  try {
    const image = nativeImage.createFromPath(path.join(ASSETS, 'icon-32.png'));
    tray = new Tray(image);
    tray.setToolTip('SE-MENU');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show SE-MENU', click: () => { if (win) { win.show(); win.focus(); } } },
      { label: 'Check for updates', click: () => { if (win) win.webContents.send('updater:checkNow'); } },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
    ]));
    tray.on('click', () => { if (win) { win.isVisible() ? win.hide() : win.show(); } });
  } catch (e) {
    logCrash('tray', e);
  }
}

/* -------------------------------------------------------------- ipc: misc */

function registerIpc() {
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        logCrash(`ipc:${channel}`, e);
        return { error: e.message };
      }
    });
  };

  handle('win:minimize', () => { if (win) win.minimize(); });
  handle('win:maximize', () => { if (!win) return; win.isMaximized() ? win.unmaximize() : win.maximize(); });
  handle('win:close', () => { if (win) win.close(); });
  handle('win:isMaximized', () => !!(win && win.isMaximized()));

  handle('sys:info', () => provider.snapshot());

  handle('net:ping', (host, timeout) => net.ping(host, timeout));
  handle('net:interfaces', () => net.interfaces());
  handle('net:externalIP', (url) => net.externalIP(url));
  handle('net:dns', (host, type) => net.dnsLookup(host, type));
  handle('net:http', (opts) => net.httpRequest(opts));
  handle('net:speedtest', ({ kind, url, durationMs }) => {
    const onProgress = p => { if (win) win.webContents.send('net:speed:progress', p); };
    return kind === 'upload'
      ? net.uploadTest({ url, durationMs }, onProgress)
      : net.downloadTest({ url, durationMs }, onProgress);
  });
  handle('net:traceroute', (host) => net.traceroute(host, hop => { if (win) win.webContents.send('net:trace:hop', hop); }));

  handle('config:get', () => config);
  handle('config:set', (patch) => { config = deepMerge(config, patch); saveConfig(); return config; });
  handle('config:reset', () => { config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); saveConfig(); return config; });
  handle('app:info', () => appInfo());
  handle('app:setStartup', enabled => {
    try { app.setLoginItemSettings({ openAtLogin: !!enabled }); } catch (e) { /* noop */ }
    return { ok: true };
  });
  handle('app:relaunch', () => { app.relaunch(); app.quit(); });
  handle('app:quit', () => { app.isQuitting = true; app.quit(); });

  handle('dialog:save', async ({ defaultName = 'report.json', data = '', encoding = 'utf8', filters, base64 = false }) => {
    const res = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters: filters || [{ name: 'All files', extensions: ['*'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    const buf = base64 ? Buffer.from(data, 'base64') : Buffer.from(data, encoding);
    fs.writeFileSync(res.filePath, buf);
    return { ok: true, path: res.filePath };
  });

  handle('dialog:openFile', async ({ properties = ['openFile'], filters } = {}) => {
    const res = await dialog.showOpenDialog(win, { properties, filters });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
    return { ok: true, path: res.filePaths[0] };
  });

  handle('file:hash', ({ filePath, algo = 'sha256' }) => new Promise(resolve => {
    let hash;
    try { hash = crypto.createHash(algo); } catch (e) { return resolve({ ok: false, error: e.message }); }
    let size = 0;
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => {
      hash.update(chunk);
      size += chunk.length;
      if (win) win.webContents.send('file:hash:progress', { size });
    });
    stream.on('end', () => resolve({ ok: true, hash: hash.digest('hex'), size, algo }));
    stream.on('error', err => resolve({ ok: false, error: err.message }));
  }));

  handle('shell:openExternal', url => shell.openExternal(url));
  handle('shell:showItemInFolder', p => shell.showItemInFolder(p));
  handle('shell:openPath', p => shell.openPath(p));

  handle('desktopCapturer:getSources', async (opts) => {
    const sources = await desktopCapturer.getSources(opts || { types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
    return sources.map(s => ({
      id: s.id, name: s.name, display_id: s.display_id,
      thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : '',
    }));
  });

  handle('screen:displays', () => ({
    primary: describeDisplay(screen.getPrimaryDisplay()),
    all: screen.getAllDisplays().map(describeDisplay),
    cursor: screen.getCursorScreenPoint(),
  }));

  handle('notify', ({ title, body }) => {
    const n = new Notification({ title: title || 'SE-MENU', body: body || '', icon: path.join(ASSETS, 'icon.png') });
    n.show();
    return true;
  });

  /* ------------------------------------------------------------ updater */

  handle('updater:config:get', () => updater.config);
  handle('updater:state:get', () => updater.state);
  handle('updater:config:set', (patch) => updater.updateConfig(patch));
  handle('updater:check', () => updater.check({ manual: true }));
  handle('updater:download', () => updater.download());
  handle('updater:install', () => updater.install());
  handle('updater:skip', (version) => updater.skip(version));
  handle('updater:resetSkipped', () => updater.resetSkipped());
  handle('updater:openDownloaded', () => { if (updater.downloadedPath) return shell.openPath(updater.downloadedPath); return { ok: false }; });
  handle('updater:showDownloaded', () => { if (updater.downloadedPath) return shell.showItemInFolder(updater.downloadedPath); return { ok: false }; });

  /* ---------------------------------------------------------- performance */

  handle('perf:benchmark', iterations => runBenchmark(iterations));
  handle('stress:start', seconds => startStress(seconds));
  handle('stress:stop', () => stopStress());

  /* ------------------------------------------------------------ selftest */

  handle('selftest:report', (results) => {
    selftestRendererReport = results;
    console.log('[main] renderer self-test report received:', results ? `${results.passed}/${results.total}` : 'none');
    return { ok: true };
  });
  handle('selftest:screenshot', async () => {
    if (!win) return { ok: false };
    const img = await win.webContents.capturePage();
    const target = path.join(PROJECT, 'selftest.png');
    fs.writeFileSync(target, img.toPNG());
    return { ok: true, path: target };
  });
}

function describeDisplay(d) {
  return {
    id: d.id,
    label: d.label || '',
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    colorDepth: d.colorDepth,
    refreshRate: d.refreshRate || d.displayFrequency || 0,
    internal: d.internal || false,
    touch: d.touchSupport || 'unknown',
  };
}

/* -------------------------------------------------------------- benchmark */

const BENCH_WORKER_SRC = `
const { parentPort } = require('worker_threads');
function bench(n) {
  let acc = 0;
  const t0 = process.hrtime.bigint();
  for (let iter = 0; iter < n; iter++) {
    const N = 20000;
    const sieve = new Uint8Array(N + 1);
    let primes = 0;
    for (let i = 2; i <= N; i++) {
      if (!sieve[i]) { primes++; for (let j = i * i; j <= N; j += i) sieve[j] = 1; }
    }
    const S = 128;
    const a = new Float64Array(S * S), b = new Float64Array(S * S), c = new Float64Array(S * S);
    for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
      a[i * S + j] = Math.sin(i * 0.7 + j * 0.3);
      b[i * S + j] = Math.cos(i * 0.1 - j * 0.5);
    }
    for (let i = 0; i < S; i++) for (let k = 0; k < S; k++) {
      const av = a[i * S + k];
      for (let j = 0; j < S; j++) c[i * S + j] += av * b[k * S + j];
    }
    for (let i = 0; i < c.length; i++) acc += c[i];
    acc += primes;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { ms, checksum: Math.abs(acc % 100000), iterations: n };
}
parentPort.on('message', n => parentPort.postMessage(bench(n || 3)));
`;

function runBenchmark(iterations = 3) {
  return new Promise(resolve => {
    let worker;
    try {
      worker = new Worker(BENCH_WORKER_SRC, { eval: true });
    } catch (e) {
      return resolve({ ok: false, error: e.message });
    }
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ ok: false, error: 'benchmark timed out' });
    }, 90000);
    worker.once('message', msg => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ ok: true, ...msg });
    });
    worker.once('error', err => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
    worker.postMessage(iterations);
  });
}

/* ----------------------------------------------------------------- stress */

const STRESS_WORKER_SRC = `
const { parentPort } = require('worker_threads');
parentPort.on('message', ({ seconds }) => {
  const start = Date.now();
  let ops = 0;
  let last = start;
  while (Date.now() - start < seconds * 1000) {
    const t0 = Date.now();
    while (Date.now() - t0 < 500) {
      for (let i = 0; i < 200000; i++) Math.sqrt(i * 1.618);
      ops++;
    }
    parentPort.postMessage({ elapsed: Date.now() - start, ops, done: false });
    last = Date.now();
  }
  parentPort.postMessage({ elapsed: Date.now() - start, ops, done: true });
});
`;

function startStress(seconds = 10) {
  stopStress();
  try {
    stressWorker = new Worker(STRESS_WORKER_SRC, { eval: true });
    stressWorker.on('message', msg => { if (win) win.webContents.send('stress:progress', msg); });
    stressWorker.on('exit', () => { if (win) win.webContents.send('stress:done'); });
    stressWorker.postMessage({ seconds: Math.min(120, Math.max(1, seconds | 0)) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function stopStress() {
  if (stressWorker) {
    stressWorker.terminate();
    stressWorker = null;
  }
  return { ok: true };
}

/* --------------------------------------------------------------- selftest */

async function runSelftest() {
  const report = {
    ts: new Date().toISOString(),
    app: appInfo(),
    checks: [],
    renderer: selftestRendererReport,
  };
  // Make sure the window is actually visible and focused: Chromium suspends
  // requestAnimationFrame on occluded windows, which would skew UI checks.
  try {
    if (win) {
      win.show();
      win.focus();
      win.moveTop();
      win.setAlwaysOnTop(true);
    }
  } catch (e) { /* noop */ }
  const add = (name, ok, detail) => report.checks.push({ name, ok: !!ok, detail });

  try {
    const p = await net.ping('1.1.1.1', 2500);
    add('ping.parse', typeof p.ms === 'number' || p.ok === false, p);
  } catch (e) { add('ping.parse', false, e.message); }

  try {
    const d = await net.dnsLookup('example.com', 'A');
    add('dns.resolve', d.ok, d);
  } catch (e) { add('dns.resolve', false, e.message); }

  try {
    const s = provider.snapshot();
    add('sys.snapshot', !!(s && s.cpu && s.mem && s.mem.total > 0), { cpu: s.cpu.load, memPercent: s.mem.percent, disks: s.disk.length });
  } catch (e) { add('sys.snapshot', false, e.message); }

  try {
    const cfg = updater.config;
    add('updater.config', !!cfg && !!cfg.mode, cfg);
  } catch (e) { add('updater.config', false, e.message); }

  try {
    const h = await net.httpRequest({ method: 'GET', url: 'https://example.com', timeoutMs: 8000 });
    add('http.request', h.status > 0, { status: h.status, ms: h.timeMs });
  } catch (e) { add('http.request', false, e.message); }

  // give the renderer self-test time to finish and report back
  for (let i = 0; i < 75 && !selftestRendererReport; i++) {
    await new Promise(r => setTimeout(r, 200));
  }

  // screenshot the running UI, then quit
  const outDir = app.isPackaged ? app.getPath('userData') : PROJECT;
  try {
    await new Promise(r => setTimeout(r, 800));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, 'selftest.png'), img.toPNG());
    add('screenshot', true, { path: path.join(outDir, 'selftest.png') });
  } catch (e) { add('screenshot', false, e.message); }

  report.renderer = selftestRendererReport;
  const target = path.join(outDir, 'selftest-report.json');
  try {
    fs.writeFileSync(target, JSON.stringify(report, null, 2));
    console.log('[selftest] report written to', target);
  } catch (e) {
    console.error('[selftest] could not write report:', e.message);
  }
  selftestWritten = true;
  setTimeout(() => app.quit(), 400);
}

/* ------------------------------------------------------------- power/tick */

function setupPower() {
  try {
    powerMonitor.on('on-ac', () => { if (win) win.webContents.send('power:event', { type: 'on-ac' }); });
    powerMonitor.on('on-battery', () => { if (win) win.webContents.send('power:event', { type: 'on-battery' }); });
    powerMonitor.on('suspend', () => { if (win) win.webContents.send('power:event', { type: 'suspend' }); });
    powerMonitor.on('resume', () => { if (win) win.webContents.send('power:event', { type: 'resume' }); });
  } catch (e) { logCrash('powerMonitor', e); }
}

function applyStartupSetting() {
  try {
    app.setLoginItemSettings({ openAtLogin: !!(config && config.app.launchOnStartup) });
  } catch (e) { /* noop */ }
}

/* --------------------------------------------------------------- startup */

async function bootstrap() {
  await app.whenReady();
  loadConfig();
  applyStartupSetting();
  provider = new SystemProvider();
  updater = new Updater(app, app.getVersion());
  createWindow();
  registerIpc();
  buildTray();
  setupPower();

  updater.on('state', state => {
    if (win) win.webContents.send('updater:state', state);
  });
  win.webContents.on('did-finish-load', () => {
    if (win) win.webContents.send('updater:state', updater.state);
  });

  setInterval(() => {
    if (win && !win.isDestroyed()) win.webContents.send('sys:tick', provider.snapshot());
  }, 2000);

  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });

  app.on('before-quit', () => { app.isQuitting = true; });

  // Startup update check (only when a real server is configured and due).
  setTimeout(() => {
    if (updater.config.autoCheck && updater.isConfigured()) {
      const due = Date.now() - (updater.config.lastCheck || 0) > (updater.config.checkIntervalHours || 6) * 3600 * 1000;
      if (due) updater.check();
    }
  }, 5000);

  // Periodic check: wakes every 15 minutes and runs a check when the
  // configured interval has elapsed.
  setInterval(() => {
    if (!updater.config.autoCheck || !updater.isConfigured()) return;
    const intervalMs = (updater.config.checkIntervalHours || 6) * 3600 * 1000;
    if (Date.now() - (updater.config.lastCheck || 0) > intervalMs) updater.check();
  }, 15 * 60 * 1000);

  if (SELFTEST) {
    setTimeout(() => { runSelftest().catch(e => { logCrash('selftest', e); app.quit(); }); }, 5000);
  }

  // Screenshot tour (development utility): captures the page in sections.
  if (process.argv.includes('--shots')) {
    setTimeout(async () => {
      try {
        const stops = [0, 850, 1700, 2550, 3400, 4250, 5100, 5950, 6800, 7650];
        for (let i = 0; i < stops.length; i++) {
          await win.webContents.executeJavaScript(`document.getElementById('content-scroll').scrollTop = ${stops[i]}; true;`);
          await new Promise(r => setTimeout(r, 650));
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(PROJECT, `shot-${String(i).padStart(2, '0')}.png`), img.toPNG());
        }
        // modal tours
        const modals = [
          ['btn-settings', 'shot-settings'],
          ['btn-update', 'shot-updater'],
        ];
        for (const [id, name] of modals) {
          await win.webContents.executeJavaScript(`document.getElementById('${id}').click(); true;`);
          await new Promise(r => setTimeout(r, 800));
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(PROJECT, `${name}.png`), img.toPNG());
          await win.webContents.executeJavaScript(`document.querySelector('.modal-close').click(); true;`);
          await new Promise(r => setTimeout(r, 400));
        }
        console.log('[shots] tour captured');
      } catch (e) {
        console.error('[shots] failed', e);
      }
      app.quit();
    }, 4500);
  }
}

module.exports = { appInfo };
