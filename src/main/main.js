'use strict';

/**
 * SE-MENU — main process.
 * Frameless transparent window, custom title bar, system/network engines,
 * automatic update pipeline, tray, diagnostics and self-test harness.
 */

const {
  app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, Notification,
  powerMonitor, nativeImage, screen, desktopCapturer, session, globalShortcut,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Worker } = require('worker_threads');
const { SystemProvider } = require('./system');
const net = require('./net');
const { Updater } = require('./updater');

const DEV = process.argv.includes('--dev');
const SELFTEST = process.argv.includes('--selftest');

// Rendering pipeline tweaks: rasterise on the GPU and avoid an extra copy
// step for tile textures. Safe on all supported GPUs, measurable win on
// integrated graphics.
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

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
  app.setAppUserModelId('com.sside.semenu');
  Menu.setApplicationMenu(null);
  bootstrap();
}

/* ------------------------------------------------------------- app state */

let win = null;
let tray = null;
let provider = null;
let updater = null;
let opencodeResetProc = null;
let opencodeResetProcs = { app: null, terminal: null };
let config = null;
let stressWorker = null;
let selftestRendererReport = null;
let selftestWritten = false;

const DEFAULT_CONFIG = {
  appearance: { accent: 'violet', glassTransparency: 0.088, glassBlur: 16 },
  animations: { enabled: true, speed: 1, reduceMotion: false },
  ui: { scale: 0.9, compact: false },
  notifications: { toasts: true, native: false, duration: 4200 },
  background: { style: 'liquid', speed: 1, intensity: 1, blur: 0, brightness: 1, opacity: 1, quality: 'high', enabled: true },
  network: {
    pingHost: '1.1.1.1',
    pingIntervalMs: 1000,
    pingHistory: 120,
    speedDownUrl: 'https://speed.cloudflare.com/__down?bytes=25000000',
    speedUpUrl: 'https://speed.cloudflare.com/__up',
    speedDurationMs: 12000,
  },
  app: { launchOnStartup: false, minimizeToTray: true, closeToTray: false },
  window: null,
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

// Restore target for unmaximize. Kept in memory so a frameless window that
// reports a full-screen "normal" rect can never trap the user at full size.
const DEFAULT_WINDOW = { width: 1100, height: 650 };
let lastNormalBounds = null;

function displayFor(b) {
  try {
    if (b && Number.isFinite(b.x) && Number.isFinite(b.y)) {
      return screen.getDisplayMatching({ x: b.x, y: b.y, width: 1, height: 1 });
    }
  } catch (e) { /* noop */ }
  return screen.getPrimaryDisplay();
}

function defaultBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(DEFAULT_WINDOW.width, area.width - 60);
  const height = Math.min(DEFAULT_WINDOW.height, area.height - 60);
  return {
    width,
    height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
  };
}

// A saved "normal" rectangle the size of the work area is not a real restore
// target — it makes unmaximize look like a no-op. Treat it as invalid.
function sanitizeBounds(saved) {
  if (!saved || !saved.width || !saved.height) return null;
  const w = Math.round(saved.width);
  const h = Math.round(saved.height);
  const area = displayFor(saved).workArea;
  if (w < 900 || h < 540) return null;
  if (w >= area.width * 0.94 && h >= area.height * 0.9) return null;
  const x = Number.isFinite(saved.x) ? Math.round(saved.x) : Math.round(area.x + (area.width - w) / 2);
  const y = Number.isFinite(saved.y) ? Math.round(saved.y) : Math.round(area.y + (area.height - h) / 2);
  return {
    width: Math.min(w, area.width),
    height: Math.min(h, area.height),
    x: Math.min(Math.max(x, area.x - 40), area.x + area.width - 160),
    y: Math.min(Math.max(y, area.y), area.y + area.height - 120),
  };
}

// After an unmaximize, if the window came back at work-area size, push it to
// the remembered normal rectangle instead.
function enforceRestoredSize() {
  if (!win || win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return;
  const b = win.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const nearFull = b.width >= area.width - 24 && b.height >= area.height - 24;
  if (!nearFull) return;
  const target = lastNormalBounds && !(
    lastNormalBounds.width >= area.width - 24 && lastNormalBounds.height >= area.height - 24
  ) ? lastNormalBounds : defaultBounds();
  lastNormalBounds = target;
  win.setBounds(target, true);
}

function createWindow() {
  const saved = (config && config.window) || {};
  const bounds = sanitizeBounds(saved) || defaultBounds();
  lastNormalBounds = bounds;
  win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 900,
    minHeight: 540,
    x: bounds.x,
    y: bounds.y,
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
  if (saved.maximized) {
    try { win.maximize(); } catch (e) { /* noop */ }
  }
  // The native DWM shadow follows the window rectangle, which fights the
  // rounded CSS frame. Disable it so the only elevation is the rounded shadow
  // painted by #app itself.
  try { win.setHasShadow(false); } catch (e) { /* noop */ }

  const query = {};
  if (SELFTEST) query.selftest = '1';
  if (DEV) query.dev = '1';
  if (process.argv.includes('--lowfx')) query.lowfx = '1';
  if (process.argv.includes('--shots')) query.shots = '1';

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
  win.on('unmaximize', () => {
    if (!win) return;
    win.webContents.send('win:maximized', false);
    setTimeout(enforceRestoredSize, 60);
  });
  win.on('resize', persistBounds);
  win.on('move', persistBounds);
  win.on('close', e => {
    persistBounds();
    if (config && config.app.closeToTray && tray && !app.isQuitting) {
      e.preventDefault();
      win.hide();
      return;
    }
  });
  win.on('closed', () => { win = null; });
  win.on('show', () => {
    if (win && !win.isDestroyed()) win.webContents.send('win:shown', true);
  });
}

let boundsTimer = null;
function persistBounds() {
  if (!win || win.isDestroyed()) return;
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => {
    try {
      if (!win || win.isDestroyed()) return;
      const maximized = win.isMaximized();
      const minimized = win.isMinimized();
      const fullscreen = win.isFullScreen();
      if (!maximized && !minimized && !fullscreen) {
        const live = win.getBounds();
        lastNormalBounds = {
          width: Math.round(live.width),
          height: Math.round(live.height),
          x: Math.round(live.x),
          y: Math.round(live.y),
        };
      }
      const b = maximized ? (lastNormalBounds || win.getNormalBounds()) : win.getBounds();
      config.window = {
        width: Math.round(b.width),
        height: Math.round(b.height),
        x: Math.round(b.x),
        y: Math.round(b.y),
        maximized,
      };
      saveConfig();
    } catch (e) { /* window already gone */ }
  }, 350);
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

  /* ---------- opencode reset tokens ---------- */
  const opencodeResetBatPath = () => {
    // prefer the user's installed/official OpenCode Infinite launcher so it
    // uses the same state (last folder, chats/context, settings) as normal use
    const local = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
    const official = path.join(local, 'opencode-infinite', 'app', 'OpenCode Infinite.bat');
    if (fs.existsSync(official)) return official;
    const bundled = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'OpenCode-Infinite.bat')
      : path.join(__dirname, '..', '..', 'assets', 'OpenCode-Infinite.bat');
    if (fs.existsSync(bundled)) return bundled;
    // fallback: legacy local path (dev convenience)
    const legacy = 'C:\\Users\\rayan\\Downloads\\OpenCode Infinite (updated).bat';
    if (fs.existsSync(legacy)) return legacy;
    return bundled;
  };
  if (!opencodeResetProcs) opencodeResetProcs = { app: null, terminal: null };
  const sendOpencodeReset = (channel, payload) => {
    if (win && !win.isDestroyed()) {
      try { win.webContents.send(channel, payload); } catch (e) { /* noop */ }
    }
  };
  const opencodeResetStatus = () => ({
    path: opencodeResetBatPath(),
    modes: {
      app: { running: !!(opencodeResetProcs.app && !opencodeResetProcs.app.killed), pid: opencodeResetProcs.app ? opencodeResetProcs.app.pid : null },
      terminal: { running: !!(opencodeResetProcs.terminal && !opencodeResetProcs.terminal.killed), pid: opencodeResetProcs.terminal ? opencodeResetProcs.terminal.pid : null },
    },
  });
  const stopOpencodeResetMode = (mode) => {
    const child = opencodeResetProcs[mode];
    if (!child) return { ok: true, running: false, mode };
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    } catch (e) {
      try { child.kill(); } catch (e2) { /* noop */ }
    }
    return { ok: true, mode };
  };
  handle('opencode-reset:start', (event, opts) => {
    const mode = (opts && opts.mode) === 'terminal' ? 'terminal' : 'app';
    if (opencodeResetProcs[mode] && !opencodeResetProcs[mode].killed) {
      return { ok: false, error: 'already running', mode };
    }
    const bat = opencodeResetBatPath();
    if (!fs.existsSync(bat)) {
      return { ok: false, error: `not found: ${bat}`, mode };
    }
    try {
      const cwd = path.dirname(bat);
      const comspec = process.env.ComSpec || 'cmd.exe';
      const escPs = (s) => String(s).replace(/'/g, "''");
      let psCmd;
      if (mode === 'terminal') {
        // Launch in a terminal/console window (cmd /k keeps the session open).
        psCmd = [
          `$bat='${escPs(bat)}'; $cwd='${escPs(cwd)}'; $com='${escPs(comspec)}';`,
          `$p = Start-Process -FilePath $com -ArgumentList @('/d','/k',('"' + $bat + '"')) -WorkingDirectory $cwd -PassThru;`,
          `$p.WaitForExit(); exit $p.ExitCode`,
        ].join(' ');
      } else {
        // Launch the bundled original .bat as the app (default handler / its own console).
        psCmd = [
          `$bat='${escPs(bat)}'; $cwd='${escPs(cwd)}';`,
          `$p = Start-Process -FilePath $bat -WorkingDirectory $cwd -PassThru;`,
          `$p.WaitForExit(); exit $p.ExitCode`,
        ].join(' ');
      }
      const child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psCmd], {
        cwd,
        windowsHide: true,
        stdio: 'ignore',
        env: Object.assign({}, process.env, {
          OPENCODE_OPEN_EXTERNAL: '1',
        }),
      });
      opencodeResetProcs[mode] = child;
      sendOpencodeReset('opencode-reset:data', `\r\n[se-menu:${mode}] starting bundled launcher:\r\n${bat}\r\n`);
      const st = Object.assign({ mode, event: 'start' }, opencodeResetStatus());
      sendOpencodeReset('opencode-reset:status', st);
      child.on('error', (err) => {
        sendOpencodeReset('opencode-reset:data', `\r\n[se-menu:${mode}] error: ${err.message}\r\n`);
        if (opencodeResetProcs[mode] === child) opencodeResetProcs[mode] = null;
        const stErr = Object.assign({ mode, event: 'error' }, opencodeResetStatus());
        sendOpencodeReset('opencode-reset:status', stErr);
        sendOpencodeReset('opencode-reset:exit', { mode, code: null, signal: null, error: err.message });
      });
      child.on('close', (code, signal) => {
        sendOpencodeReset('opencode-reset:data', `\r\n[se-menu:${mode}] closed (code ${code}${signal ? ', signal ' + signal : ''})\r\n`);
        if (opencodeResetProcs[mode] === child) opencodeResetProcs[mode] = null;
        const stClose = Object.assign({ mode, event: 'close' }, opencodeResetStatus());
        sendOpencodeReset('opencode-reset:status', stClose);
        sendOpencodeReset('opencode-reset:exit', { mode, code, signal });
      });
      return Object.assign({ ok: true, pid: child.pid, path: bat, mode }, st);
    } catch (e) {
      opencodeResetProcs[mode] = null;
      return { ok: false, error: e.message, mode };
    }
  });
  handle('opencode-reset:stop', (event, opts) => {
    const mode = opts && opts.mode;
    if (mode === 'app' || mode === 'terminal') return stopOpencodeResetMode(mode);
    stopOpencodeResetMode('app');
    stopOpencodeResetMode('terminal');
    return { ok: true };
  });
  handle('opencode-reset:write', (event, data) => {
    // legacy/no-op in external launcher modes
    return { ok: false, error: 'not running in embedded mode (use the launcher window for input)' };
  });
  handle('opencode-reset:check', async () => {
    const ps = (script) => new Promise((resolve) => {
      try {
        const child = spawn('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true });
        let out = '';
        child.stdout.on('data', d => { out += d.toString(); });
        child.stderr.on('data', d => { out += d.toString(); });
        child.on('close', () => resolve(out));
        child.on('error', () => resolve(''));
      } catch (e) { resolve(''); }
    });
    try {
      const procOut = await ps(`Get-Process | Where-Object { $_.ProcessName -match 'opencode' } | Select-Object ProcessName,Id | ConvertTo-Json -Compress`);
      let processes = [];
      try {
        const parsed = procOut ? JSON.parse(procOut.trim()) : [];
        const arr = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
        processes = arr.map(p => ({ name: p.ProcessName || p.processName || '', pid: p.Id || p.id || null })).filter(p => p.name);
      } catch (e) { processes = []; }
      const winOut = await ps(`Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle -match 'opencode|OpenCode' } | Select-Object ProcessName,Id,MainWindowTitle | ConvertTo-Json -Compress`);
      let windows = [];
      try {
        const parsed = winOut ? JSON.parse(winOut.trim()) : [];
        const arr = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
        windows = arr.map(w => `${w.MainWindowTitle || ''} (${w.ProcessName || ''} PID ${w.Id || ''})`.trim()).filter(Boolean);
      } catch (e) { windows = []; }
      return { ok: true, processes, windows };
    } catch (e) {
      return { ok: false, error: e.message, processes: [], windows: [] };
    }
  });
  handle('opencode-reset:status', () => opencodeResetStatus());

  /* ---------- il2cpp dumper ---------- */
  const il2cppToolPath = () => {
    const bundled = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'tools', 'il2cppdumper')
      : path.join(__dirname, '..', '..', 'assets', 'tools', 'il2cppdumper');
    return bundled;
  };
  const il2cppExePath = () => path.join(il2cppToolPath(), 'Il2CppDumper.exe');

  handle('il2cpp:pickApk', async () => {
    const { dialog } = require('electron');
    const res = await dialog.showOpenDialog(win, {
      title: 'Select APK',
      filters: [{ name: 'Android Package', extensions: ['apk'] }, { name: 'All', extensions: ['*'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths || !res.filePaths.length) return { ok: false, canceled: true };
    const p = res.filePaths[0];
    return { ok: true, path: p, name: path.basename(p) };
  });

  handle('il2cpp:dump', async (event, opts) => {
    const apkPath = opts && opts.apkPath;
    const xorKeyHex = (opts && opts.xorKey) ? String(opts.xorKey).trim() : '';
    if (!apkPath || !fs.existsSync(apkPath)) return { ok: false, error: 'APK not found' };
    const exe = il2cppExePath();
    if (!fs.existsSync(exe)) return { ok: false, error: 'Il2CppDumper tool not found: ' + exe };

    const workRoot = path.join(os.tmpdir(), 'semenu-il2cpp-' + Date.now());
    const extractDir = path.join(workRoot, 'extracted');
    const outDir = path.join(workRoot, 'output');
    try { fs.mkdirSync(workRoot, { recursive: true }); } catch (e) { /* noop */ }
    try { fs.mkdirSync(extractDir, { recursive: true }); } catch (e) { /* noop */ }
    try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) { /* noop */ }

    // 1. extract APK (zip) via PowerShell
    try {
      const ps = [
        'try {',
        `  Expand-Archive -LiteralPath '${apkPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
        '  exit 0',
        '} catch {',
        '  Write-Error $_.Exception.Message; exit 1',
        '}',
      ].join('; ');
      const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true, encoding: 'utf8' });
      if (r.status !== 0) {
        return { ok: false, error: 'APK extraction failed: ' + (r.stderr || r.stdout || 'unknown') };
      }
    } catch (e) {
      return { ok: false, error: 'APK extraction failed: ' + e.message };
    }

    // 2. find libil2cpp.so and global-metadata.dat
    let libPath = '';
    let metaPath = '';
    let arch = '';
    try {
      const findPs = [
        `$root = '${extractDir.replace(/'/g, "''")}'`,
        `$lib = Get-ChildItem -Path $root -Recurse -Filter 'libil2cpp.so' -ErrorAction SilentlyContinue | Select-Object -First 1`,
        `$meta = Get-ChildItem -Path $root -Recurse -Filter 'global-metadata.dat' -ErrorAction SilentlyContinue | Select-Object -First 1`,
        `Write-Output ('LIB=' + $(if($lib){$lib.FullName}else{''}))`,
        `Write-Output ('META=' + $(if($meta){$meta.FullName}else{''}))`,
        `Write-Output ('ARCH=' + $(if($lib){$lib.DirectoryName}else{''}))`,
      ].join('; ');
      const fr = spawnSync('powershell.exe', ['-NoProfile', '-Command', findPs], { windowsHide: true, encoding: 'utf8' });
      const lines = String(fr.stdout || '').split(/\r?\n/);
      for (const ln of lines) {
        const t = ln.trim();
        if (t.startsWith('LIB=')) libPath = t.slice(4);
        else if (t.startsWith('META=')) metaPath = t.slice(5);
        else if (t.startsWith('ARCH=')) {
          const d = t.slice(5);
          const m = d.match(/lib[\\\/]([^\\\/]+)/);
          if (m) arch = m[1];
        }
      }
    } catch (e) { /* noop */ }

    if (!libPath) return { ok: false, error: 'libil2cpp.so not found in APK (is this a Unity/IL2CPP game?)', outDir, extractDir };
    if (!metaPath) return { ok: false, error: 'global-metadata.dat not found in APK', outDir, extractDir };

    // detect encryption: standard magic 0xFAB11BAF (little-endian)
    let encrypted = false;
    try {
      const mb = fs.readFileSync(metaPath);
      const magic = mb.readUInt32LE(0);
      if (magic !== 0xFAB11BAF) encrypted = true;
    } catch (e) { /* noop */ }

    // apply XOR key if provided
    let metaToUse = metaPath;
    if (xorKeyHex) {
      try {
        const keyBytes = Buffer.from(xorKeyHex.replace(/\s+/g, ''), 'hex');
        if (keyBytes.length === 0) throw new Error('empty key');
        const mb = fs.readFileSync(metaPath);
        const out = Buffer.alloc(mb.length);
        for (let i = 0; i < mb.length; i++) out[i] = mb[i] ^ keyBytes[i % keyBytes.length];
        metaToUse = path.join(outDir, 'global-metadata.dec.dat');
        fs.writeFileSync(metaToUse, out);
        // verify
        if (out.readUInt32LE(0) !== 0xFAB11BAF) {
          return { ok: false, error: 'XOR key did not produce valid metadata magic. Check the key.', outDir, extractDir, libPath, metaPath, encrypted: true };
        }
      } catch (e) {
        return { ok: false, error: 'XOR decrypt failed: ' + e.message, outDir, extractDir };
      }
    } else if (encrypted) {
      return {
        ok: false,
        error: 'Metadata is encrypted/obfuscated (magic mismatch). Standard Il2CppDumper cannot read it. Provide a repeating XOR key (hex) if you know it, or use a game-specific deobfuscator.',
        outDir, extractDir, libPath, metaPath, encrypted: true,
      };
    }

    // 3. run Il2CppDumper
    try {
      const r = spawnSync(exe, [libPath, metaToUse, outDir], { cwd: il2cppToolPath(), windowsHide: true, encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 64 });
      if (r.status !== 0 && r.status !== null) {
        // non-zero may still have produced output; only fail if no dump.cs
      }
      const dumpCs = path.join(outDir, 'dump.cs');
      if (!fs.existsSync(dumpCs)) {
        return { ok: false, error: 'Il2CppDumper did not produce dump.cs. ' + (r.stderr || r.stdout || '').slice(0, 500), outDir, extractDir, libPath, metaPath };
      }
    } catch (e) {
      return { ok: false, error: 'Il2CppDumper failed: ' + e.message, outDir, extractDir };
    }

    // 4. collect output files
    const files = [];
    function walk(dir, base) {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, base);
        else {
          try {
            const st = fs.statSync(full);
            files.push({ name: path.relative(base, full), path: full, size: st.size });
          } catch (err) { /* noop */ }
        }
      }
    }
    walk(outDir, outDir);

    return {
      ok: true,
      outDir,
      extractDir,
      libPath,
      metaPath,
      arch: arch || 'unknown',
      encrypted: !!encrypted,
      metaPath,
      files,
      log: 'Dumped ' + files.length + ' files.',
    };
  });

  handle('il2cpp:readFile', (event, opts) => {
    const p = opts && opts.path;
    if (!p || !fs.existsSync(p)) return { ok: false, error: 'file not found' };
    try {
      const buf = fs.readFileSync(p);
      // try utf8
      let text = null;
      try { text = buf.toString('utf8'); } catch (e) { text = null; }
      // detect binary: if contains null bytes in first 1k, treat as binary
      const sample = buf.slice(0, 1024);
      const binary = sample.includes(0);
      if (binary) return { ok: true, binary: true, size: buf.length };
      return { ok: true, content: text, size: buf.length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  handle('il2cpp:saveFile', (event, opts) => {
    const p = opts && opts.path;
    if (!p) return { ok: false, error: 'no path' };
    try {
      fs.writeFileSync(p, String(opts.content == null ? '' : opts.content), 'utf8');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  handle('il2cpp:downloadFile', (event, opts) => {
    const p = opts && opts.path;
    if (!p || !fs.existsSync(p)) return { ok: false, error: 'file not found' };
    try {
      const name = opts.name || path.basename(p);
      const dest = path.join(app.getPath('downloads'), name);
      fs.copyFileSync(p, dest);
      return { ok: true, savedTo: dest };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  handle('il2cpp:downloadAll', (event, opts) => {
    const outDir = opts && opts.outDir;
    if (!outDir || !fs.existsSync(outDir)) return { ok: false, error: 'output folder not found' };
    try {
      const zipName = 'il2cpp-dump-' + Date.now() + '.zip';
      const dest = path.join(app.getPath('downloads'), zipName);
      const ps = [
        'try {',
        `  Compress-Archive -Path '${outDir.replace(/'/g, "''")}\\*' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`,
        '  exit 0',
        '} catch {',
        '  Write-Error $_.Exception.Message; exit 1',
        '}',
      ].join('; ');
      const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true, encoding: 'utf8' });
      if (r.status !== 0) return { ok: false, error: 'zip failed: ' + (r.stderr || r.stdout || 'unknown') };
      return { ok: true, savedTo: dest };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  handle('il2cpp:openFolder', (event, opts) => {
    const p = opts && opts.path;
    if (!p) return { ok: false, error: 'no path' };
    try {
      const { shell } = require('electron');
      shell.openPath(p);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

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

  app.on('before-quit', () => {
    app.isQuitting = true;
    // keep launched OpenCode launcher terminal(s) running when SE-MENU closes
    opencodeResetProc = null;
    try { globalShortcut.unregisterAll(); } catch (e) { /* noop */ }
  });

  // Startup update check is driven by the renderer splash flow so the result
  // can be surfaced there. This periodic timer keeps checking while running.
  setInterval(() => {
    if (!updater.config.autoCheck || !updater.isConfigured()) return;
    const intervalMs = (updater.config.checkIntervalHours || 6) * 3600 * 1000;
    if (Date.now() - (updater.config.lastCheck || 0) > intervalMs) updater.check();
  }, 15 * 60 * 1000);

  if (SELFTEST) {
    setTimeout(() => { runSelftest().catch(e => { logCrash('selftest', e); app.quit(); }); }, 5000);
  }

  // Splash capture helper (development): grabs the loading screen while it is live.
  if (process.argv.includes('--splashshot')) {
    setTimeout(async () => {
      try {
        const marks = [300, 900, 1800, 2800, 3800];
        let prev = 0;
        for (const t of marks) {
          await new Promise(r => setTimeout(r, t - prev));
          prev = t;
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(PROJECT, `splash-${t}.png`), img.toPNG());
        }
        // end-to-end: press the launch gate, then capture the workspace
        await win.webContents.executeJavaScript(`document.getElementById('sp-launch-btn').click(); true;`);
        await new Promise(r => setTimeout(r, 1400));
        const after = await win.webContents.capturePage();
        fs.writeFileSync(path.join(PROJECT, 'splash-launched.png'), after.toPNG());
        const gate = await win.webContents.executeJavaScript(
          `(() => { const s = document.getElementById('splash'); const a = document.getElementById('app'); return { splashHidden: s.classList.contains('hidden'), preLaunch: a.classList.contains('pre-launch') }; })()`
        );
        console.log('[splash] captured', JSON.stringify(gate));
      } catch (e) {
        console.error('[splash]', e.message);
      }
      app.quit();
    }, 1200);
  }

  // Window-control regression check (development): maximise, restore, log bounds.
  if (process.argv.includes('--wintest')) {
    setTimeout(async () => {
      const read = () => {
        const b = win.getBounds();
        return { x: b.x, y: b.y, w: b.width, h: b.height, max: win.isMaximized(), normal: lastNormalBounds };
      };
      console.log('[wintest] start', JSON.stringify(read()));
      await win.webContents.executeJavaScript(`(() => { const b = document.getElementById('sp-launch-btn'); if (b) b.click(); })(); true;`);
      await new Promise(r => setTimeout(r, 800));
      await win.webContents.executeJavaScript(`document.getElementById('btn-max').click(); true;`);
      await new Promise(r => setTimeout(r, 900));
      console.log('[wintest] after maximize', JSON.stringify(read()));
      await win.webContents.executeJavaScript(`document.getElementById('btn-max').click(); true;`);
      await new Promise(r => setTimeout(r, 900));
      console.log('[wintest] after restore', JSON.stringify(read()));
      await win.webContents.executeJavaScript(`document.getElementById('btn-min').click(); true;`);
      await new Promise(r => setTimeout(r, 900));
      console.log('[wintest] after minimize', JSON.stringify({ minimized: win.isMinimized() }));
      win.restore();
      await new Promise(r => setTimeout(r, 700));
      console.log('[wintest] after taskbar restore', JSON.stringify(read()));
      app.quit();
    }, 4000);
  }

  // Screenshot tour (development utility): captures the page in sections.
  if (process.argv.includes('--shots')) {
    const cfgPath = path.join(app.getPath('userData'), 'config.json');
    let cfgBackup = null;
    try { cfgBackup = fs.readFileSync(cfgPath); } catch (e) { cfgBackup = null; }
    setTimeout(async () => {
      try {
        // tab tours
        const stops2 = [
          ['opencode-reset', 'shot-opencode-reset'],
          ['settings', 'shot-settings'],
        ];
        for (const [tab, name] of stops2) {
          await win.webContents.executeJavaScript(`window.SEMENU.app.activateTab('${tab}'); true;`);
          await new Promise(r => setTimeout(r, 900));
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(PROJECT, `${name}.png`), img.toPNG());
        }
        // capture every background animation style from the Settings tab
        await win.webContents.executeJavaScript(`window.SEMENU.app.activateTab('settings'); true;`);
        await new Promise(r => setTimeout(r, 700));
        await win.webContents.executeJavaScript(`document.getElementById('content-scroll').scrollTop = 0; true;`);
        await new Promise(r => setTimeout(r, 500));
        {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(PROJECT, 'shot-bg-selector.png'), img.toPNG());
        }
        const styles = ['liquid', 'waves', 'atmospheric', 'particles', 'aurora', 'abstract'];
        for (const style of styles) {
          await win.webContents.executeJavaScript(
            `(() => { const t = document.querySelector('.bg-tile[data-style="${style}"]'); if (t) t.click(); })(); true;`
          );
          await new Promise(r => setTimeout(r, 900));
          // hide the panels so the raw animation can be evaluated
          await win.webContents.executeJavaScript(`document.querySelector('.app-body').style.display = 'none'; true;`);
          await new Promise(r => setTimeout(r, 700));
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(PROJECT, `bg-${style}.png`), img.toPNG());
          await win.webContents.executeJavaScript(`document.querySelector('.app-body').style.display = ''; true;`);
        }
        // updater modal
        await win.webContents.executeJavaScript(`document.getElementById('btn-update').click(); true;`);
        await new Promise(r => setTimeout(r, 900));
        {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(PROJECT, 'shot-updater.png'), img.toPNG());
        }
        console.log('[shots] tour captured');
      } catch (e) {
        console.error('[shots] failed', e);
      }
      // the tour clicks background tiles and scrolls tabs - put the user's
      // saved configuration back exactly as it was
      try { if (cfgBackup) fs.writeFileSync(cfgPath, cfgBackup); } catch (e) { /* noop */ }
      app.quit();
    }, 4500);
  }
}

module.exports = { appInfo };
