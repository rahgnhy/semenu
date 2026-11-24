/* ============================================================================
   settings.js — the Settings tab: animated background, glass appearance,
   interface, updates and about.
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, $$, clear, toast, icon } = P.dom;

  const BG_DEFAULTS = { style: 'liquid', speed: 1, intensity: 0.85, blur: 0, brightness: 1, opacity: 1, quality: 'high', enabled: true };
  const APPEARANCE_DEFAULTS = { accent: 'violet', glassTransparency: 0.088, glassBlur: 16 };
  const UI_DEFAULTS = { scale: 0.9, compact: false };
  const ANIMATION_DEFAULTS = { enabled: true, speed: 1, reduceMotion: false };

  function save(patch) {
    return P.app.saveConfig(patch).catch(e => console.error('[settings] save failed', e));
  }

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
    const el = h('button', { class: 'toggle' + (initial ? ' on' : ''), role: 'switch', 'aria-checked': String(!!initial) });
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
    const wrap = h('div', { class: 'slider', style: 'min-width:200px' }, input, val);
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

  function card(iconName, title, sub) {
    return h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-icon', html: icon(iconName, 16) }),
        h('div', { class: 'card-head-text' },
          h('div', { class: 'card-title', text: title }),
          sub ? h('div', { class: 'card-sub', text: sub }) : null,
        ),
      ),
      h('div', { class: 'card-body' }),
    );
  }

  /* ----------------------------------------------------------- background */

  function buildBackgroundCard(cfg) {
    const bg = cfg.background || {};
    const el = card('image', 'Background Animation', 'Animated liquid-glass canvas behind every panel');

    // style tiles with live rendered previews
    const tiles = h('div', { class: 'bg-tiles', id: 'bg-tiles' });
    for (const s of M.background.STYLES) {
      tiles.appendChild(h('button', {
        class: 'bg-tile' + (bg.style === s.id ? ' active' : ''),
        'data-style': s.id,
        'data-tip': s.name,
        onClick: () => selectStyle(s.id),
      },
        h('canvas', { class: 'bg-preview', id: `bg-preview-${s.id}`, style: 'height:72px' }),
        h('span', { text: s.name }),
      ));
    }
    el.querySelector('.card-body').appendChild(tiles);

    const grid = h('div', { class: 'setting-grid', style: 'margin-top:12px' });
    grid.appendChild(row('Animation speed', 'How fast the background moves.',
      slider(0.2, 2.5, 0.05, bg.speed == null ? 1 : bg.speed, '×', v => save({ background: { speed: v } }))));
    grid.appendChild(row('Intensity', 'Strength of the light fields.',
      slider(0.1, 1.5, 0.05, bg.intensity == null ? 0.85 : bg.intensity, '', v => save({ background: { intensity: v } }))));
    grid.appendChild(row('Blur effect', 'Frosting applied over the animation.',
      slider(0, 12, 0.5, bg.blur == null ? 0 : bg.blur, ' px', v => save({ background: { blur: v } }))));
    grid.appendChild(row('Brightness', 'Overall luminance of the background.',
      slider(0.3, 1.3, 0.05, bg.brightness == null ? 1 : bg.brightness, '', v => save({ background: { brightness: v } }))));
    grid.appendChild(row('Opacity', 'How strongly the animation shows through the glass.',
      slider(0.2, 1, 0.05, bg.opacity == null ? 1 : bg.opacity, '', v => save({ background: { opacity: v } }))));
    el.querySelector('.card-body').appendChild(grid);

    const footer = h('div', { class: 'row', style: 'gap:14px;flex-wrap:wrap;margin-top:12px' },
      row('Quality', 'Particle density and rendering cost.',
        h('div', { class: 'segmented', id: 'bg-quality' },
          ['low', 'medium', 'high'].map(q => h('button', {
            class: (bg.quality || 'high') === q ? 'active' : '',
            'data-q': q,
            onClick: () => {
              $$('#bg-quality button').forEach(b => b.classList.remove('active'));
              const btn = $$('#bg-quality button').find(x => x.dataset.q === q);
              if (btn) btn.classList.add('active');
              save({ background: { quality: q } });
            },
          }, q[0].toUpperCase() + q.slice(1)),
        )),
      ),
      row('Enable animation', 'Turn the background off for a flat dark surface.',
        toggle(bg.enabled !== false, on => save({ background: { enabled: on } }))),
    );
    el.querySelector('.card-body').appendChild(footer);

    const resetRow = h('div', { style: 'margin-top:10px' },
      h('button', { class: 'btn btn-sm btn-ghost', onClick: resetBackground },
        h('span', { html: icon('reset', 13) }), 'Reset background'));
    resetRow.querySelector('span[data-icon]')?.remove();
    el.querySelector('.card-body').appendChild(resetRow);

    return el;
  }

  function selectStyle(id) {
    $$('#bg-tiles .bg-tile').forEach(t => t.classList.toggle('active', t.dataset.style === id));
    save({ background: { style: id } });
    toast({ type: 'info', title: 'Background changed', message: `Animation style: ${id}.`, timeout: 1800 });
    P.bus.emit('log', { level: 'info', message: `background style → ${id}` });
  }

  function resetBackground() {
    save({ background: { ...BG_DEFAULTS } });
    toast({ type: 'success', title: 'Background reset', message: 'Animation defaults restored.' });
  }

  /* ------------------------------------------------------------ interface */

  function buildInterfaceCard(cfg) {
    const ap = cfg.appearance || {};
    const ui = cfg.ui || {};
    const an = cfg.animations || {};
    const el = card('app', 'Interface', 'Scale, glass material and motion');

    const grid = h('div', { class: 'setting-grid' });
    grid.appendChild(row('UI scale', 'Scales the whole interface.',
      slider(0.78, 1.25, 0.02, ui.scale == null ? 0.9 : ui.scale, '×', v => save({ ui: { scale: v } }))));
    grid.appendChild(row('Glass transparency', 'Panel see-through strength.',
      slider(0, 0.25, 0.005, Number(ap.glassTransparency) || 0.075, '', v => save({ appearance: { glassTransparency: v } }))));
    grid.appendChild(row('Glass blur', 'Frosting applied to panels.',
      slider(0, 32, 1, Math.round(Number(ap.glassBlur) || 20), ' px', v => save({ appearance: { glassBlur: v } }))));
    grid.appendChild(row('Animation speed', 'Global multiplier for interface motion.',
      slider(0.5, 2, 0.05, an.speed || 1, '×', v => save({ animations: { speed: v } }))));
    el.querySelector('.card-body').appendChild(grid);

    // accent palette
    const swatches = h('div', { class: 'swatches' });
    for (const [name, colors] of Object.entries(P.app.ACCENTS)) {
      swatches.appendChild(h('button', {
        class: 'swatch' + (ap.accent === name ? ' active' : ''),
        style: { background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` },
        'data-tip': name,
        'data-accent': name,
        onClick: () => {
          $$('.swatch', swatches).forEach(s => s.classList.remove('active'));
          swatches.querySelector(`[data-accent="${name}"]`).classList.add('active');
          save({ appearance: { accent: name } });
        },
      }));
    }
    const accentRow = row('Accent colour', 'Drives selections, focus rings and highlights.', swatches);
    accentRow.style.marginTop = '10px';
    el.querySelector('.card-body').appendChild(accentRow);

    const misc = h('div', { class: 'setting-grid', style: 'margin-top:6px' },
      row('Compact mode', 'Tighter spacing and narrower sidebar.',
        toggle(!!ui.compact, on => save({ ui: { compact: on } }))),
      row('Reduce motion', 'Minimises movement and transitions.',
        toggle(!!an.reduceMotion, on => save({ animations: { reduceMotion: on } }))),
      row('Animations', 'Master switch for interface motion.',
        toggle(an.enabled !== false, on => save({ animations: { enabled: on } }))),
    );
    el.querySelector('.card-body').appendChild(misc);

    const reset = h('div', { style: 'margin-top:10px' },
      h('button', { class: 'btn btn-sm btn-ghost', onClick: resetAppearance },
        h('span', { html: icon('reset', 13) }), 'Reset appearance'));
    el.querySelector('.card-body').appendChild(reset);
    return el;
  }

  function resetAppearance() {
    save({
      appearance: { ...APPEARANCE_DEFAULTS },
      ui: { ...UI_DEFAULTS },
      animations: { ...ANIMATION_DEFAULTS },
      background: { ...BG_DEFAULTS },
    });
    toast({ type: 'success', title: 'Appearance reset', message: 'All appearance preferences restored.' });
  }

  /* -------------------------------------------------------------- updates */

  async function buildUpdatesCard() {
    const el = card('download-cloud', 'Updates', 'Release source, version comparison and installation');
    const body = el.querySelector('.card-body');
    body.appendChild(h('div', { class: 'version-grid' },
      versionCell('Current', '—'),
      versionCell('Latest', '—'),
      versionCell('State', '—'),
    ));

    const statusBox = h('div', { id: 'set-updates-status', style: 'margin-bottom:10px' });
    body.appendChild(statusBox);

    const actions = h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-bottom:12px' });
    actions.appendChild(h('button', { class: 'btn btn-primary btn-sm', html: `${icon('refresh', 13)} Check now`, onClick: () => M.updaterUI.checkFromSettings(statusBox, versionGrid) }));
    actions.appendChild(h('button', { class: 'btn btn-sm', html: `${icon('download', 13)} Details`, onClick: () => M.updaterUI.openModal() }));
    body.appendChild(actions);

    const cfg = await window.seMenu.updater.getConfig();
    const grid = h('div', { class: 'setting-grid' });

    const modeSeg = h('div', { class: 'segmented', id: 'up-mode' },
      h('button', { class: cfg.mode === 'github' ? 'active' : '', 'data-mode': 'github', text: 'GitHub' }),
      h('button', { class: cfg.mode === 'custom' ? 'active' : '', 'data-mode': 'custom', text: 'Custom' }),
    );
    const modeRow = row('Release source', 'Where new versions are published.', modeSeg);
    grid.appendChild(modeRow);

    const repoInput = h('input', { class: 'input mono', value: cfg.githubRepo || '', placeholder: 'owner/repository', style: 'font-size:.74rem' });
    const channelSel = h('select', { class: 'select', style: 'font-size:.74rem' },
      h('option', { value: 'stable', ...(cfg.channel === 'stable' ? { selected: 'true' } : {}) }, 'Stable'),
      h('option', { value: 'beta', ...(cfg.channel === 'beta' ? { selected: 'true' } : {}) }, 'Beta'));
    const customInput = h('input', { class: 'input mono', value: cfg.customManifestUrl || '', placeholder: 'https://example.com/manifest.json', style: 'font-size:.74rem' });

    const repoRow = row('Repository', 'owner/repository on GitHub.', repoInput);
    const channelRow = row('Channel', 'Stable or beta releases.', channelSel);
    const customRow = row('Manifest URL', 'Custom JSON manifest endpoint.', customInput);
    grid.appendChild(repoRow);
    grid.appendChild(channelRow);
    grid.appendChild(customRow);

    const autoCheck = toggle(cfg.autoCheck !== false, () => {});
    const autoDownload = toggle(!!cfg.autoDownload, () => {});
    grid.appendChild(row('Automatic checks', 'Check on startup and on an interval.', autoCheck));
    grid.appendChild(row('Automatic downloads', 'Download as soon as an update appears.', autoDownload));

    const intervalSel = h('select', { class: 'select', style: 'font-size:.74rem' },
      [1, 3, 6, 12, 24].map(v => h('option', { value: String(v), ...(Number(cfg.checkIntervalHours) === v ? { selected: 'true' } : {}) }, `Every ${v} hours`)));
    grid.appendChild(row('Check interval', 'How often to look for updates.', intervalSel));

    const saveBtn = h('button', { class: 'btn btn-primary btn-sm', style: 'margin-top:10px' }, 'Save update settings');
    saveBtn.addEventListener('click', async () => {
      const mode = modeSeg.querySelector('button.active').dataset.mode;
      await window.seMenu.updater.setConfig({
        mode,
        githubRepo: repoInput.value.trim(),
        channel: channelSel.value,
        customManifestUrl: customInput.value.trim(),
        autoCheck: autoCheck.classList.contains('on'),
        autoDownload: autoDownload.classList.contains('on'),
        checkIntervalHours: parseInt(intervalSel.value, 10),
      });
      toast({ type: 'success', title: 'Update settings saved', message: mode === 'github' ? `GitHub · ${repoInput.value.trim() || 'not set'}` : 'Custom manifest' });
      P.bus.emit('log', { level: 'info', message: 'update settings saved' });
    });
    grid.appendChild(saveBtn);
    body.appendChild(grid);

    $$('#up-mode button').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#up-mode button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        repoRow.style.display = mode === 'github' ? '' : 'none';
        channelRow.style.display = mode === 'github' ? '' : 'none';
        customRow.style.display = mode === 'custom' ? '' : 'none';
      });
    });
    repoRow.style.display = cfg.mode === 'github' ? '' : 'none';
    channelRow.style.display = cfg.mode === 'github' ? '' : 'none';
    customRow.style.display = cfg.mode === 'custom' ? '' : 'none';

    const versionGrid = body.querySelector('.version-grid');
    M.updaterUI.bindStatus(statusBox, versionGrid);

    return el;
  }

  function versionCell(label, value) {
    return h('div', { class: 'version-cell' },
      h('div', { class: 'vc-label', text: label }),
      h('div', { class: 'vc-value', text: value }),
    );
  }

  /* ---------------------------------------------------------------- about */

  function buildAboutCard(appInfo) {
    const el = card('info', 'About', 'Application and runtime information');
    const body = el.querySelector('.card-body');
    const dl = h('dl', { class: 'kv' });
    const rows = [
      ['Application', 'SE-MENU'],
      ['Version', appInfo ? `v${appInfo.version}` : '—'],
      ['Electron', appInfo ? appInfo.electron : '—'],
      ['Chromium', appInfo ? appInfo.chrome : '—'],
      ['Node', appInfo ? appInfo.node : '—'],
      ['Platform', appInfo ? `${appInfo.platform} (${appInfo.arch}) · ${appInfo.release}` : '—'],
      ['User data', appInfo ? appInfo.userData : '—'],
      ['Packaged', appInfo ? (appInfo.isPackaged ? 'yes' : 'no (development)') : '—'],
    ];
    for (const [k, v] of rows) {
      dl.appendChild(h('dt', { text: k }));
      dl.appendChild(h('dd', { text: v }));
    }
    body.appendChild(dl);
    body.appendChild(h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-top:12px' },
      h('button', { class: 'btn btn-sm', onClick: () => { if (appInfo) window.seMenu.shell.openPath(appInfo.userData); } }, 'Open data folder'),
      h('button', { class: 'btn btn-sm btn-ghost', onClick: () => M.selftest.run() }, 'Run self-test'),
    ));
    return el;
  }

  /* --------------------------------------------------------------- mount */

  function mount(node) {
    const body = $('#settings-body', node);
    if (!body) return;
    body.innerHTML = '';
    const cfg = P.app.state.config || {};

    body.appendChild(buildBackgroundCard(cfg));
    body.appendChild(buildInterfaceCard(cfg));
    buildUpdatesCard().then(el => body.appendChild(el)).catch(e => console.error('[settings]', e));
    body.appendChild(buildAboutCard(P.app.state.appInfo || {}));

    // paint the background previews once layout is available
    requestAnimationFrame(() => {
      $$('.bg-preview', body).forEach(cv => {
        try { M.background.renderPreview(cv, cv.id.replace('bg-preview-', '')); } catch (e) { /* noop */ }
      });
    });

    P.bus.emit('log', { level: 'debug', message: 'settings tab mounted' });
  }

  M.settings = { mount };
})(window.SEMENU);
