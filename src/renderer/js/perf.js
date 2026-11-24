/* ============================================================================
   perf.js — Performance Bench: FPS, frame time, heap, event-loop lag,
   CPU benchmark (main process) and input latency measurement.
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, $$, clear, toast, bus, fmtBytes, fmtInt, icon } = P.dom;

  let refs = null;
  let raf = null;
  let fpsChart = null;
  let frameChart = null;
  let heapChart = null;
  let lagChart = null;
  let heapTimer = null;
  let lagTimer = null;
  let statTimer = null;
  let lastFramePaint = performance.now();
  let frames = 0;
  let acc = 0;
  let fpsAvg = 0;
  let fpsSamples = 0;
  let benchRunning = false;
  let benchCount = 0;
  let latencySamples = [];

  function pushHeap() {
    const m = performance.memory;
    if (!m) return;
    heapChart.push(m.usedJSHeapSize / 1048576);
    refs.heapValue.textContent = fmtBytes(m.usedJSHeapSize);
    refs.heapValue.style.color = m.usedJSHeapSize / (m.jsHeapSizeLimit || 1) > 0.8 ? 'var(--warn)' : 'var(--text-1)';
  }

  function startLoop() {
    let last = performance.now();
    const loop = now => {
      const dt = now - last;
      last = now;
      lastFramePaint = now;
      frames++;
      acc += dt;
      if (acc >= 500) {
        const fps = (frames * 1000) / acc;
        frames = 0;
        acc = 0;
        fpsAvg = fpsSamples ? fpsAvg * 0.7 + fps * 0.3 : fps;
        fpsSamples++;
        refs.fpsValue.textContent = fps.toFixed(0);
        refs.fpsBadge.textContent = `${fps.toFixed(0)} FPS`;
        refs.fpsValue.style.color = fps < 30 ? 'var(--err)' : fps < 50 ? 'var(--warn)' : 'var(--text-1)';
        bus.emit('chip:fps', fps);
        fpsChart.push(fps);
        frameChart.push(Math.min(100, dt));
        refs.frameValue.textContent = `${dt.toFixed(1)} ms`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function startLagMonitor() {
    let expected = performance.now() + 1000;
    lagTimer = setInterval(() => {
      const now = performance.now();
      const lag = Math.max(0, now - expected);
      expected = now + 1000;
      lagChart.push(lag);
      refs.lagValue.textContent = `${lag.toFixed(0)} ms`;
      refs.lagValue.style.color = lag > 50 ? 'var(--err)' : lag > 20 ? 'var(--warn)' : 'var(--text-1)';
    }, 1000);
  }

  function startStats() {
    statTimer = setInterval(() => {
      const nodes = document.getElementsByTagName('*').length;
      refs.domValue.textContent = fmtInt(nodes);
      refs.framesValue.textContent = fmtInt(parseInt(refs.framesValue.dataset.n || '0', 10) + 1);
      refs.framesValue.dataset.n = refs.framesValue.textContent;
    }, 5000);
  }

  function runBenchmark() {
    if (benchRunning || !refs) return;
    benchRunning = true;
    refs.benchRun.disabled = true;
    refs.benchProgress.style.width = '20%';
    refs.benchStatus.textContent = 'Running… (main process worker)';
    const started = performance.now();
    window.seMenu.perf.benchmark(3).then(res => {
      const wall = performance.now() - started;
      refs.benchProgress.style.width = '100%';
      setTimeout(() => { refs.benchProgress.style.width = '0%'; }, 700);
      benchCount++;
      if (res.ok) {
        const perIter = res.ms / Math.max(1, res.iterations);
        refs.benchValue.textContent = `${res.ms.toFixed(0)} ms`;
        refs.benchStatus.textContent = `${res.iterations} iterations · ${perIter.toFixed(0)} ms/iter · checksum ${res.checksum}`;
        prependHistory(h('div', { class: 'list-row' },
          h('div', { class: 'lr-icon', html: icon('check-circle', 13) }),
          h('div', { class: 'lr-text' },
            h('div', { class: 'lr-title', text: `Run ${benchCount}` }),
            h('div', { class: 'lr-sub', text: `${res.ms.toFixed(0)} ms · ${perIter.toFixed(0)} ms/iter · wall ${wall.toFixed(0)} ms` }),
          ),
          h('div', { class: 'lr-value', text: `${res.ms.toFixed(0)} ms` }),
        ));
        toast({ type: 'success', title: 'Benchmark complete', message: `${res.ms.toFixed(0)} ms for ${res.iterations} iterations (${res.checksum})` });
        bus.emit('log', { level: 'success', message: `benchmark: ${res.ms.toFixed(0)} ms / ${res.iterations} iters · checksum ${res.checksum}` });
      } else {
        refs.benchStatus.textContent = `failed: ${res.error}`;
        bus.emit('log', { level: 'error', message: `benchmark failed: ${res.error}` });
      }
      refs.benchRun.disabled = false;
      benchRunning = false;
    }).catch(e => {
      refs.benchStatus.textContent = `failed: ${e.message}`;
      refs.benchRun.disabled = false;
      benchRunning = false;
    });
  }

  function prependHistory(node) {
    if (!refs) return;
    const empty = refs.benchHistory.querySelector('.empty-state');
    if (empty) empty.remove();
    refs.benchHistory.prepend(node);
    while (refs.benchHistory.children.length > 20) refs.benchHistory.lastChild.remove();
  }

  function measureLatency() {
    if (!refs) return;
    const target = refs.latencyRun;
    const onClick = () => {
      const dt = performance.now() - lastFramePaint;
      target.removeEventListener('click', onClick);
      latencySamples.push(dt);
      if (latencySamples.length > 12) latencySamples.shift();
      const avg = latencySamples.reduce((a, b) => a + b, 0) / latencySamples.length;
      refs.latencyValue.textContent = `${dt.toFixed(1)} ms`;
      refs.latencyStatus.textContent = `last click ${dt.toFixed(1)} ms after last presented frame · avg ${avg.toFixed(1)} ms`;
      const chip = h('span', { class: 'badge' + (dt > 40 ? ' warn' : ' ok'), text: `${dt.toFixed(0)}ms` });
      refs.latencyHistory.appendChild(chip);
      while (refs.latencyHistory.children.length > 10) refs.latencyHistory.firstChild.remove();
      bus.emit('log', { level: 'info', message: `input latency sample: ${dt.toFixed(1)} ms` });
    };
    target.addEventListener('click', onClick);
    toast({ type: 'info', title: 'Latency test armed', message: 'Click the "Measure click latency" button — the gap since the last presented frame is measured.' });
  }

  M.perf = {
    init(root) {
      refs = {
        fpsValue: $('#fps-value', root),
        fpsBadge: $('#fps-badge', root),
        fpsChart: $('#fps-chart', root),
        frameValue: $('#frame-value', root),
        frameChart: $('#frame-chart', root),
        heapValue: $('#heap-value', root),
        heapChart: $('#heap-chart', root),
        lagValue: $('#lag-value', root),
        lagChart: $('#lag-chart', root),
        benchRun: $('#bench-run', root),
        benchValue: $('#bench-value', root),
        benchStatus: $('#bench-status', root),
        benchProgress: $('#bench-progress', root),
        benchHistory: $('#bench-history', root),
        latencyRun: $('#latency-run', root),
        latencyValue: $('#latency-value', root),
        latencyStatus: $('#latency-status', root),
        latencyHistory: $('#latency-history', root),
        domValue: $('#dom-value', root),
        framesValue: $('#frames-value', root),
      };

      fpsChart = new P.charts.LineChart(refs.fpsChart, { color: '#34d399', yMin: 0, yMax: 144, points: 90, glow: 8, fillAlpha: 0.18 });
      frameChart = new P.charts.LineChart(refs.frameChart, { color: '#fbbf24', yMin: 0, yMax: 40, points: 90, glow: 6, fillAlpha: 0.16 });
      heapChart = new P.charts.LineChart(refs.heapChart, { color: '#818cf8', yMin: 0, yMax: null, points: 60, glow: 6, fillAlpha: 0.18 });
      lagChart = new P.charts.LineChart(refs.lagChart, { color: '#f87171', yMin: 0, yMax: null, points: 60, glow: 6, fillAlpha: 0.16 });

      refs.benchRun.addEventListener('click', runBenchmark);
      refs.latencyRun.addEventListener('click', measureLatency);

      startLoop();
      startLagMonitor();
      startStats();
      heapTimer = setInterval(pushHeap, 1000);
      pushHeap();

      // a few extra live tiles in the performance card
      const extra = h('div', { class: 'mon-tile wide' },
        h('div', { class: 'mon-head' },
          h('div', { class: 'mh-icon', html: icon('grid', 13) }),
          h('div', { class: 'mh-title', text: 'UI statistics' }),
        ),
        h('div', { class: 'stat-row', style: 'grid-template-columns: repeat(3, 1fr)' },
          h('div', { class: 'stat' }, h('div', { class: 'stat-label', text: 'DOM nodes' }), h('div', { class: 'stat-value', id: 'dom-value', text: '—' })),
          h('div', { class: 'stat' }, h('div', { class: 'stat-label', text: 'Stat ticks' }), h('div', { class: 'stat-value', id: 'frames-value', text: '0', dataset: { n: '0' } })),
          h('div', { class: 'stat' }, h('div', { class: 'stat-label', text: 'Avg FPS' }), h('div', { class: 'stat-value', id: 'avg-fps-value', text: '—' })),
        ),
      );
      refs.fpsChart.closest('.mon-grid').appendChild(extra);
      refs.domValue = $('#dom-value');
      refs.framesValue = $('#frames-value');
      refs.avgFpsValue = $('#avg-fps-value');
      const avgTimer = setInterval(() => {
        if (refs && refs.avgFpsValue) refs.avgFpsValue.textContent = fpsSamples ? fpsAvg.toFixed(0) : '—';
      }, 1000);
      this._avgTimer = avgTimer;

      bus.emit('log', { level: 'info', message: 'performance bench initialized' });
    },

    destroy() {
      if (raf) cancelAnimationFrame(raf);
      if (heapTimer) clearInterval(heapTimer);
      if (lagTimer) clearInterval(lagTimer);
      if (statTimer) clearInterval(statTimer);
      if (this._avgTimer) clearInterval(this._avgTimer);
      if (fpsChart) fpsChart.destroy();
      if (frameChart) frameChart.destroy();
      if (heapChart) heapChart.destroy();
      if (lagChart) lagChart.destroy();
      refs = null;
    },

    state() {
      return { fps: !!raf, frames, samples: fpsSamples, avg: fpsSamples ? fpsAvg : 0 };
    },
  };
})(window.SEMENU);
