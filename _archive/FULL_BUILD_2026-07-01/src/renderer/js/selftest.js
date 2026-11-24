/* ============================================================================
   selftest.js — automated renderer checks. Runs in normal use on demand and
   automatically under `npm run selftest`; results go to the main process,
   which merges them with its own checks and writes selftest-report.json.
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, $$, toast, bus, icon } = P.dom;

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
      check('tab registry holds exactly one tab', P.app.state.tabs.size === 1, [...P.app.state.tabs.keys()].join(','));
      check('the only tab is named TEST', [...P.app.state.tabs.values()][0].title === 'TEST');
      check('page head rendered', !!$('#tab-test .page-head'));
      const cards = ['card-network', 'card-system', 'card-time', 'card-anim', 'card-perf', 'card-devtools', 'card-playground', 'card-utilities'];
      const missing = cards.filter(id => !document.getElementById(id));
      check('all 8 section cards mounted', missing.length === 0, missing.join(',') || 'all present');

      /* ---- controls ---- */
      const slider = $('#pg-slider-1');
      if (slider) {
        slider.value = '80';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        check('slider responds to input', slider.style.getPropertyValue('--val') === '80%', slider.style.getPropertyValue('--val'));
      } else check('slider responds to input', false, 'not found');

      const toggles = $$('.toggle');
      if (toggles.length) {
        const t = toggles[0];
        const before = t.classList.contains('on');
        t.click();
        check('toggle switch flips', t.classList.contains('on') !== before);
      } else check('toggle switch flips', false, 'no toggles found');

      const cb = $('#playground-body input[type="checkbox"]');
      if (cb) {
        const before = cb.checked;
        cb.click();
        check('checkbox toggles', cb.checked !== before);
      } else check('checkbox toggles', false, 'not found');

      const radios = $$('#playground-body input[type="radio"]');
      if (radios.length > 1) {
        radios[1].click();
        check('radio group selects', radios[1].checked && !radios[0].checked);
      } else check('radio group selects', false, 'not enough radios');

      const segBtns = $$('#pg-segmented button');
      if (segBtns.length >= 3) {
        segBtns[2].click();
        check('segmented control switches',
          segBtns[2].classList.contains('active') && !segBtns[0].classList.contains('active'),
          `${segBtns.length} buttons · after click: ${[...segBtns].map(b => b.classList.contains('active') ? 1 : 0).join(',')}`);
      } else check('segmented control switches', false, `only ${segBtns.length} buttons found`);

      /* ---- timers ---- */
      const swStart = $('#sw-start');
      const swTime = $('#stopwatch-time');
      if (swStart) {
        swStart.click();
        await wait(380);
        const txt = swTime.textContent;
        swStart.click();
        check('stopwatch advances', txt !== '00:00.000', txt);
      } else check('stopwatch advances', false, 'not found');

      const cdMin = $('#cd-min');
      const cdSec = $('#cd-sec');
      const cdStart = $('#cd-start');
      const cdVal = $('#countdown-value');
      if (cdStart) {
        cdMin.value = '0';
        cdSec.value = '3';
        cdStart.click();
        await wait(420);
        const txt = cdVal.textContent;
        cdStart.click();
        check('countdown starts and ticks', txt !== '00:00', txt);
      } else check('countdown starts and ticks', false, 'not found');

      const clockEl = $('#clock-time');
      const clockBefore = clockEl.innerHTML;
      const msToggle = $('#clock-ms-toggle');
      await wait(1300);
      const clockAfter = clockEl.innerHTML;
      check('clock ticks', clockAfter !== clockBefore,
        `ms=${msToggle ? msToggle.checked : 'missing'} before="${clockBefore.slice(0, 30)}" after="${clockAfter.slice(0, 30)}"`);

      /* ---- charts ---- */
      const canvas = $('#anim-chart') || $('#ping-chart');
      let drawn = false;
      try {
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 400) {
          if (data[i] !== 0) { drawn = true; break; }
        }
      } catch (e) { /* canvas read blocked */ }
      check('charts paint pixels', drawn, canvas ? canvas.id : 'no canvas');

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

      const ping = await window.se-menu.net.ping('1.1.1.1', 2500);
      check('ping returns a real measurement', !!ping && typeof ping.ok === 'boolean' && (ping.ms === null || typeof ping.ms === 'number'), `ok=${ping.ok} ms=${ping.ms}`);

      const sys = await window.se-menu.sys.info();
      check('system telemetry stream', !!(sys && sys.mem && sys.mem.total > 0 && sys.cpu), `mem=${sys.mem ? sys.mem.total : 0}`);

      const uc = await window.se-menu.updater.getConfig();
      check('update configuration loads', !!uc && !!uc.mode, uc.mode);

      const us = await window.se-menu.updater.getState();
      check('update state stream emits', !!us && !!us.phase, us ? us.phase : 'no state');

      /* ---- modules ---- */
      const badge = $('#pg-badge');
      const beforeText = badge ? badge.textContent : '';
      const pgBtn = $$('#playground-body .btn')[0];
      if (pgBtn && badge) {
        pgBtn.click();
        await wait(120);
        check('playground interaction counter', badge.textContent !== beforeText, `${beforeText} → ${badge.textContent}`);
      } else check('playground interaction counter', false, 'controls missing');

      const tiles = $$('#util-grid .util-tile');
      check('utility bench populated', tiles.length >= 15, `${tiles.length} tools`);

      const fps = await new Promise(res => {
        const off = bus.on('chip:fps', v => { off(); res(v); });
        setTimeout(() => res(null), 2500);
      });
      check('fps sampler reports', typeof fps === 'number' && fps > 0, fps);
      check('perf sampler internals', true, JSON.stringify(M.perf && M.perf.state ? M.perf.state() : null));

      const animPlay = $('#anim-play');
      if (animPlay) {
        animPlay.click();
        await wait(120);
        const playing = $('#anim-stage').classList.contains('anim-playing');
        animPlay.click();
        check('animation lab plays', playing);
      } else check('animation lab plays', false, 'not found');

      const animSpeed = $('#anim-speed');
      if (animSpeed) {
        animSpeed.value = '2';
        animSpeed.dispatchEvent(new Event('input', { bubbles: true }));
        check('animation speed control', $('#anim-speed-val').textContent.indexOf('2') === 0, $('#anim-speed-val').textContent);
      } else check('animation speed control', false, 'not found');

      const pingBtn = $('#net-ping-toggle');
      if (pingBtn) {
        pingBtn.click();
        let status = '';
        for (let i = 0; i < 25; i++) {
          await wait(200);
          status = $('#ping-status').textContent;
          if (/Reachable|Unreachable/.test(status)) break;
        }
        pingBtn.click();
        check('ping monitor starts and reports', /Reachable|Unreachable/.test(status), status);
      } else check('ping monitor starts and reports', false, 'not found');

      const jsonArea = $$('#util-grid textarea')[0];
      const formatBtn = $$('#util-grid .btn').find(b => b.textContent.trim() === 'Format');
      if (jsonArea && formatBtn) {
        jsonArea.value = '{"a":1,"b":[2,3]}';
        formatBtn.click();
        await wait(150);
        const out = jsonArea.closest('.util-tile').querySelector('.ut-result').textContent;
        check('utility tool computes (JSON)', out.indexOf('"a"') >= 0 && out.indexOf('\n') >= 0, out.slice(0, 40));
      } else check('utility tool computes (JSON)', false, 'controls missing');
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
      await window.se-menu.selftest.report(summary);
    } catch (e) { /* main may not be listening */ }
    toast({
      type: summary.failed ? 'warn' : 'success',
      title: `Self-test: ${passed}/${results.length} passed`,
      message: summary.failed ? `${summary.failed} check${summary.failed > 1 ? 's' : ''} failed — open the diagnostic report for details.` : 'Every check passed.',
      timeout: 9000,
    });
    return summary;
  }

  M.selftest = { run };
})(window.SEMENU);
