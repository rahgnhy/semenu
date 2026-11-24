/* ============================================================================
   updater-ui.js — update banner, update modal and release configuration.
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
    banner.appendChild(h('div', { class: 'ub-icon', html: icon(iconName, 17) }));
    banner.appendChild(h('div', { class: 'ub-text' },
      h('div', { class: 'ub-title', text: bannerTitle() }),
      h('div', { class: 'ub-sub', text: bannerSub() }),
      phase === 'downloading' ? h('div', { class: 'progress sm', style: { marginTop: 9 } },
        h('div', { class: 'fill', style: { width: `${state.progress ? state.progress.percent : 0}%` } })) : null,
    ));
    const actions = h('div', { class: 'row', style: 'gap:7px;flex:none' });
    if (phase === 'available' && !state.skipped) {
      actions.appendChild(h('button', { class: 'btn btn-primary btn-sm', html: `${icon('download', 14)} Download`, onClick: () => download() }));
    }
    if (phase === 'downloaded') {
      actions.appendChild(h('button', { class: 'btn btn-primary btn-sm', html: `${icon('refresh', 14)} Install & restart`, onClick: () => install() }));
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
    return `You are on v${appInfo ? appInfo.version : '?'} · ${state.source || config.mode} channel`;
  }

  /* -------------------------------------------------------------- modal */

  function openModal() {
    if (modal) {
      modal.close();
      modal = null;
    }
    modalBody = h('div', { id: 'updater-modal-body' });
    const footer = h('div', { class: 'modal-foot' },
      h('button', { class: 'btn btn-ghost', text: 'Close', onClick: () => modal && modal.close() }),
      h('button', { class: 'btn btn-primary', html: `${icon('refresh', 15)} Check for updates`, onClick: () => checkNow() }),
    );
    modal = P.dom.openModal({
      title: 'Updates',
      sub: 'Version management, release channel and download settings',
      icon: 'download-cloud',
      body: modalBody,
      footer,
      width: '660px',
    });
    renderModalBody();
    return modal;
  }

  function renderModalBody() {
    if (!modalBody) return;
    clear(modalBody);
    const phase = state ? state.phase : 'idle';

    /* status */
    const statusCard = h('div', { class: 'subpanel' },
      h('div', { class: 'subpanel-title', html: `${icon('info', 14)} Status` }),
      h('div', { class: 'version-grid' },
        versionCell('Current version', `v${appInfo ? appInfo.version : '—'}`),
        versionCell('Latest version', state && state.latest ? `v${state.latest}` : '—'),
        versionCell('State', phaseText()),
      ),
      h('div', { class: 'mono', style: 'font-size:.68rem;color:var(--text-3);margin-top:9px' },
        `source: ${config.mode === 'github' ? `github · ${config.githubRepo || 'not set'} · ${config.channel}` : `custom manifest · ${config.customManifestUrl || 'not set'}`}`),
      phase === 'downloading' ? h('div', { style: 'margin-top:10px' },
        h('div', { class: 'progress' }, h('div', { class: 'fill', style: { width: `${state.progress ? state.progress.percent : 0}%` } })),
        h('div', { class: 'mono', style: 'font-size:.66rem;color:var(--text-3);margin-top:6px' },
          `${state.progress ? fmtBytes(state.progress.received) : '0 B'} / ${state.progress && state.progress.total ? fmtBytes(state.progress.total) : 'unknown size'}`),
      ) : null,
      phase === 'downloaded' ? h('div', { class: 'row', style: 'gap:7px;margin-top:10px;flex-wrap:wrap' },
        h('span', { class: 'badge ' + (state.verified ? 'ok' : 'warn'), text: state.verified ? 'SHA-256 verified' : 'unverified (no checksum)' }),
        h('button', { class: 'btn btn-sm', onClick: () => window.se-menu.updater.showDownloaded(), html: `${icon('folder', 14)} Show file` }),
      ) : null,
    );
    modalBody.appendChild(statusCard);

    /* release notes */
    if (state && (state.notes || phase === 'available')) {
      modalBody.appendChild(h('div', { class: 'subpanel', style: 'margin-top:12px' },
        h('div', { class: 'subpanel-title', html: `${icon('file-text', 14)} Release notes${state.latest ? ` — v${state.latest}` : ''}` }),
        h('div', {
          style: 'max-height:150px;overflow-y:auto;font-size:.76rem;color:var(--text-2);line-height:1.6;white-space:pre-wrap',
          text: state.notes || 'No release notes published.',
        }),
      ));
    }

    /* actions */
    const actions = h('div', { class: 'row', style: 'gap:7px;flex-wrap:wrap;margin-bottom:14px' });
    if (phase === 'available' && !state.skipped) {
      actions.appendChild(h('button', { class: 'btn btn-primary btn-sm', html: `${icon('download', 14)} Download update`, onClick: () => download() }));
      actions.appendChild(h('button', { class: 'btn btn-sm btn-ghost', text: 'Skip this version', onClick: () => skip() }));
    }
    if (phase === 'downloaded') {
      actions.appendChild(h('button', { class: 'btn btn-primary btn-sm', html: `${icon('refresh', 14)} Install & restart`, onClick: () => install() }));
    }
    if (phase === 'downloading' || phase === 'installing') {
      actions.appendChild(h('span', { class: 'badge acc', text: phase === 'installing' ? 'installing — SE-MENU will restart' : 'download in progress…' }));
    }
    if (phase === 'notConfigured') {
      actions.appendChild(h('span', { class: 'badge warn', text: 'configure a release endpoint below' }));
    }
    modalBody.appendChild(actions);

    /* configuration */
    const cfg = h('div', { class: 'subpanel' },
      h('div', { class: 'subpanel-title', html: `${icon('settings', 14)} Release source` }));
    const modeSeg = h('div', { class: 'segmented', id: 'up-mode' },
      h('button', { class: config.mode === 'github' ? 'active' : '', 'data-mode': 'github', text: 'GitHub Releases' }),
      h('button', { class: config.mode === 'custom' ? 'active' : '', 'data-mode': 'custom', text: 'Custom manifest' }),
    );
    cfg.appendChild(h('div', { style: 'margin-bottom:10px' }, modeSeg));

    const repoInput = h('input', { class: 'input mono', value: config.githubRepo || '', placeholder: 'owner/repository', style: 'font-size:.8rem' });
    const channelSel = h('select', { class: 'select', style: 'font-size:.8rem' },
      h('option', { value: 'stable', ...(config.channel === 'stable' ? { selected: 'true' } : {}) }, 'Stable'),
      h('option', { value: 'beta', ...(config.channel === 'beta' ? { selected: 'true' } : {}) }, 'Beta'),
    );
    const customInput = h('input', { class: 'input mono', value: config.customManifestUrl || '', placeholder: 'https://example.com/se-menu-update.json', style: 'font-size:.8rem' });

    const repoRow = fieldRow('GitHub repository', repoInput, 'Used when the source is GitHub Releases.');
    const channelRow = fieldRow('Channel', channelSel, 'Stable tracks /releases/latest; beta picks the highest semver across recent releases.');
    const customRow = fieldRow('Custom manifest URL', customInput, 'JSON: { "version": "1.2.0", "downloadUrl": "…", "sha256": "…", "notes": "…" }');
    cfg.appendChild(repoRow);
    cfg.appendChild(channelRow);
    cfg.appendChild(customRow);
    const autoCheck = toggle('Check automatically on startup and every few hours', config.autoCheck !== false);
    const autoDownload = toggle('Download updates automatically when found', !!config.autoDownload);
    const intervalSel = h('select', { class: 'select', style: 'font-size:.8rem' },
      [1, 3, 6, 12, 24].map(v => h('option', { value: String(v), ...(Number(config.checkIntervalHours) === v ? { selected: 'true' } : {}) }, `Every ${v} hours`)));
    cfg.appendChild(fieldRow('Automatic checks', autoCheck, ''));
    cfg.appendChild(fieldRow('Automatic downloads', autoDownload, ''));
    cfg.appendChild(fieldRow('Check interval', intervalSel, ''));

    const saveBtn = h('button', { class: 'btn btn-primary btn-sm', html: `${icon('save', 14)} Save update settings` });
    saveBtn.addEventListener('click', async () => {
      const mode = modeSeg.querySelector('button.active').dataset.mode;
      const patch = {
        mode,
        githubRepo: repoInput.value.trim(),
        channel: channelSel.value,
        customManifestUrl: customInput.value.trim(),
        autoCheck: autoCheck.classList.contains('on'),
        autoDownload: autoDownload.classList.contains('on'),
        checkIntervalHours: parseInt(intervalSel.value, 10),
      };
      config = await window.se-menu.updater.setConfig(patch);
      toast({ type: 'success', title: 'Update settings saved', message: config.mode === 'github' ? `GitHub · ${config.githubRepo || 'not set'}` : 'Custom manifest' });
      bus.emit('log', { level: 'info', message: `updater config saved: mode=${config.mode} repo=${config.githubRepo || '—'} channel=${config.channel}` });
      renderModalBody();
    });
    cfg.appendChild(h('div', { style: 'margin-top:12px' }, saveBtn));
    modalBody.appendChild(cfg);

    /* publish helper */
    modalBody.appendChild(h('div', { class: 'subpanel', style: 'margin-top:12px' },
      h('div', { class: 'subpanel-title', html: `${icon('shield', 14)} Distributing SE-MENU` }),
      h('div', { style: 'font-size:.74rem;color:var(--text-2);line-height:1.6' },
        'Publish an NSIS installer (se-menu-Setup-x.y.z.exe) plus the release notes to a GitHub release, or serve a manifest JSON next to the installer. The app checks the endpoint, downloads with resume support, verifies the SHA-256 digest, then installs and restarts. User settings live in the user data folder and survive updates.'),
      h('div', { style: 'margin-top:8px' },
        h('button', {
          class: 'btn btn-sm btn-ghost',
          text: 'Open update guide',
          onClick: () => window.se-menu.shell.openExternal('https://github.com/electron-userland/electron-builder'),
        }),
      ),
    ));

    function fieldRow(label, control, hint) {
      return h('div', { style: 'margin-bottom:10px' },
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
    function versionCell(label, value) {
      return h('div', { class: 'version-cell' },
        h('div', { class: 'vc-label', text: label }),
        h('div', { class: 'vc-value', text: value }),
      );
    }

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
    repoRow.style.display = config.mode === 'github' ? '' : 'none';
    channelRow.style.display = config.mode === 'github' ? '' : 'none';
    customRow.style.display = config.mode === 'custom' ? '' : 'none';
  }

  /* ----------------------------------------------------------- actions */

  async function checkNow() {
    toast({ type: 'info', title: 'Checking for updates…', message: 'Contacting the release endpoint.', timeout: 2500 });
    const res = await window.se-menu.updater.check();
    if (res && res.phase === 'available') {
      toast({ type: 'success', title: `SE-MENU ${res.latest} available`, message: 'A new version was found.', timeout: 6000 });
    } else if (res && res.phase === 'upToDate') {
      toast({ type: 'info', title: 'Up to date', message: `SE-MENU v${appInfo.version} is the latest version.` });
    } else if (res && res.phase === 'notConfigured') {
      toast({ type: 'warn', title: 'No update server configured', message: 'Add your GitHub repository or a custom manifest URL in Updates → Release source.', timeout: 7000 });
    } else if (res && res.phase === 'error') {
      toast({ type: 'error', title: 'Update check failed', message: res.error || 'Unknown error', timeout: 7000 });
    }
  }

  async function download() {
    toast({ type: 'info', title: 'Downloading update…', message: 'Progress is shown in the banner and update panel.', timeout: 2500 });
    const res = await window.se-menu.updater.download();
    if (res && res.phase === 'downloaded') {
      toast({ type: 'success', title: 'Download complete', message: res.verified ? 'Integrity verified. Ready to install.' : 'Ready to install (no checksum published).' });
    } else if (res && res.phase === 'error') {
      toast({ type: 'error', title: 'Download failed', message: res.error || 'Unknown error', timeout: 7000 });
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
    const res = await window.se-menu.updater.install();
    if (res && res.phase === 'error') {
      toast({ type: 'error', title: 'Install failed', message: res.error, timeout: 7000 });
    }
  }

  async function skip() {
    if (!state || !state.latest) return;
    await window.se-menu.updater.skip(state.latest);
    toast({ type: 'info', title: 'Version skipped', message: `SE-MENU ${state.latest} will be ignored until the next release.` });
    ensureBanner();
  }

  /* ------------------------------------------------------------- init */

  M.updaterUI = {
    async init(opts) {
      appInfo = (opts && opts.appInfo) || { version: '—' };
      try {
        config = await window.se-menu.updater.getConfig();
      } catch (e) {
        config = { mode: 'github', channel: 'stable' };
      }
      window.se-menu.updater.onState(s => {
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
        if (modalBody && !$('#updater-modal-body').closest('.modal-overlay').classList.contains('closing')) renderModalBody();
      });
      window.se-menu.updater.onCheckNow(() => openModal());
      bus.on('tab:activated', ensureBanner);
      ensureBanner();
      bus.emit('log', { level: 'info', message: `updater ready — mode ${config.mode}${config.githubRepo ? ` · ${config.githubRepo}` : ''} · channel ${config.channel}` });
    },

    openModal,

    state() {
      return { phase: state ? state.phase : 'unknown', latest: state ? state.latest : null, current: appInfo ? appInfo.version : '—' };
    },

    destroy() {
      banner = null;
      modal = null;
      modalBody = null;
    },
  };
})(window.SEMENU);
