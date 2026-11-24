/* ============================================================================
   selftest.js - automated renderer checks. Runs in normal use on demand and
   automatically under `npm run selftest`; results go to the main process,
   which merges them with its own checks and writes selftest-report.json.
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, $$, toast } = P.dom;

  const results = [];

  function check(name, ok, detail) {
    results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 300) });
  }

  function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async function run() {
    results.length = 0;
    const t0 = performance.now();
    try {
      /* ---- environment ---- */
      check('document is visible', document.visibilityState === 'visible', document.visibilityState);
      const rafCount = await new Promise(res => {
        let n = 0;
        const started = performance.now();
        const loop = () => {
          n++;
          if (performance.now() - started > 1000) res(n);
          else requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
        setTimeout(() => res(n), 2500);
      });
      check('requestAnimationFrame runs', rafCount > 5, `${rafCount} frames in 1000 ms`);

      /* ---- structure ---- */
      const tabs = P.app.state.tabs;
      check('tab registry holds exactly three tabs', tabs.size === 3, [...tabs.keys()].join(','));
      check('tabs include OpenCode Reset Tokens, Il2CppDumper and Settings',
        ['opencode-reset', 'il2cpp-dumper', 'settings'].every(id => tabs.has(id)),
        [...tabs.values()].map(t => t.title).join(','));

      P.app.activateTab('opencode-reset');
      await wait(450);
      check('OpenCode Reset Tokens tab mounts', !!$('#tab-opencode-reset'));
      check('OpenCode menu present', !!($('#ocrt-start-terminal') || $('#ocrt-status-terminal')));
      check('session log present', !!$('#ocrt-term'));

      P.app.activateTab('il2cpp-dumper');
      await wait(450);
      check('Il2CppDumper tab mounts', !!$('#tab-il2cpp-dumper'));
      check('APK drop zone present', !!$('#icd-drop'));
      check('Il2CppDumper run button present', !!$('#icd-run'));

      P.app.activateTab('settings');
      await wait(500);
      check('Settings tab mounts', !!$('#tab-settings') && $$('.bg-tile').length >= 6, `${$$('.bg-tile').length} background previews`);
      check('background previews render', $$('.bg-preview').every(cv => cv.width > 0));
      check('background engine running', !!(P.app.state && P.app.state.bgEngine));
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--acc-2').trim();
      check('theme tokens applied', !!accent, accent || 'no --acc-2');

      /* ---- overlays ---- */
      const tipBtn = $$('[data-tip]')[0];
      if (tipBtn) {
        tipBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await wait(260);
        const tip = $('#tooltip');
        check('tooltip appears on hover', tip.classList.contains('show'), tip.textContent.slice(0, 40));
        tipBtn.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      } else check('tooltip appears on hover', false, 'no tooltip elements');

      const toastsBefore = $$('.toast').length;
      P.dom.toast({ title: 'selftest', message: 'toast render check' });
      check('toast notification renders', $$('.toast').length > toastsBefore);

      const m = P.dom.openModal({ title: 'selftest', body: h('div', {}, 'modal check') });
      check('modal opens', $$('.modal-overlay').length === 1);
      m.close();
      await wait(320);
      check('modal closes', $$('.modal-overlay').length === 0);

      /* ---- data layers ---- */
      check('devtools logging available', !!(M.devtools && M.devtools.log));

      const ping = await window.seMenu.net.ping('1.1.1.1', 2500);
      check('ping returns a real measurement', !!ping && typeof ping.ok === 'boolean' && (ping.ms === null || typeof ping.ms === 'number'), `ok=${ping.ok} ms=${ping.ms}`);

      const sys = await window.seMenu.sys.info();
      check('system telemetry stream', !!(sys && sys.mem && sys.mem.total > 0 && sys.cpu), `mem=${sys.mem ? sys.mem.total : 0}`);

      const uc = await window.seMenu.updater.getConfig();
      check('update configuration loads', !!uc && !!uc.mode, uc.mode);

      const us = await window.seMenu.updater.getState();
      check('update state stream emits', !!us && !!us.phase, us ? us.phase : 'no state');
    } catch (e) {
      check('selftest exception', false, e && e.message);
    }

    const passed = results.filter(r => r.ok).length;
    const summary = {
      total: results.length,
      passed,
      failed: results.length - passed,
      durationMs: performance.now() - t0,
      ts: new Date().toISOString(),
      results,
    };
    // eslint-disable-next-line no-console
    console.log('[selftest] renderer results', summary);
    try {
      await window.seMenu.selftest.report(summary);
    } catch (e) { /* main may not be listening */ }
    toast({
      type: summary.failed ? 'warn' : 'success',
      title: `Self-test: ${passed}/${results.length} passed`,
      message: summary.failed ? `${summary.failed} check${summary.failed > 1 ? 's' : ''} failed - open the diagnostic report for details.` : 'Every check passed.',
      timeout: 9000,
    });
    return summary;
  }

  M.selftest = { run };
})(window.SEMENU);
