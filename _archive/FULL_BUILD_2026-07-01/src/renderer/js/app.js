/* ============================================================================
   app.js — bootstrap, tab system, title bar, splash, settings application
   ========================================================================== */
(function (P) {
  'use strict';

  const { h, $, $$, hydrateIcons, initTooltips, bus, toast, icon } = P.dom;
  const M = (P.modules = P.modules || {});

  const ACCENTS = {
    aurora: ['#22d3ee', '#818cf8', '#e879f9', '#f472b6'],
    emerald: ['#34d399', '#22d3ee', '#818cf8', '#34d399'],
    sunset: ['#fbbf24', '#fb7185', '#e879f9', '#f472b6'],
    ocean: ['#38bdf8', '#6366f1', '#22d3ee', '#34d399'],
    violet: ['#a78bfa', '#e879f9', '#f472b6', '#c084fc'],
    mono: ['#e2e8f0', '#94a3b8', '#cbd5e1', '#f8fafc'],
  };

  const state = {
    config: null,
    appInfo: null,
    tabs: new Map(),
    activeTab: null,
    startedAt: Date.now(),
    ready: false,
  };

  /* ----------------------------------------------------------- tab system */

  /**
   * Tab architecture — register as many tabs as you like:
   *
   *   P.app.registerTab({
   *     id: 'test',                 // unique
   *     title: 'TEST',              // sidebar label
   *     icon: 'flask',              // icon name from dom.js
   *     tip: 'Testing playground',  // sidebar tooltip
   *     mount(container) { ... }    // builds the page, called once per switch
   *   });
   *
   * The sidebar, routing and per-tab lifecycle are handled here.
   */
  function registerTab(def) {
    if (!def || !def.id || !def.mount) return;
    state.tabs.set(def.id, def);
    renderSidebar();
  }

  function renderSidebar() {
    const nav = $('#side-nav');
    if (!nav) return;
    nav.innerHTML = '';
    for (const tab of state.tabs.values()) {
      nav.appendChild(h('button', {
        class: `nav-item${state.activeTab === tab.id ? ' active' : ''}`,
        onclick: () => activateTab(tab.id),
        'data-tip': tab.tip || tab.title,
        'data-tip-pos': 'right',
      },
        h('span', { html: icon(tab.icon || 'app', 17) }),
        h('span', { class: 'nav-label', text: tab.title }),
        tab.badge ? h('span', { class: 'badge', text: tab.badge }) : null,
      ));
    }
    hydrateIcons(nav);
  }

  function activateTab(id) {
    const tab = state.tabs.get(id);
    if (!tab) return;
    if (state.activeTab === id) return;
    state.activeTab = id;
    renderSidebar();
    const content = $('#content-inner');
    content.style.opacity = '0';
    content.style.transform = 'translateY(8px)';
    content.style.transition = 'opacity .18s ease, transform .18s ease';
    setTimeout(() => {
      content.innerHTML = '';
      tab.mount(content);
      requestAnimationFrame(() => {
        content.style.opacity = '1';
        content.style.transform = 'none';
      });
      hydrateIcons(content);
      bus.emit('tab:activated', id);
      bus.emit('log', { level: 'debug', message: `tab activated: ${tab.title}` });
    }, 180);
    const title = $('#tb-tab-title');
    if (title) title.textContent = tab.title;
  }

  /* --------------------------------------------------------- TEST tab */

  function mountTestTab(container) {
    const tpl = $('#tpl-tab-test');
    const node = tpl.content.firstElementChild.cloneNode(true);
    container.appendChild(node);

    // Each module owns one card of the TEST page.
    M.netlab.init(node);
    M.sysmon.init(node);
    M.timelab.init(node);
    M.animlab.init(node);
    M.perf.init(node);
    M.devtools.init(node);
    M.playground.init(node);
    M.utilities.init(node);

    bus.emit('test:mounted', node);
    return node;
  }

  /* --------------------------------------------------------- config */

  function applyConfig() {
    const cfg = state.config;
    if (!cfg) return;
    const root = document.documentElement;

    // accent palette
    const accent = ACCENTS[cfg.appearance.accent] || ACCENTS.aurora;
    accent.forEach((c, i) => root.style.setProperty(`--acc-${i + 1}`, c));
    root.style.setProperty('--grad', `linear-gradient(135deg, ${accent[0]}, ${accent[1]} 48%, ${accent[2]})`);
    root.style.setProperty('--grad-soft', `linear-gradient(135deg, ${P.charts.hexA(accent[0], 0.16)}, ${P.charts.hexA(accent[1], 0.16)} 48%, ${P.charts.hexA(accent[2], 0.16)})`);

    // aurora
    const aurora = $('#aurora');
    if (aurora) {
      aurora.style.display = cfg.appearance.bgAurora ? '' : 'none';
      aurora.querySelectorAll('.aur-blob').forEach(b => { b.style.setProperty('--bg-intensity', String(cfg.appearance.bgIntensity)); });
      aurora.querySelectorAll('.aur-blob').forEach((b, i) => {
        const base = [46, 58, 52, 64][i % 4];
        b.style.animationDuration = `${base / (cfg.animations.speed || 1)}s`;
      });
      const noise = aurora.querySelector('.aur-noise');
      if (noise) noise.style.display = cfg.appearance.noise === false ? 'none' : '';
    }

    // animation preferences
    document.body.classList.toggle('no-anim', cfg.animations.enabled === false);
    document.body.classList.toggle('reduce-motion', !!cfg.animations.reduceMotion);
    root.style.setProperty('--anim-speed', String(cfg.animations.speed || 1));

    // ui scale
    const scale = Math.min(1.3, Math.max(0.85, Number(cfg.ui.scale) || 1));
    document.body.style.zoom = String(scale);
  }

  async function saveConfig(patch) {
    state.config = await window.se-menu.config.set(patch);
    applyConfig();
    bus.emit('config:changed', state.config);
    return state.config;
  }

  P.app = {
    state,
    ACCENTS,
    registerTab,
    activateTab,
    applyConfig,
    saveConfig,
    setSideStatus(text, level) {
      const dot = $('#side-status-dot');
      const label = $('#side-status-text');
      if (dot) dot.className = 'dot' + (level ? ` ${level}` : '');
      if (label) label.textContent = text;
    },
    setUpdateDot(visible) {
      const btn = $('#btn-update');
      if (!btn) return;
      const existing = btn.querySelector('.tb-dot');
      if (visible && !existing) btn.appendChild(h('span', { class: 'tb-dot' }));
      if (!visible && existing) existing.remove();
    },
  };

  /* --------------------------------------------------------- titlebar */

  function wireTitlebar() {
    $('#btn-min').addEventListener('click', () => window.se-menu.win.minimize());
    $('#btn-max').addEventListener('click', () => window.se-menu.win.maximize());
    $('#btn-close').addEventListener('click', () => window.se-menu.win.close());
    $('#btn-settings').addEventListener('click', () => M.settings.open());
    $('#btn-update').addEventListener('click', () => M.updaterUI.openModal());

    const maxBtn = $('#btn-max');
    const setMaxIcon = maximized => {
      maxBtn.innerHTML = icon(maximized ? 'minimize' : 'maximize', 16);
      maxBtn.dataset.tip = maximized ? 'Restore' : 'Maximize';
    };
    window.se-menu.win.onMaximized(setMaxIcon);
    window.se-menu.win.isMaximized().then(setMaxIcon);

    $('#tb-version').textContent = `v${state.appInfo.version}`;
    $('#side-meta').textContent = `v${state.appInfo.version} · Electron ${state.appInfo.electron}`;
    document.title = `SE-MENU v${state.appInfo.version}`;

    // double-click titlebar toggles maximize
    document.querySelector('.titlebar-drag').addEventListener('dblclick', e => {
      if (e.target.closest('button')) return;
      window.se-menu.win.maximize();
    });
  }

  /* --------------------------------------------------------- chips + tick */

  function wireChips() {
    const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
    bus.on('chip:cpu', v => set('#chip-cpu', v == null ? '—' : `${Math.round(v)}%`));
    bus.on('chip:ram', v => set('#chip-ram', v == null ? '—' : `${Math.round(v)}%`));
    bus.on('chip:ping', v => set('#chip-ping', v == null ? '—' : `${Math.round(v)} ms`));
    bus.on('chip:fps', v => set('#chip-fps', v == null ? '—' : Math.round(v)));
    bus.on('chip:uptime', v => set('#chip-uptime', v == null ? '—' : v));

    window.se-menu.sys.onTick(data => bus.emit('sys:tick', data));
    bus.on('sys:tick', data => {
      bus.emit('chip:cpu', data.cpu ? data.cpu.load : null);
      bus.emit('chip:ram', data.mem ? data.mem.percent : null);
      bus.emit('chip:uptime', data.uptime != null ? P.dom.fmtUptime(data.uptime) : null);
    });
  }

  /* --------------------------------------------------------- global wiring */

  function wireGlobal() {
    document.addEventListener('visibilitychange', () => bus.emit('visibility', document.hidden));
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        M.settings.open();
      }
    });
    bus.on('log', ({ level, message }) => {
      if (M.devtools && M.devtools.log) M.devtools.log(level || 'info', message);
    });
    window.addEventListener('error', e => {
      if (M.devtools && M.devtools.log) M.devtools.log('error', `uncaught: ${e.message}`);
    });
    window.addEventListener('unhandledrejection', e => {
      if (M.devtools && M.devtools.log) M.devtools.log('error', `unhandled rejection: ${e.reason}`);
    });
  }

  /* --------------------------------------------------------- boot */

  async function boot() {
    const status = $('#splash-status');
    const setStatus = t => { if (status) status.textContent = t; };

    try {
      setStatus('loading configuration…');
      state.appInfo = await window.se-menu.app.info();
      state.config = await window.se-menu.config.get();
      applyConfig();

      setStatus('warming up sensors…');
      if (new URLSearchParams(location.search).has('lowfx')) document.body.classList.add('lowfx');
      hydrateIcons(document);
      initTooltips();
      wireTitlebar();
      wireChips();
      wireGlobal();

      M.updaterUI.init({ appInfo: state.appInfo });

      registerTab({
        id: 'test',
        title: 'TEST',
        icon: 'flask',
        tip: 'Testing playground — every probe in one place',
        mount: mountTestTab,
      });
      activateTab('test');

      await document.fonts.ready.catch(() => {});
      await new Promise(r => setTimeout(r, 450));

      setStatus('ready');
      $('#app').style.visibility = 'visible';
      $('#splash').classList.add('hidden');
      state.ready = true;
      bus.emit('app:ready');

      if (window.se-menu.isSelftest) {
        setTimeout(() => M.selftest.run(), 600);
      }
    } catch (err) {
      console.error('[boot]', err);
      setStatus(`failed to start: ${err.message}`);
      toast({ type: 'error', title: 'Startup failed', message: err.message, timeout: 8000 });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.SEMENU);
