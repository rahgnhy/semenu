/* ============================================================================
   settings.js — settings popup: general, appearance, animations, interface,
   notifications, updates and about. No extra tab — it lives in a modal.
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, $$, clear, toast, icon, fmtUptime } = P.dom;

  let modal = null;
  let navEl = null;
  let pageEl = null;
  let appInfo = null;
  let updaterCfg = null;

  const SECTIONS = [
    ['general', 'sliders', 'General'],
    ['appearance', 'palette', 'Appearance'],
    ['animations', 'sparkles', 'Animations'],
    ['interface', 'app', 'Interface'],
    ['notifications', 'bell', 'Notifications'],
    ['updates', 'download-cloud', 'Updates'],
    ['about', 'info', 'About'],
  ];

  function row(label, desc, control) {
    return h('div', { class: 'setting-row' },
      h('div', { class: 'sr-text' },
        h('div', { class: 'sr-label', text: label }),
        desc ? h('div', { class: 'sr-desc', text: desc }) : null,
      ),
      h('div', { class: 'sr-control' }, control),
    );
  }

  function toggle(initial, onChange) {
    const el = h('button', {
      class: 'toggle' + (initial ? ' on' : ''),
      role: 'switch',
      'aria-checked': String(!!initial),
    });
    el.addEventListener('click', () => {
      const on = el.classList.toggle('on');
      el.setAttribute('aria-checked', String(on));
      if (onChange) onChange(on);
    });
    return el;
  }

  function slider(min, max, step, value, suffix, onChange) {
    const val = h('span', { class: 'slider-value', text: `${value}${suffix || ''}` });
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
    const wrap = h('div', { class: 'slider', style: 'min-width:190px' }, input, val);
    const update = () => {
      const v = parseFloat(input.value);
      const minV = parseFloat(input.min);
      const maxV = parseFloat(input.max);
      input.style.setProperty('--val', `${((v - minV) / (maxV - minV)) * 100}%`);
      val.textContent = `${input.value}${suffix || ''}`;
    };
    input.addEventListener('input', () => { update(); if (onChange) onChange(parseFloat(input.value)); });
    update();
    return wrap;
  }

  function save(patch) {
    return P.app.saveConfig(patch).then(cfg => {
      bus_safe_emit('settings:changed', patch);
      return cfg;
    });
  }

  function bus_safe_emit(name, data) {
    try { P.bus.emit(name, data); } catch (e) { /* noop */ }
  }

  /* ------------------------------------------------------------ sections */

  function buildGeneral(cfg) {
    const page = h('div', {});
    const sec = h('div', { class: 'settings-section' });
    sec.appendChild(h('h3', { text: 'Startup & window' }));
    sec.appendChild(row('Launch on startup', 'Open SE-MENU automatically when you sign in to Windows.',
      toggle(!!cfg.app.launchOnStartup, on => {
        save({ app: { launchOnStartup: on } });
        window.se-menu.app.setStartup(on);
        toast({ type: 'success', title: on ? 'Startup enabled' : 'Startup disabled', message: on ? 'SE-MENU will open at sign-in.' : 'SE-MENU will no longer open at sign-in.' });
      })));
    sec.appendChild(row('Minimize to tray', 'Keep SE-MENU running in the background when minimized.',
      toggle(!!cfg.app.minimizeToTray, on => save({ app: { minimizeToTray: on } }))));
    sec.appendChild(row('Close to tray', 'Closing the window hides SE-MENU instead of quitting.',
      toggle(!!cfg.app.closeToTray, on => save({ app: { closeToTray: on } }))));
    page.appendChild(sec);
    return page;
  }

  function buildAppearance(cfg) {
    const page = h('div', {});
    const sec = h('div', { class: 'settings-section' });
    sec.appendChild(h('h3', { text: 'Accent palette' }));
    const swatches = h('div', { class: 'swatches' });
    for (const [name, colors] of Object.entries(P.app.ACCENTS)) {
      const sw = h('button', {
        class: 'swatch' + (cfg.appearance.accent === name ? ' active' : ''),
        style: { background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]} 50%, ${colors[2]})` },
        'data-tip': name,
        'data-accent': name,
        onClick: () => {
          $$('.swatch', swatches).forEach(s => s.classList.remove('active'));
          sw.classList.add('active');
          save({ appearance: { accent: name } });
          bus_safe_emit('log', { level: 'info', message: `accent palette → ${name}` });
        },
      });
      swatches.appendChild(sw);
    }
    sec.appendChild(row('Accent color', 'Drives gradients, glows and highlights across the interface.', swatches));
    page.appendChild(sec);

    const sec2 = h('div', { class: 'settings-section' });
    sec2.appendChild(h('h3', { text: 'Background' }));
    sec2.appendChild(row('Animated aurora', 'Drifting color fields behind the glass surface.',
      toggle(cfg.appearance.bgAurora !== false, on => save({ appearance: { bgAurora: on } }))));
    sec2.appendChild(row('Aurora intensity', 'How strong the background color fields appear.',
      slider(0.2, 1.4, 0.05, cfg.appearance.bgIntensity || 0.85, '', v => save({ appearance: { bgIntensity: v } }))));
    sec2.appendChild(row('Film grain', 'A subtle noise layer over the aurora.',
      toggle(cfg.appearance.noise !== false, on => save({ appearance: { noise: on } }))));
    sec2.appendChild(row('Pure black (OLED)', 'Removes the aurora for true black on OLED panels.',
      toggle(!!cfg.appearance.oled, on => {
        document.body.classList.toggle('oled', on);
        save({ appearance: { oled: on } });
      })));
    page.appendChild(sec2);
    return page;
  }

  function buildAnimations(cfg) {
    const page = h('div', {});
    const sec = h('div', { class: 'settings-section' });
    sec.appendChild(h('h3', { text: 'Motion' }));
    sec.appendChild(row('Enable animations', 'Turn off for an instant, static interface.',
      toggle(cfg.animations.enabled !== false, on => {
        save({ animations: { enabled: on } });
        toast({ type: 'info', title: on ? 'Animations enabled' : 'Animations disabled' });
      })));
    sec.appendChild(row('Animation speed', 'Global multiplier applied to ambient motion.',
      slider(0.5, 2, 0.05, cfg.animations.speed || 1, '×', v => save({ animations: { speed: v } }))));
    sec.appendChild(row('Reduce motion', 'Minimizes movement and transitions (accessibility).',
      toggle(!!cfg.animations.reduceMotion, on => save({ animations: { reduceMotion: on } }))));
    page.appendChild(sec);

    const note = h('div', { class: 'subpanel', style: 'font-size:.76rem;color:var(--text-2);line-height:1.6' },
      'The Animation Lab has its own speed and intensity controls for experimenting with individual effects.');
    page.appendChild(note);
    return page;
  }

  function buildInterface(cfg) {
    const page = h('div', {});
    const sec = h('div', { class: 'settings-section' });
    sec.appendChild(h('h3', { text: 'Layout & density' }));
    sec.appendChild(row('UI scaling', 'Scales the entire interface. Useful for high-density displays.',
      slider(0.9, 1.25, 0.05, cfg.ui.scale || 1, '×', v => save({ ui: { scale: v } }))));
    sec.appendChild(row('Compact density', 'Reduces padding and corner radii for more content.',
      toggle(!!cfg.ui.compact, on => {
        document.body.classList.toggle('compact', on);
        save({ ui: { compact: on } });
      })));
    page.appendChild(sec);
    return page;
  }

  function buildNotifications(cfg) {
    const page = h('div', {});
    const sec = h('div', { class: 'settings-section' });
    sec.appendChild(h('h3', { text: 'Notifications' }));
    sec.appendChild(row('In-app toasts', 'Show animated notifications inside SE-MENU.',
      toggle(cfg.notifications.toasts !== false, on => save({ notifications: { toasts: on } }))));
    sec.appendChild(row('Native OS notifications', 'Also send notifications through Windows (used for countdown completion and updates).',
      toggle(!!cfg.notifications.native, on => save({ notifications: { native: on } }))));
    sec.appendChild(row('Toast duration', 'How long notifications stay on screen.',
      slider(2, 10, 0.5, (cfg.notifications.duration || 4200) / 1000, 's', v => save({ notifications: { duration: Math.round(v * 1000) } }))));
    sec.appendChild(row('Preview', 'Fire a test notification with the current settings.',
      h('button', {
        class: 'btn btn-sm',
        onClick: () => {
          P.dom.notify('SE-MENU test notification', 'Notifications are working.');
          toast({ type: 'success', title: 'Test notification sent', message: 'Both channels were triggered.' });
        },
      }, 'Send test notification')));
    page.appendChild(sec);
    return page;
  }

  function buildUpdates(cfg) {
    const page = h('div', {});
    const sec = h('div', { class: 'settings-section' });
    sec.appendChild(h('h3', { text: 'Update source' }));
    const summary = h('div', { class: 'subpanel', style: 'margin-bottom:12px' },
      h('div', { class: 'subpanel-title', text: 'Current configuration' }),
      h('dl', { class: 'kv', id: 'settings-update-kv' }),
    );
    page.appendChild(summary);

    const actions = h('div', { class: 'row', style: 'gap:7px;flex-wrap:wrap;margin-bottom:14px' },
      h('button', { class: 'btn btn-primary btn-sm', html: `${icon('refresh', 14)} Check for updates`, onClick: () => M.updaterUI.openModal() }),
      h('button', { class: 'btn btn-sm', html: `${icon('settings', 14)} Open update settings`, onClick: () => M.updaterUI.openModal() }),
    );
    page.appendChild(actions);

    const sec2 = h('div', { class: 'settings-section' });
    sec2.appendChild(h('h3', { text: 'Network measurement endpoints' }));
    sec2.appendChild(row('Ping target', 'Default host for the Network Lab ping monitor.',
      textInput(cfg.network.pingHost, v => save({ network: { pingHost: v } }), '1.1.1.1')));
    sec2.appendChild(row('Ping interval', 'How often the ping monitor measures.',
      slider(500, 5000, 100, cfg.network.pingIntervalMs || 1000, ' ms', v => save({ network: { pingIntervalMs: v } }))));
    sec2.appendChild(row('Download endpoint', 'URL used for the download speed test.',
      textInput(cfg.network.speedDownUrl, v => save({ network: { speedDownUrl: v } }), 'https://…')));
    sec2.appendChild(row('Upload endpoint', 'URL used for the upload speed test.',
      textInput(cfg.network.speedUpUrl, v => save({ network: { speedUpUrl: v } }), 'https://…')));
    sec2.appendChild(row('Test duration', 'How long each speed test phase runs.',
      slider(4, 30, 1, Math.round((cfg.network.speedDurationMs || 12000) / 1000), 's', v => save({ network: { speedDurationMs: v * 1000 } }))));
    page.appendChild(sec2);
    return page;
  }

  function textInput(value, onChange, placeholder) {
    const input = h('input', { class: 'input mono', value: value || '', placeholder: placeholder || '', style: 'min-width:220px;font-size:.78rem' });
    input.addEventListener('change', () => onChange(input.value.trim()));
    return input;
  }

  function renderUpdateSummary() {
    const box = $('#settings-update-kv');
    if (!box || !updaterCfg) return;
    clear(box);
    const lastCheck = updaterCfg.lastCheck ? new Date(updaterCfg.lastCheck).toLocaleString() : 'never';
    const rows = [
      ['Mode', updaterCfg.mode === 'github' ? 'GitHub Releases' : 'Custom manifest'],
      ['Repository', updaterCfg.githubRepo || 'not set'],
      ['Channel', updaterCfg.channel],
      ['Custom manifest', updaterCfg.customManifestUrl || 'not set'],
      ['Auto check', updaterCfg.autoCheck !== false ? `every ${updaterCfg.checkIntervalHours} h` : 'off'],
      ['Auto download', updaterCfg.autoDownload ? 'on' : 'off'],
      ['Skipped version', updaterCfg.skippedVersion ? `v${updaterCfg.skippedVersion}` : 'none'],
      ['Last check', lastCheck],
    ];
    for (const [k, v] of rows) {
      box.appendChild(h('dt', { text: k }));
      box.appendChild(h('dd', { text: v }));
    }
  }

  function buildAbout(cfg) {
    const page = h('div', {});
    const sec = h('div', { class: 'settings-section' });
    sec.appendChild(h('h3', { text: 'SE-MENU' }));

    const identity = h('div', { class: 'row center', style: 'gap:14px;margin-bottom:14px' },
      h('div', { class: 'splash-mark', style: 'width:56px;height:56px;border-radius:16px', html: icon('se-menu', 30) }),
      h('div', {},
        h('div', { style: 'font-size:1.05rem;font-weight:700;letter-spacing:.02em' }, `SE-MENU v${appInfo ? appInfo.version : '—'}`),
        h('div', { class: 'muted', style: 'font-size:.74rem' }, 'Premium system, network and UI testing console for Windows'),
      ),
    );
    sec.appendChild(identity);

    const dl = h('dl', { class: 'kv' });
    const rows = [
      ['Application version', appInfo ? `v${appInfo.version}` : '—'],
      ['Electron', appInfo ? appInfo.electron : '—'],
      ['Chromium', appInfo ? appInfo.chrome : '—'],
      ['Node', appInfo ? appInfo.node : '—'],
      ['Platform', appInfo ? `${appInfo.platform} (${appInfo.arch}) · ${appInfo.release}` : '—'],
      ['User data folder', appInfo ? appInfo.userData : '—'],
      ['Executable', appInfo ? appInfo.execPath : '—'],
      ['Packaged', appInfo ? (appInfo.isPackaged ? 'yes' : 'no (development mode)') : '—'],
    ];
    for (const [k, v] of rows) {
      dl.appendChild(h('dt', { text: k }));
      dl.appendChild(h('dd', { text: v }));
    }
    sec.appendChild(dl);

    sec.appendChild(h('div', { class: 'row', style: 'gap:7px;flex-wrap:wrap;margin-top:14px' },
      h('button', { class: 'btn btn-sm', html: `${icon('folder', 14)} Open data folder`, onClick: () => { if (appInfo) window.se-menu.shell.openPath(appInfo.userData); } }),
      h('button', { class: 'btn btn-sm', html: `${icon('flask', 14)} Run self-test`, onClick: () => { if (M.selftest) M.selftest.run(); } }),
      h('button', { class: 'btn btn-sm btn-ghost', html: `${icon('reset', 14)} Reset all settings`, onClick: resetSettings }),
    ));
    page.appendChild(sec);
    return page;
  }

  function resetSettings() {
    P.dom.confirmDialog({
      title: 'Reset all settings?',
      message: 'Every preference returns to its default value. This does not affect your update configuration or any files on disk.',
      confirmLabel: 'Reset settings',
      danger: true,
      icon: 'alert',
    }).then(ok => {
      if (!ok) return;
      window.se-menu.config.reset().then(cfg => {
        P.app.state.config = cfg;
        P.app.applyConfig();
        document.body.classList.remove('oled', 'compact');
        updaterCfg = null;
        window.se-menu.updater.getConfig().then(c => { updaterCfg = c; });
        toast({ type: 'success', title: 'Settings reset', message: 'All preferences are back to their defaults.' });
        bus_safe_emit('log', { level: 'warn', message: 'settings reset to defaults' });
        const active = navEl && navEl.querySelector('button.active');
        if (active) showSection(active.dataset.section, cfg);
      });
    });
  }

  /* --------------------------------------------------------------- modal */

  function showSection(name, cfg) {
    if (!pageEl) return;
    clear(pageEl);
    const builder = {
      general: buildGeneral,
      appearance: buildAppearance,
      animations: buildAnimations,
      interface: buildInterface,
      notifications: buildNotifications,
      updates: buildUpdates,
      about: buildAbout,
    }[name];
    if (!builder) return;
    pageEl.appendChild(builder(cfg));
    if (name === 'updates') renderUpdateSummary();
    if (name === 'appearance') {
      pageEl.querySelectorAll('.swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.accent === cfg.appearance.accent);
      });
    }
  }

  function open() {
    if (modal) {
      modal.close();
      modal = null;
    }
    const cfg = P.app.state.config || {};
    appInfo = P.app.state.appInfo || {};
    const body = h('div', {});
    navEl = h('div', { class: 'settings-nav' });
    pageEl = h('div', {});
    body.appendChild(navEl);
    body.appendChild(pageEl);

    for (const [id, ic, label] of SECTIONS) {
      navEl.appendChild(h('button', {
        class: id === 'general' ? 'active' : '',
        'data-section': id,
        html: `${icon(ic, 14)} ${label}`,
        onClick: () => {
          $$('button', navEl).forEach(b => b.classList.remove('active'));
          navEl.querySelector(`[data-section="${id}"]`).classList.add('active');
          showSection(id, P.app.state.config || {});
        },
      }));
    }

    modal = P.dom.openModal({
      title: 'Settings',
      sub: 'Preferences apply immediately and are stored per user',
      icon: 'settings',
      body,
      width: '720px',
    });

    window.se-menu.updater.getConfig().then(c => { updaterCfg = c; if ($('#settings-update-kv')) renderUpdateSummary(); }).catch(() => {});
    showSection('general', cfg);
    bus_safe_emit('log', { level: 'debug', message: 'settings opened' });
  }

  M.settings = { open };
})(window.SEMENU);
