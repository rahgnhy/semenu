/* ============================================================================
   devtools.js — Developer Console: event log, console mirror, diagnostics,
   connectivity checks, background task status, test history, report export.
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, $$, clear, toast, bus, fmtBytes, fmtInt, fmtMbps, icon, escapeHtml } = P.dom;

  const MAX_LOG = 600;
  let refs = null;
  let logEntries = [];
  let consoleEntries = [];
  let historyEntries = [];
  let filter = 'all';
  let consoleHooked = false;
  let appInfoCache = null;
  // Rendering the whole log on every entry churns DOM and triggers GC —
  // coalesce updates into at most one paint per frame.
  let renderQueued = false;
  let logDirty = false;
  let consoleDirty = false;

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (!refs) return;
      if (logDirty) { logDirty = false; renderLog(); }
      if (consoleDirty) { consoleDirty = false; renderConsole(); }
    });
  }

  /* ------------------------------------------------------------- logging */

  function fmtArg(a) {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return a.stack || a.message;
    try { return JSON.stringify(a, null, 0)?.slice(0, 600) ?? String(a); } catch (e) { return String(a); }
  }

  function log(level, message) {
    const entry = {
      t: Date.now(),
      level,
      message: String(message == null ? '' : message).slice(0, 1200),
    };
    logEntries.push(entry);
    if (logEntries.length > MAX_LOG) logEntries.shift();
    if (refs && !refs.log.classList.contains('hidden')) { logDirty = true; scheduleRender(); }
    if (refs && refs.logCount) refs.logCount.textContent = String(logEntries.length);
    bus.emit('devtools:log', entry);
  }

  function renderLog() {
    if (!refs) return;
    const view = refs.log;
    const nearBottom = view.scrollTop + view.clientHeight >= view.scrollHeight - 40;
    clear(view);
    const entries = filter === 'all' ? logEntries : logEntries.filter(e => e.level === filter);
    const slice = entries.slice(-300);
    for (const e of slice) {
      const time = new Date(e.t).toLocaleTimeString('en-GB', { hour12: false }) + `.${String(e.t % 1000).padStart(3, '0')}`;
      view.appendChild(h('div', { class: `log-line ${e.level}` },
        h('span', { class: 'lt', text: time }),
        h('span', { class: 'lm', text: e.message }),
      ));
    }
    if (!slice.length) view.appendChild(h('div', { class: 'empty-state', text: 'Log is empty' }));
    if (nearBottom) view.scrollTop = view.scrollHeight;
  }

  function renderConsole() {
    if (!refs) return;
    const view = refs.console;
    const nearBottom = view.scrollTop + view.clientHeight >= view.scrollHeight - 40;
    clear(view);
    for (const e of consoleEntries.slice(-300)) {
      const time = new Date(e.t).toLocaleTimeString('en-GB', { hour12: false });
      view.appendChild(h('div', { class: `log-line ${e.level}` },
        h('span', { class: 'lt', text: time }),
        h('span', { class: 'lm', text: e.message }),
      ));
    }
    if (!consoleEntries.length) view.appendChild(h('div', { class: 'empty-state', text: 'Console output will appear here' }));
    if (nearBottom) view.scrollTop = view.scrollHeight;
  }

  function hookConsole() {
    if (consoleHooked) return;
    consoleHooked = true;
    const map = { log: 'info', info: 'info', warn: 'warn', error: 'error', debug: 'debug' };
    for (const [method, level] of Object.entries(map)) {
      const orig = console[method] ? console[method].bind(console) : () => {};
      console[method] = (...args) => {
        const text = args.map(fmtArg).join(' ');
        consoleEntries.push({ t: Date.now(), level, message: text.slice(0, 1200) });
        if (consoleEntries.length > MAX_LOG) consoleEntries.shift();
        if (refs && refs.console && !refs.console.closest('.dev-pane').classList.contains('hidden')) { consoleDirty = true; scheduleRender(); }
        orig(...args);
      };
    }
  }

  /* -------------------------------------------------------- diagnostics */

  async function renderDiagnostics() {
    if (!refs) return;
    if (!appInfoCache) appInfoCache = await window.seMenu.app.info();
    const info = appInfoCache;
    clear(refs.diag);
    const mk = (title, pairs) => {
      const box = h('div', { class: 'subpanel' },
        h('div', { class: 'subpanel-title', text: title }));
      const dl = h('dl', { class: 'kv' });
      for (const [k, v] of pairs) {
        dl.appendChild(h('dt', { text: k }));
        dl.appendChild(h('dd', { text: v == null ? '—' : String(v) }));
      }
      box.appendChild(dl);
      return box;
    };
    refs.diag.appendChild(mk('Application', [
      ['Name', info.name],
      ['Version', `v${info.version}`],
      ['Electron', info.electron],
      ['Chromium', info.chrome],
      ['Node', info.node],
      ['V8', info.v8],
    ]));
    refs.diag.appendChild(mk('Operating system', [
      ['Platform', `${info.platform} (${info.arch})`],
      ['Release', info.release],
      ['Hostname', info.hostname],
      ['User data', info.userData],
      ['Executable', info.execPath],
      ['Packaged', info.isPackaged ? 'yes' : 'no (dev mode)'],
    ]));
    let displays = null;
    try { displays = await window.seMenu.screen.displays(); } catch (e) { /* noop */ }
    refs.diag.appendChild(mk('Displays', displays ? [
      ['Primary', `${displays.primary.label || 'display'} ${displays.primary.bounds.width}×${displays.primary.bounds.height}`],
      ['Scale factor', `${displays.primary.scaleFactor}×`],
      ['Color depth', `${displays.primary.colorDepth}-bit`],
      ['Refresh rate', `${displays.primary.refreshRate || '—'} Hz`],
      ['Connected', String(displays.all.length)],
      ['Viewport', `${window.innerWidth}×${window.innerHeight} @ ${window.devicePixelRatio}×`],
    ] : [['Status', 'unavailable']]));
    const heap = performance.memory;
    refs.diag.appendChild(mk('Renderer runtime', [
      ['JS heap used', heap ? fmtBytes(heap.usedJSHeapSize) : '—'],
      ['JS heap total', heap ? fmtBytes(heap.totalJSHeapSize) : '—'],
      ['Heap limit', heap ? fmtBytes(heap.jsHeapSizeLimit) : '—'],
      ['Device pixel ratio', String(window.devicePixelRatio || 1)],
      ['Touch points', String(navigator.maxTouchPoints || 0)],
      ['Logical CPUs', String(navigator.hardwareConcurrency || '—')],
    ]));
    bus.emit('log', { level: 'info', message: 'diagnostics rendered' });
  }

  /* -------------------------------------------------------- connectivity */

  async function updateEndpointsList() {
    if (!refs) return;
    let cfg = {};
    try { cfg = await window.seMenu.updater.getConfig(); } catch (e) { cfg = {}; }
    let updateUrl = 'not configured';
    if (cfg.mode === 'custom' && cfg.customManifestUrl) updateUrl = cfg.customManifestUrl;
    else if (cfg.mode === 'github' && cfg.githubRepo) updateUrl = `https://api.github.com/repos/${cfg.githubRepo}/releases/${cfg.channel === 'beta' ? '?per_page=10' : 'latest'}`;
    const list = [
      { id: 'update', name: 'Update server', url: updateUrl, method: 'GET' },
      { id: 'ipify', name: 'Public IP service', url: 'https://api.ipify.org?format=json', method: 'GET' },
      { id: 'cloudflare', name: 'Speed test endpoint', url: 'https://speed.cloudflare.com/__down?bytes=1000', method: 'GET' },
      { id: 'github', name: 'GitHub API', url: 'https://api.github.com', method: 'GET' },
    ];
    clear(refs.api);
    for (const ep of list) {
      const row = h('div', { class: 'list-row', style: 'border:1px solid var(--stroke);background:var(--panel-2);padding:10px 12px' },
        h('div', { class: 'lr-icon', html: icon(ep.id === 'update' ? 'download-cloud' : 'globe', 13) }),
        h('div', { class: 'lr-text' },
          h('div', { class: 'lr-title', text: ep.name }),
          h('div', { class: 'lr-sub', text: ep.url, style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }),
        ),
        h('div', { class: 'row center ep-result', style: 'gap:7px' },
          h('span', { class: 'badge ep-badge', text: 'idle' }),
          h('span', { class: 'mono ep-time', style: 'font-size:.7rem;color:var(--text-3);min-width:56px;text-align:right', text: '—' }),
          h('button', { class: 'btn btn-sm btn-ghost ep-test', text: 'Test', 'data-id': ep.id }),
        ),
      );
      refs.api.appendChild(row);
      row.querySelector('.ep-test').addEventListener('click', () => testEndpoint(ep, row));
    }
    const head = h('div', { class: 'row between center', style: 'margin-bottom:10px' },
      h('div', { class: 'muted', style: 'font-size:.78rem' }, 'Round-trip time and HTTP status for each external endpoint.'),
      h('button', { class: 'btn btn-sm', id: 'api-run-all', html: `${icon('play', 14)} Run all` }),
    );
    refs.api.prepend(head);
    refs.api.querySelector('#api-run-all').addEventListener('click', async () => {
      const rows = $$('.list-row', refs.api);
      for (const row of rows) {
        const id = row.querySelector('.ep-test').dataset.id;
        const ep = list.find(x => x.id === id);
        await testEndpoint(ep, row);
      }
    });
  }

  async function testEndpoint(ep, row) {
    const badge = row.querySelector('.ep-badge');
    const time = row.querySelector('.ep-time');
    if (ep.url === 'not configured') {
      badge.className = 'badge warn';
      badge.textContent = 'not configured';
      time.textContent = '—';
      return;
    }
    badge.className = 'badge';
    badge.textContent = 'testing…';
    time.textContent = '—';
    const res = await window.seMenu.net.http({ method: ep.method || 'GET', url: ep.url, timeoutMs: 9000 });
    if (res && res.status) {
      const ok = res.status < 400;
      badge.className = 'badge ' + (ok ? 'ok' : 'err');
      badge.textContent = `HTTP ${res.status}`;
      time.textContent = `${res.timeMs} ms`;
      bus.emit('log', { level: ok ? 'info' : 'warn', message: `connectivity ${ep.name}: HTTP ${res.status} in ${res.timeMs} ms` });
    } else {
      badge.className = 'badge err';
      badge.textContent = 'failed';
      time.textContent = '—';
      bus.emit('log', { level: 'warn', message: `connectivity ${ep.name} failed: ${res && res.error}` });
    }
  }

  /* -------------------------------------------------------------- tasks */

  function renderTasks() {
    if (!refs) return;
    const tasks = [];
    const net = M.netlab && M.netlab.state ? M.netlab.state() : { ping: false, speed: false };
    const anim = M.animlab && M.animlab.state ? M.animlab.state() : { playing: false };
    const perfState = M.perf && M.perf.state ? M.perf.state() : { fps: false };
    const updaterState = M.updaterUI && M.updaterUI.state ? M.updaterUI.state() : { phase: 'unknown' };

    tasks.push({ name: 'System telemetry', detail: 'OS CPU / memory / disk / GPU snapshot', interval: '2 s', status: 'active' });
    tasks.push({ name: 'Ping monitor', detail: 'ICMP round-trip sampler', interval: '1 s', status: net.ping ? 'active' : 'idle' });
    tasks.push({ name: 'Speed test', detail: 'HTTP download / upload throughput', interval: 'on demand', status: net.speed ? 'running' : 'idle' });
    tasks.push({ name: 'Frame rate sampler', detail: 'requestAnimationFrame delta monitor', interval: 'per frame', status: perfState.fps ? 'active' : 'paused' });
    tasks.push({ name: 'Heap sampler', detail: 'JavaScript heap usage', interval: '1 s', status: perfState.fps ? 'active' : 'paused' });
    tasks.push({ name: 'Animation chart', detail: 'Synthetic preview data feed', interval: '420 ms', status: anim.playing ? 'active' : 'idle' });
    tasks.push({ name: 'Update checker', detail: 'Release manifest poll', interval: '6 h', status: updaterState.phase });
    tasks.push({ name: 'Power monitor', detail: 'AC / battery / suspend events', interval: 'event', status: 'active' });

    clear(refs.tasks);
    for (const t of tasks) {
      const isActive = /active|running/.test(t.status);
      refs.tasks.appendChild(h('div', { class: 'list-row', style: 'border:1px solid var(--stroke);background:var(--panel-2);padding:10px 12px' },
        h('div', { class: 'lr-icon', html: icon(isActive ? 'activity' : 'clock', 13) }),
        h('div', { class: 'lr-text' },
          h('div', { class: 'lr-title', text: t.name }),
          h('div', { class: 'lr-sub', text: t.detail }),
        ),
        h('div', { class: 'row center', style: 'gap:12px' },
          h('span', { class: 'mono muted', style: 'font-size:.68rem', text: t.interval }),
          h('span', { class: 'badge ' + (isActive ? 'ok' : ''), text: t.status }),
        ),
      ));
    }
    if (!refs.tasksTimer) {
      refs.tasksTimer = setInterval(() => { if (refs && !refs.tasks.closest('.dev-pane').classList.contains('hidden')) renderTasks(); }, 3000);
    }
  }

  /* ------------------------------------------------------------ history */

  function recordTest(entry) {
    historyEntries.unshift({
      t: Date.now(),
      name: entry.name,
      ok: entry.ok !== false,
      detail: entry.detail || '',
      durationMs: entry.durationMs || 0,
    });
    if (historyEntries.length > 60) historyEntries.pop();
    renderHistory();
  }

  function renderHistory() {
    if (!refs) return;
    clear(refs.history);
    if (!historyEntries.length) {
      refs.history.appendChild(h('div', { class: 'empty-state', text: 'No tests recorded yet — run a benchmark, speed test or the self-test.' }));
      return;
    }
    for (const e of historyEntries) {
      const time = new Date(e.t).toLocaleTimeString('en-GB', { hour12: false });
      refs.history.appendChild(h('div', { class: 'list-row' },
        h('div', { class: 'lr-icon', html: icon(e.ok ? 'check-circle' : 'x-circle', 13) }),
        h('div', { class: 'lr-text' },
          h('div', { class: 'lr-title', text: e.name }),
          h('div', { class: 'lr-sub', text: `${time} · ${e.detail}` }),
        ),
        h('div', { class: 'lr-value', text: e.durationMs ? `${e.durationMs.toFixed(0)} ms` : '' }),
      ));
    }
  }

  /* ------------------------------------------------------------ actions */

  async function exportReport() {
    const info = appInfoCache || await window.seMenu.app.info();
    const report = {
      generator: 'SE-MENU Test Console',
      exportedAt: new Date().toISOString(),
      app: info,
      runtime: {
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
        heap: performance.memory ? {
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit,
        } : null,
      },
      tests: historyEntries,
      logs: logEntries.slice(-400),
      console: consoleEntries.slice(-200),
    };
    const json = JSON.stringify(report, null, 2);
    const res = await window.seMenu.dialog.save({
      defaultName: `se-menu-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      data: json,
      filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'All files', extensions: ['*'] }],
    });
    if (res && res.ok) {
      toast({ type: 'success', title: 'Report exported', message: res.path });
      bus.emit('log', { level: 'success', message: `diagnostic report exported → ${res.path}` });
    } else if (res && res.canceled) {
      /* user cancelled */
    }
  }

  async function copyLogs() {
    const text = logEntries.map(e => `[${new Date(e.t).toISOString()}] ${e.level.toUpperCase()} ${e.message}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast({ type: 'success', title: 'Logs copied', message: `${logEntries.length} entries on the clipboard.` });
    } catch (e) {
      toast({ type: 'warn', title: 'Clipboard unavailable', message: e.message });
    }
  }

  function clearLogs() {
    logEntries = [];
    consoleEntries = [];
    renderLog();
    renderConsole();
    if (refs) refs.logCount.textContent = '0';
    bus.emit('log', { level: 'warn', message: 'logs cleared' });
  }

  /* --------------------------------------------------------------- init */

  M.devtools = {
    log,
    recordTest,

    init(root) {
      refs = {
        tabs: $('#dev-tabs', root),
        log: $('#dev-log', root),
        console: $('#dev-console', root),
        diag: $('#dev-diag', root),
        api: $('#dev-api', root),
        tasks: $('#dev-tasks', root),
        history: $('#dev-history', root),
        logCount: $('#dev-log-count', root),
        exportBtn: $('#dev-export', root),
        copyBtn: $('#dev-copy', root),
        clearBtn: $('#dev-clear', root),
      };

      hookConsole();

      $$('.tab', refs.tabs).forEach(tab => {
        tab.addEventListener('click', () => {
          $$('.tab', refs.tabs).forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const name = tab.dataset.devTab;
          $$('.dev-pane', root).forEach(p => p.classList.toggle('hidden', p.dataset.devPane !== name));
          if (name === 'diag') renderDiagnostics();
          if (name === 'api') updateEndpointsList();
          if (name === 'tasks') renderTasks();
          if (name === 'history') renderHistory();
        });
      });

      refs.exportBtn.addEventListener('click', exportReport);
      refs.copyBtn.addEventListener('click', copyLogs);
      refs.clearBtn.addEventListener('click', clearLogs);

      bus.on('test:record', recordTest);

      renderLog();
      renderConsole();
      log('info', 'developer console initialized');
    },

    destroy() {
      if (refs && refs.tasksTimer) clearInterval(refs.tasksTimer);
      refs = null;
    },
  };
})(window.SEMENU);
