/* ============================================================================
   updater-ui.js — update banner, update modal and shared status renderers.
   Used by the title-bar button, the Test page banner and the Settings tab.
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, $$, clear, toast, bus, icon, fmtBytes } = P.dom;

  let appInfo = null;
  let config = null;
  let state = null;
  let banner = null;
  let modal = null;
  let modalBody = null;
  let lastPhase = null;
  const statusRenderers = [];

  const PHASE_TEXT = {
    idle: 'Idle',
    checking: 'Checking for updates…',
    available: 'Update available',
    downloading: 'Downloading update…',
    downloaded: 'Download complete — ready to install',
    installing: 'Installing…',
    upToDate: 'You are up to date',
    error: 'Update error',
    notConfigured: 'No update server configured',
  };

  function phaseText() {
    if (!state) return 'Idle';
    if (state.phase === 'error' && state.error) return `Error: ${state.error}`;
    return PHASE_TEXT[state.phase] || state.phase;
  }

  /* ------------------------------------------------------------- banner */

  function ensureBanner() {
    const inner = $('#content-inner');
    if (!inner) return;
    banner = $('#update-banner');
    if (!banner) {
      banner = h('div', { class: 'update-banner', id: 'update-banner' });
      inner.prepend(banner);
    }
    renderBanner();
  }

  function renderBanner() {
    if (!banner) return;
    const phase = state ? state.phase : 'idle';
    if (!['available', 'downloading', 'downloaded', 'installing', 'error'].includes(phase)) {
      banner.style.display = 'none';
      return;
    }
    banner.style.display = '';
    clear(banner);

    const iconName = phase === 'error' ? 'alert' : phase === 'downloaded' ? 'check-circle' : 'download-cloud';
    banner.appendChild(h('div', { class: 'ub-icon', html: icon(iconName, 15) }));
    banner.appendChild(h('div', { class: 'ub-text' },
      h('div', { class: 'ub-title', text: bannerTitle() }),
      h('div', { class: 'ub-sub', text: bannerSub() }),
      phase === 'downloading' ? h('div', { class: 'progress sm', style: { marginTop: 7 } },
        h('div', { class: 'fill', style: { width: `${state.progress ? state.progress.percent : 0}%` } })) : null,
    ));
    const actions = h('div', { class: 'row', style: 'gap:6px;flex:none' });
    if (phase === 'available' && !state.skipped) {
      actions.appendChild(h('button', { class: 'btn btn-primary btn-sm', html: `${icon('download', 13)} Download`, onClick: () => download() }));
    }
    if (phase === 'downloaded') {
      actions.appendChild(h('button', { class: 'btn btn-primary btn-sm', html: `${icon('refresh', 13)} Install & restart`, onClick: () => install() }));
    }
    if (phase === 'available' && state.latest) {
      actions.appendChild(h('button', { class: 'btn btn-sm btn-ghost', text: 'Skip this version', onClick: () => skip() }));
    }
    actions.appendChild(h('button', { class: 'btn btn-sm btn-ghost', text: 'Details', onClick: () => M.updaterUI.openModal() }));
    banner.appendChild(actions);
  }

  function bannerTitle() {
    if (!state) return '';
    if (state.phase === 'available') return `SE-MENU ${state.latest} is available`;
    if (state.phase === 'downloading') return `Downloading ${state.latest || 'update'}…`;
    if (state.phase === 'downloaded') return `${state.latest || 'Update'} ready to install`;
    if (state.phase === 'installing') return 'Installing update…';
    if (state.phase === 'error') return 'Update problem';
    return '';
  }

  function bannerSub() {
    if (!state) return '';
    if (state.phase === 'downloading' && state.progress) {
      const p = state.progress;
      return `${fmtBytes(p.received)} / ${p.total ? fmtBytes(p.total) : '?'} · ${(p.speed / 1048576).toFixed(1)} MB/s${p.eta ? ` · ${Math.ceil(p.eta)}s left` : ''}`;
    }
    if (state.phase === 'downloaded') return state.verified ? 'Integrity verified (SHA-256)' : 'Downloaded — no checksum published';
    if (state.phase === 'error') return state.error || 'Something went wrong';
    return `You are on v${appInfo ? appInfo.version : '?'} · ${state.source || (config ? config.mode : '')} channel`;
  }

  /* -------------------------------------------------------- status blocks */

  function renderStatusInto(box, grid, s) {
    if (!box) return;
    const phase = s ? s.phase : 'idle';
    const badgeClass = phase === 'available' || phase === 'downloaded' ? 'ok' : phase === 'error' ? 'err' : phase === 'notConfigured' ? 'warn' : '';
    box.innerHTML = '';
    box.appendChild(h('div', { class: 'row between center', style: 'gap:8px;margin-bottom:9px' },
      h('span', { class: 'mono muted', style: 'font-size:.66rem' },
        `source: ${config && config.mode === 'custom' ? `custom · ${config.customManifestUrl || 'not set'}` : `github · ${config && config.githubRepo ? config.githubRepo : 'not set'} · ${config ? config.channel : 'stable'}`}`),
      h('span', { class: 'badge ' + badgeClass, text: phaseText() }),
    ));
    if (s && s.error) {
      box.appendChild(h('div', { class: 'mono', style: 'font-size:.62rem;color:var(--err);margin-bottom:9px' }, s.error));
    }
    if (grid) {
      clear(grid);
      grid.appendChild(versionCell('Current', `v${appInfo ? appInfo.version : '—'}`));
      grid.appendChild(versionCell('Latest', s && s.latest ? `v${s.latest}` : '—'));
      grid.appendChild(versionCell('State', phaseText()));
    }
    if (phase === 'downloading' && s && s.progress) {
      box.appendChild(h('div', { class: 'progress', style: 'margin-top:9px' },
        h('div', { class: 'fill', style: { width: `${s.progress.percent}%` } })));
      box.appendChild(h('div', { class: 'mono', style: 'font-size:.6rem;color:var(--text-3);margin-top:5px' },
        `${fmtBytes(s.progress.received)} / ${s.progress.total ? fmtBytes(s.progress.total) : 'unknown size'}`));
    }
  }

  function refreshStatus() {
    for (const r of statusRenderers) renderStatusInto(r.box, r.grid, state);
  }

  function versionCell(label, value) {
    return h('div', { class: 'version-cell' },
      h('div', { class: 'vc-label', text: label }),
      h('div', { class: 'vc-value', text: value }),
    );
  }

  /* -------------------------------------------------------------- modal */

  function openModal() {
    if (modal) { modal.close(); modal = null; }
    modalBody = h('div', { id: 'updater-modal-body' });
    const footer = h('div', { class: 'modal-foot' },
      h('button', { class: 'btn btn-ghost', text: 'Close', onClick: () => modal && modal.close() }),
      h('button', { class: 'btn btn-primary', html: `${icon('refresh', 13)} Check for updates`, onClick: () => runCheck() }),
    );
    modal = P.dom.openModal({
      title: 'Updates',
      sub: 'Version management, release channel and download settings',
      icon: 'download-cloud',
      body: modalBody,
      footer,
      width: '620px',
    });
    renderModalBody();
    return modal;
  }

  function renderModalBody() {
    if (!modalBody) return;
    clear(modalBody);
    const phase = state ? state.phase : 'idle';

    modalBody.appendChild(h('div', { class: 'subpanel' },
      h('div', { class: 'subpanel-title', html: `${icon('info', 12)} Status` }),
      h('div', { class: 'version-grid' },
        versionCell('Current', `v${appInfo ? appInfo.version : '—'}`),
        versionCell('Latest', state && state.latest ? `v${state.latest}` : '—'),
        versionCell('State', phaseText()),
      ),
      h('div', { class: 'mono', style: 'font-size:.62rem;color:var(--text-3);margin-top:8px' },
        `source: ${config && config.mode === 'custom' ? `custom manifest · ${config.customManifestUrl || 'not set'}` : `github · ${config && config.githubRepo ? config.githubRepo : 'not set'} · ${config ? config.channel : 'stable'}`}`),
    ));

    if (state && state.notes && (phase === 'available' || phase === 'downloaded')) {
      modalBody.appendChild(h('div', { class: 'subpanel', style: 'margin-top:10px' },
        h('div', { class: 'subpanel-title', html: `${icon('file-text', 12)} Release notes${state.latest ? ` — v${state.latest}` : ''}` }),
        h('div', { style: 'max-height:130px;overflow-y:auto;font-size:.72rem;color:var(--text-2);line-height:1.55;white-space:pre-wrap' }, state.notes),
      ));
    }

    const actions = h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin:12px 0' });
    if (phase === 'available' && !state.skipped) {
      actions.appendChild(h('button', { class: 'btn btn-primary btn-sm', html: `${icon('download', 13)} Download update`, onClick: () => download() }));
      actions.appendChild(h('button', { class: 'btn btn-sm btn-ghost', text: 'Skip this version', onClick: () => skip() }));
    }
    if (phase === 'downloaded') {
      actions.appendChild(h('button', { class: 'btn btn-primary btn-sm', html: `${icon('refresh', 13)} Install & restart`, onClick: () => install() }));
    }
    if (phase === 'downloading' || phase === 'installing') {
      actions.appendChild(h('span', { class: 'badge acc', text: phase === 'installing' ? 'installing — SE-MENU will restart' : 'download in progress…' }));
    }
    if (phase === 'notConfigured') {
      actions.appendChild(h('span', { class: 'badge warn', text: 'configure a release endpoint below or in Settings' }));
    }
    modalBody.appendChild(actions);

    // release source configuration
    const cfg = h('div', { class: 'subpanel' },
      h('div', { class: 'subpanel-title', html: `${icon('settings', 12)} Release source` }));

    const modeSeg = h('div', { class: 'segmented', id: 'up-mode' },
      h('button', { class: config && config.mode === 'github' ? 'active' : '', 'data-mode': 'github', text: 'GitHub Releases' }),
      h('button', { class: config && config.mode === 'custom' ? 'active' : '', 'data-mode': 'custom', text: 'Custom manifest' }),
    );
    cfg.appendChild(h('div', { style: 'margin-bottom:9px' }, modeSeg));

    const repoInput = h('input', { class: 'input mono', value: (config && config.githubRepo) || '', placeholder: 'owner/repository', style: 'font-size:.76rem' });
    const channelSel = h('select', { class: 'select', style: 'font-size:.76rem' },
      h('option', { value: 'stable', ...(config && config.channel === 'stable' ? { selected: 'true' } : {}) }, 'Stable'),
      h('option', { value: 'beta', ...(config && config.channel === 'beta' ? { selected: 'true' } : {}) }, 'Beta'));
    const customInput = h('input', { class: 'input mono', value: (config && config.customManifestUrl) || '', placeholder: 'https://example.com/se-menu-update.json', style: 'font-size:.76rem' });

    const repoRow = fieldRow('GitHub repository', repoInput, 'Used when the source is GitHub Releases.');
    const channelRow = fieldRow('Channel', channelSel, 'Stable tracks /releases/latest; beta picks the highest semver across recent releases.');
    const customRow = fieldRow('Custom manifest URL', customInput, 'JSON: { "version": "1.2.0", "downloadUrl": "…", "sha256": "…", "notes": "…" }');
    cfg.appendChild(repoRow);
    cfg.appendChild(channelRow);
    cfg.appendChild(customRow);

    const autoCheck = toggle('Check automatically on startup and on an interval', config && config.autoCheck !== false);
    const autoDownload = toggle('Download updates automatically when found', !!(config && config.autoDownload));
    const intervalSel = h('select', { class: 'select', style: 'font-size:.76rem' },
      [1, 3, 6, 12, 24].map(v => h('option', { value: String(v), ...(config && Number(config.checkIntervalHours) === v ? { selected: 'true' } : {}) }, `Every ${v} hours`)));
    cfg.appendChild(fieldRow('Automatic checks', autoCheck, ''));
    cfg.appendChild(fieldRow('Automatic downloads', autoDownload, ''));
    cfg.appendChild(fieldRow('Check interval', intervalSel, ''));

    const saveBtn = h('button', { class: 'btn btn-primary btn-sm', html: `${icon('save', 13)} Save update settings` });
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
      config = await window.seMenu.updater.getConfig();
      toast({ type: 'success', title: 'Update settings saved', message: mode === 'github' ? `GitHub · ${repoInput.value.trim() || 'not set'}` : 'Custom manifest' });
      bus.emit('log', { level: 'info', message: 'update settings saved' });
      renderModalBody();
    });
    cfg.appendChild(h('div', { style: 'margin-top:10px' }, saveBtn));
    modalBody.appendChild(cfg);

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
    repoRow.style.display = config && config.mode === 'github' ? '' : 'none';
    channelRow.style.display = config && config.mode === 'github' ? '' : 'none';
    customRow.style.display = config && config.mode === 'custom' ? '' : 'none';

    modalBody.appendChild(h('div', { class: 'subpanel', style: 'margin-top:10px' },
      h('div', { class: 'subpanel-title', html: `${icon('shield', 12)} Distributing SE-MENU` }),
      h('div', { style: 'font-size:.7rem;color:var(--text-2);line-height:1.55' },
        'Publish the semenu-v<version>-Setup.exe installer plus release notes to a GitHub release, or serve a manifest JSON next to the installer. The app checks the endpoint, downloads with resume support, verifies the SHA-256 digest, then installs and restarts. Settings live in the user data folder and survive updates.'),
    ));

    function fieldRow(label, control, hint) {
      return h('div', { style: 'margin-bottom:9px' },
        h('div', { class: 'field-label', text: label }),
        control,
        hint ? h('div', { class: 'field-hint', text: hint }) : null,
      );
    }
    function toggle(label, initial) {
      const el = h('button', { class: 'toggle' + (initial ? ' on' : ''), role: 'switch', 'aria-checked': String(initial), 'data-tip': label });
      el.addEventListener('click', () => {
        const on = el.classList.toggle('on');
        el.setAttribute('aria-checked', String(on));
      });
      return el;
    }
  }

  /* ----------------------------------------------------------- actions */

  async function runCheck() {
    toast({ type: 'info', title: 'Checking for updates…', message: 'Contacting the release endpoint.', timeout: 2500 });
    try {
      const res = await window.seMenu.updater.check();
      if (res && res.phase === 'available') {
        toast({ type: 'success', title: `SE-MENU ${res.latest} available`, message: 'A new version was found.', timeout: 6000 });
      } else if (res && res.phase === 'upToDate') {
        toast({ type: 'info', title: 'Up to date', message: `SE-MENU v${appInfo ? appInfo.version : ''} is the latest version.` });
      } else if (res && res.phase === 'notConfigured') {
        toast({ type: 'warn', title: 'No update server configured', message: 'Add your GitHub repository or a manifest URL in Settings → Updates.', timeout: 7000 });
      } else if (res && res.phase === 'error') {
        toast({ type: 'error', title: 'Update check failed', message: res.error || 'Unknown error', timeout: 7000 });
      }
    } catch (e) {
      toast({ type: 'error', title: 'Update check failed', message: e.message, timeout: 7000 });
    }
  }

  async function checkFromSettings(box, grid) {
    renderStatusInto(box, grid, state);
    try {
      await window.seMenu.updater.check();
    } catch (e) { /* state handler surfaces the error */ }
  }

  async function download() {
    toast({ type: 'info', title: 'Downloading update…', message: 'Progress is shown in the banner and update panel.', timeout: 2500 });
    try {
      const res = await window.seMenu.updater.download();
      if (res && res.phase === 'downloaded') {
        toast({ type: 'success', title: 'Download complete', message: res.verified ? 'Integrity verified. Ready to install.' : 'Ready to install (no checksum published).' });
      } else if (res && res.phase === 'error') {
        toast({ type: 'error', title: 'Download failed', message: res.error || 'Unknown error', timeout: 7000 });
      }
    } catch (e) {
      toast({ type: 'error', title: 'Download failed', message: e.message, timeout: 7000 });
    }
  }

  async function install() {
    const ok = await P.dom.confirmDialog({
      title: 'Install update and restart?',
      message: 'SE-MENU will close, apply the update and start again. Your settings are preserved.',
      confirmLabel: 'Install & restart',
      icon: 'refresh',
    });
    if (!ok) return;
    try {
      const res = await window.seMenu.updater.install();
      if (res && res.phase === 'error') {
        toast({ type: 'error', title: 'Install failed', message: res.error, timeout: 7000 });
      }
    } catch (e) {
      toast({ type: 'error', title: 'Install failed', message: e.message, timeout: 7000 });
    }
  }

  async function skip() {
    if (!state || !state.latest) return;
    await window.seMenu.updater.skip(state.latest);
    toast({ type: 'info', title: 'Version skipped', message: `SE-MENU ${state.latest} will be ignored until the next release.` });
    ensureBanner();
  }

  /* ------------------------------------------------------------- init */

  M.updaterUI = {
    async init(opts) {
      appInfo = (opts && opts.appInfo) || { version: '—' };
      try {
        config = await window.seMenu.updater.getConfig();
      } catch (e) {
        config = { mode: 'github', channel: 'stable' };
      }
      window.seMenu.updater.onState(s => {
        const prev = state;
        state = s;
        if (s.phase !== lastPhase) {
          if (s.phase === 'available' && prev && prev.phase !== 'available' && !s.skipped) {
            toast({
              type: 'success',
              title: `SE-MENU ${s.latest} is available`,
              message: 'A new version was found — open Updates to read the release notes.',
              timeout: 8000,
            });
          }
          if (s.phase === 'downloaded' && prev && prev.phase === 'downloading') {
            toast({ type: 'success', title: 'Update downloaded', message: s.verified ? 'Integrity verified — ready to install.' : 'Ready to install.' });
          }
          if (s.phase === 'error' && prev && prev.phase !== 'error') {
            toast({ type: 'error', title: 'Update problem', message: s.error || 'Unknown error', timeout: 7000 });
          }
          lastPhase = s.phase;
        }
        P.app.setUpdateDot(['available', 'downloading', 'downloaded', 'installing'].includes(s.phase));
        renderBanner();
        refreshStatus();
        if (modalBody && !$('#updater-modal-body').closest('.modal-overlay').classList.contains('closing')) renderModalBody();
      });
      window.seMenu.updater.onCheckNow(() => runCheck());
      bus.on('tab:activated', ensureBanner);
      ensureBanner();
      bus.emit('log', { level: 'info', message: `updater ready — mode ${config.mode}${config.githubRepo ? ` · ${config.githubRepo}` : ''} · channel ${config.channel}` });
    },

    openModal,
    bindStatus(box, grid) {
      statusRenderers.push({ box, grid });
      renderStatusInto(box, grid, state);
    },
    checkFromSettings,

    state() {
      return { phase: state ? state.phase : 'unknown', latest: state ? state.latest : null, current: appInfo ? appInfo.version : '—' };
    },

    destroy() {
      banner = null;
      modal = null;
      modalBody = null;
      statusRenderers.length = 0;
    },
  };
})(window.SEMENU);
