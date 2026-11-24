/* ============================================================================
   app.js — bootstrap, tab system, title bar, animated background wiring,
   window size memory and settings application.
   ========================================================================== */
(function (P) {
  'use strict';

  const { h, $, $$, hydrateIcons, initTooltips, bus, toast, icon } = P.dom;
  const M = (P.modules = P.modules || {});

  const ACCENTS = {
    violet: ['#a78bfa', '#8b7cf6', '#c4b5fd'],
    steel: ['#7fa8c9', '#5f88ab', '#a8c4dc'],
    sage: ['#7fb99a', '#5f9a7d', '#a8d4bd'],
    rose: ['#c98aa8', '#a86a88', '#e0b3c8'],
    amber: ['#c9a87f', '#a8885f', '#e0cba8'],
  };

  const state = {
    config: null,
    appInfo: null,
    tabs: new Map(),
    activeTab: null,
    bgEngine: null,
    startedAt: Date.now(),
  };

  /* ----------------------------------------------------------- tab system */

  /**
   * Tab architecture:
   *
   *   SEMENU.app.registerTab({
   *     id: 'test', title: 'Test', icon: 'flask',
   *     mount(container) { /* build the page *\/ }
   *   });
   *
   * The sidebar, routing, per-tab lifecycle and animated transitions are
   * handled here.
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
        h('span', { html: icon(tab.icon || 'app', 15) }),
        h('span', { class: 'nav-label', text: tab.title }),
        tab.badge ? h('span', { class: 'badge', text: tab.badge }) : null,
      ));
    }
    hydrateIcons(nav);
  }

  function activateTab(id) {
    const tab = state.tabs.get(id);
    if (!tab || state.activeTab === id) return;
    const previous = state.activeTab ? state.tabs.get(state.activeTab) : null;
    if (previous && typeof previous.unmount === 'function') {
      try { previous.unmount(); } catch (e) { console.error('[tab] unmount failed', e); }
    }
    state.activeTab = id;
    renderSidebar();
    const content = $('#content-inner');
    content.style.opacity = '0';
    content.style.transform = 'translateY(6px)';
    content.style.transition = 'opacity .16s ease, transform .16s ease';
    setTimeout(() => {
      content.innerHTML = '';
      tab.mount(content);
      requestAnimationFrame(() => {
        content.style.opacity = '1';
        content.style.transform = 'none';
      });
      hydrateIcons(content);
      bus.emit('tab:activated', id);
    }, 160);
    const title = $('#tb-tab-title');
    if (title) title.textContent = tab.title;
    const tabIcon = $('#tb-tab-icon');
    if (tabIcon) {
      tabIcon.innerHTML = icon(tab.icon || 'app', 14);
      hydrateIcons(tabIcon);
    }
  }

  /* -------------------------------------------------------------- tab pages */

  function mountSettingsTab(container) {
    const tpl = $('#tpl-tab-settings');
    const node = tpl.content.firstElementChild.cloneNode(true);
    container.appendChild(node);
    M.settings.mount(node);
    bus.emit('settings:mounted', node);
    return node;
  }

  function mountOpencodeResetTab(container) {
    const tpl = $('#tpl-tab-opencode-reset');
    const node = tpl.content.firstElementChild.cloneNode(true);
    container.appendChild(node);
    if (M.opencodeReset) M.opencodeReset.mount(node);
    bus.emit('opencode-reset:mounted', node);
    return node;
  }

  function mountIl2CppDumperTab(container) {
    const tpl = $('#tpl-tab-il2cpp-dumper');
    const node = tpl.content.firstElementChild.cloneNode(true);
    container.appendChild(node);
    if (M.il2cppDumper) M.il2cppDumper.mount(node);
    bus.emit('il2cpp-dumper:mounted', node);
    return node;
  }

  /* --------------------------------------------------------------- config */

  function applyConfig() {
    const cfg = state.config;
    if (!cfg) return;
    const root = document.documentElement;

    const accent = ACCENTS[cfg.appearance.accent] || ACCENTS.violet;
    accent.forEach((c, i) => root.style.setProperty(`--acc-${i + 1}`, c));
    root.style.setProperty('--grad', `linear-gradient(135deg, ${accent[0]}, ${accent[1]})`);
    root.style.setProperty('--grad-soft', `linear-gradient(135deg, ${P.charts.hexA(accent[0], 0.18)}, ${P.charts.hexA(accent[1], 0.08)})`);

    root.style.setProperty('--glass-alpha', String(Number(cfg.appearance.glassTransparency) || 0.075));
    root.style.setProperty('--glass-blur', `${Math.round(Number(cfg.appearance.glassBlur) || 20)}px`);

    document.body.classList.toggle('no-anim', cfg.animations.enabled === false);
    document.body.classList.toggle('reduce-motion', !!cfg.animations.reduceMotion);
    document.body.classList.toggle('compact', !!cfg.ui.compact);
    root.style.setProperty('--anim-speed', String(cfg.animations.speed || 1));

    const scale = Math.min(1.25, Math.max(0.78, Number(cfg.ui.scale) || 0.9));
    document.body.style.zoom = String(scale);

    // animated background
    const bg = cfg.background || {};
    const fallback = $('#bg-fallback');
    if (fallback) fallback.style.display = bg.enabled === false ? '' : 'none';
    if (state.bgEngine) {
      state.bgEngine.setStyle(bg.style || 'liquid');
      state.bgEngine.setSpeed(bg.speed == null ? 1 : bg.speed);
      state.bgEngine.setIntensity(bg.intensity == null ? 0.85 : bg.intensity);
      state.bgEngine.setBlur(bg.blur == null ? 0 : bg.blur);
      state.bgEngine.setBrightness(bg.brightness == null ? 1 : bg.brightness);
      state.bgEngine.setOpacity(bg.opacity == null ? 1 : bg.opacity);
      state.bgEngine.setQuality(bg.quality || 'high');
      state.bgEngine.setEnabled(bg.enabled !== false);
    }
  }

  function saveConfig(patch) {
    return window.seMenu.config.set(patch).then(cfg => {
      state.config = cfg;
      applyConfig();
      bus.emit('config:changed', cfg);
      return cfg;
    });
  }

  P.app = {
    state,
    ACCENTS,
    registerTab,
    activateTab,
    applyConfig,
    saveConfig,
    setSideStatus(text, level) {
      // kept for module compatibility — the sidebar shows a static version chip
    },
    setUpdateDot(visible) {
      const btn = $('#btn-update');
      if (!btn) return;
      const existing = btn.querySelector('.tb-dot');
      if (visible && !existing) btn.appendChild(h('span', { class: 'tb-dot' }));
      if (!visible && existing) existing.remove();
    },
  };

  /* ------------------------------------------------------------- titlebar */

  function wireTitlebar() {
    $('#btn-min').addEventListener('click', () => window.seMenu.win.minimize());
    $('#btn-max').addEventListener('click', () => window.seMenu.win.maximize());
    $('#btn-close').addEventListener('click', () => window.seMenu.win.close());
    $('#btn-settings').addEventListener('click', () => activateTab('settings'));
    $('#btn-update').addEventListener('click', () => M.updaterUI.openModal());

    const maxBtn = $('#btn-max');
    const setMaxIcon = maximized => {
      maxBtn.innerHTML = icon(maximized ? 'minimize' : 'maximize', 14);
      maxBtn.dataset.tip = maximized ? 'Restore' : 'Maximize';
    };
    window.seMenu.win.onMaximized(setMaxIcon);
    window.seMenu.win.isMaximized().then(setMaxIcon);

    const drag = document.querySelector('.titlebar-drag');
    if (drag) {
      drag.addEventListener('dblclick', e => {
        if (e.target.closest('button')) return;
        window.seMenu.win.maximize();
      });
    }

    const splashMark = $('#splash-mark');
    if (splashMark) splashMark.innerHTML = icon('se', 46);
    hydrateIcons(document);
  }

  /* ------------------------------------------------------------ chips/tick */

  function wireChips() {
    const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
    bus.on('chip:cpu', v => set('#chip-cpu', v == null ? '—' : `${Math.round(v)}%`));
    bus.on('chip:ram', v => set('#chip-ram', v == null ? '—' : `${Math.round(v)}%`));
    bus.on('chip:ping', v => set('#chip-ping', v == null ? '—' : `${Math.round(v)} ms`));
    bus.on('chip:fps', v => set('#chip-fps', v == null ? '—' : Math.round(v)));
    bus.on('chip:uptime', v => set('#chip-uptime', v == null ? '—' : v));

    window.seMenu.sys.onTick(data => {
      bus.emit('sys:tick', data);
      bus.emit('chip:cpu', data.cpu ? data.cpu.load : null);
      bus.emit('chip:ram', data.mem ? data.mem.percent : null);
      bus.emit('chip:uptime', data.uptime != null ? P.dom.fmtUptime(data.uptime) : null);
    });
  }

  /* -------------------------------------------------------- global wiring */

  function wireGlobal() {
    document.addEventListener('visibilitychange', () => bus.emit('visibility', document.hidden));
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        activateTab('settings');
      }
    });
    window.addEventListener('error', e => console.error('[runtime]', e.message));
    window.addEventListener('unhandledrejection', e => console.error('[runtime] unhandled rejection', e.reason));
    bus.on('log', ({ level, message }) => {
      if (M.devtools && M.devtools.log) M.devtools.log(level || 'info', message);
    });
  }

  /* ------------------------------------------------------- splash feed */

  const SP_STEPS = 8;
  let spDone = 0;
  let updateFoundDuringBoot = false;
  let splashUpdateDismissed = false;
  let launchArmed = false;

  function armLaunch() {
    const box = $('#sp-launch');
    if (!box) return;
    box.classList.remove('hidden');
    hydrateIcons(box);
    bus.emit('log', { level: 'info', message: 'workspace ready — waiting for manual launch' });
  }

  function doLaunch() {
    if (launchArmed) return;
    launchArmed = true;
    const app = $('#app');
    if (app) app.classList.remove('pre-launch');
    $('#splash').classList.add('hidden');
    bus.emit('log', { level: 'success', message: 'launched from the loading screen' });
    if (window.seMenu.isSelftest) {
      setTimeout(() => M.selftest.run(), 600);
    }
  }

  function wireLaunch() {
    const btn = $('#sp-launch-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'Launching…';
      // one frame so the press registers visually, then hand over
      requestAnimationFrame(() => setTimeout(doLaunch, 120));
    });
  }

  function spProgress() {
    const bar = $('#sp-bar');
    const pct = $('#sp-pct');
    if (!bar || !pct) return;
    const v = Math.min(100, Math.round((spDone / SP_STEPS) * 100));
    bar.style.width = `${v}%`;
    pct.textContent = `${v}%`;
  }

  function spStep(label) {
    const list = $('#sp-steps');
    if (!list) return null;
    const li = h('li', { class: 'sp-step' },
      h('span', { class: 'st-ico', html: '<span class="st-dot"></span>' }),
      h('span', { class: 'st-label', text: label }),
      h('span', { class: 'st-ms', text: '' }));
    list.appendChild(li);
    requestAnimationFrame(() => li.classList.add('show'));
    while (list.children.length > 7) list.removeChild(list.firstChild);
    list.scrollTop = list.scrollHeight;
    return li;
  }

  function spState(li, mode, ms) {
    if (!li) return;
    li.classList.remove('active', 'done');
    li.classList.add(mode);
    const ico = li.querySelector('.st-ico');
    ico.innerHTML = mode === 'done'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" class="st-check"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<span class="sp-spin"></span>';
    li.querySelector('.st-ms').textContent = ms || '';
  }

  async function spRun(label, fn) {
    const li = spStep(label);
    spState(li, 'active');
    const t0 = performance.now();
    const out = await fn();
    spDone++;
    spState(li, 'done', `${((performance.now() - t0) / 1000).toFixed(2)}s`);
    spProgress();
    return out;
  }

  function showSplashUpdate(s) {
    updateFoundDuringBoot = true;
    const panel = $('#sp-update');
    if (!panel) return;
    panel.classList.remove('hidden');
    const sub = $('#spu-sub');
    if (sub) sub.textContent = `v${s.latest} ready · you are on v${state.appInfo ? state.appInfo.version : ''}`;
    hydrateIcons(panel);
    bus.emit('log', { level: 'info', message: `update available at boot: v${s.latest}` });
  }

  function wireSplashUpdate() {
    const btn = $('#spu-btn');
    const later = $('#spu-later');
    if (later) {
      later.addEventListener('click', () => {
        const p = $('#sp-update');
        if (p) p.classList.add('hidden');
        splashUpdateDismissed = true;
      });
    }
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Downloading…';
      const off = window.seMenu.updater.onState(s => {
        if (s.phase === 'downloading' && s.progress) {
          const bar = $('#sp-bar');
          const pct = $('#sp-pct');
          if (bar) bar.style.width = `${Math.max(4, Math.round(s.progress.percent))}%`;
          if (pct) pct.textContent = `${Math.round(s.progress.percent)}%`;
        }
      });
      try {
        const res = await window.seMenu.updater.download();
        if (res && res.phase === 'downloaded') {
          btn.textContent = 'Installing…';
          await window.seMenu.updater.install();
          return;
        }
        if (res && res.phase === 'error') throw new Error(res.error || 'download failed');
        btn.textContent = 'Update now';
        btn.disabled = false;
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Try again';
        bus.emit('log', { level: 'error', message: `splash update failed: ${e.message}` });
      } finally {
        off();
      }
    });
  }

  /* ----------------------------------------------------------------- boot */

  async function boot() {
    hydrateIcons(document);
    spProgress();
    wireSplashUpdate();
    wireLaunch();
    const shell = $('#app');
    if (shell) shell.classList.add('pre-launch');

    const note = msg => {
      const el = $('#sp-note');
      if (el) { el.textContent = msg; el.classList.remove('hidden'); }
    };

    try {
      await spRun('Reading application configuration', async () => {
        state.appInfo = await window.seMenu.app.info();
        state.config = await window.seMenu.config.get();
      });

      await spRun('Starting animated background engine', () => {
        const canvas = $('#bg-canvas');
        if (canvas && M.background) {
          state.bgEngine = new M.background.Engine(canvas);
          state.bgEngine.start();
        }
        applyConfig();
      });

      await spRun('Warming up system sensors', async () => {
        await window.seMenu.sys.info().catch(() => {});
      });

      await spRun('Preparing interface modules', () => {
        initTooltips();
        wireTitlebar();
        wireChips();
        wireGlobal();
      });

      await spRun('Checking for updates', async () => {
        const cfg = await window.seMenu.updater.getConfig();
        if (cfg.autoCheck === false) {
          note('Updates are paused. Turn automatic checks back on in Settings.');
          return;
        }
        const res = await window.seMenu.updater.check();
        if (res && res.phase === 'available') {
          showSplashUpdate(res);
        } else if (res && res.phase === 'upToDate') {
          note(`You are up to date - v${state.appInfo.version} is the latest version.`);
        } else if (res && res.phase === 'error') {
          note(`Update check failed: ${res.error}`);
        }
      });

      await spRun('Mounting workspace tabs', () => {
        M.updaterUI.init({ appInfo: state.appInfo });
        registerTab({
          id: 'opencode-reset',
          title: 'OpenCode Reset Tokens',
          icon: 'terminal',
          tip: 'Run the OpenCode Infinite launcher to reset tokens',
          mount: mountOpencodeResetTab,
          unmount: () => { if (M.opencodeReset) M.opencodeReset.unmount(); },
        });
        registerTab({
          id: 'il2cpp-dumper',
          title: 'Il2CppDumper',
          icon: 'cpu',
          tip: 'Unobfuscate Unity/IL2CPP VR games and dump offsets',
          mount: mountIl2CppDumperTab,
          unmount: () => { if (M.il2cppDumper) M.il2cppDumper.unmount(); },
        });
        registerTab({
          id: 'settings',
          title: 'Settings',
          icon: 'settings',
          tip: 'Background animation, glass appearance and updates',
          mount: mountSettingsTab,
        });
        activateTab('opencode-reset');
      });

      await spRun('Loading typography', async () => {
        await document.fonts.ready.catch(() => {});
      });

      await spRun('Ready to launch', async () => {
        await new Promise(r => setTimeout(r, 320));
      });

      // The menu opens only when Launch is pressed. Unattended harnesses
      // (self-test, screenshot tour) auto-launch so they still see the UI.
      if (window.seMenu.isSelftest || window.seMenu.isShots) {
        await new Promise(r => setTimeout(r, 420));
        doLaunch();
      } else {
        armLaunch();
      }
    } catch (err) {
      console.error('[boot]', err);
      note(`Startup problem: ${err.message}`);
      toast({ type: 'error', title: 'Startup failed', message: err.message, timeout: 8000 });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.SEMENU);
