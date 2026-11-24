/* ============================================================================
   timelab.js — Time Lab: live clock, stopwatch with laps, countdown with
   progress ring, session tracking.
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, $$, clear, toast, bus, fmtDuration, fmtCountdown, fmtUptime, fmtDate, fmtTime, icon } = P.dom;

  let refs = null;
  let raf = null;
  let sessionStart = Date.now();
  let unsubTick = null;
  let audioCtx = null;

  /* stopwatch state */
  let swAccum = 0;
  let swStart = 0;
  let swRunning = false;
  let laps = [];

  /* countdown state */
  let cdTotal = 0;
  let cdRemaining = 0;
  let cdEnd = 0;
  let cdRunning = false;
  let cdRing = null;

  function beep() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.start(t);
      osc.stop(t + 0.75);
    } catch (e) { /* audio unavailable */ }
  }

  /* ------------------------------------------------------------- clock */

  function tickClock() {
    if (!refs) return;
    const now = new Date();
    refs.clockTime.innerHTML = fmtTime(now, refs.clock24.checked, refs.clockMsToggle.checked);
    const dateStr = fmtDate(now);
    if (refs.clockDate.textContent !== dateStr) refs.clockDate.textContent = dateStr;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
    if (refs.clockTz.textContent !== tz) refs.clockTz.textContent = tz;

    const sessionMs = Date.now() - sessionStart;
    const sessionStr = fmtUptime(sessionMs / 1000);
    refs.sessionTime.textContent = sessionStr;
    refs.sessionBadge.textContent = `Session ${sessionStr}`;
    refs.processUptime.textContent = fmtUptime(performance.now() / 1000);
  }

  /* -------------------------------------------------------- stopwatch */

  function swNow() {
    return swAccum + (swRunning ? performance.now() - swStart : 0);
  }

  function renderLaps() {
    if (!refs) return;
    clear(refs.swLaps);
    if (!laps.length) {
      refs.swLaps.appendChild(h('div', { class: 'empty-state', style: 'padding:12px', text: 'No laps yet' }));
      return;
    }
    let prev = 0;
    for (const lap of laps) {
      const delta = lap.t - prev;
      prev = lap.t;
      refs.swLaps.appendChild(h('div', { class: 'list-row' },
        h('div', { class: 'lr-icon', html: icon('flag', 13) }),
        h('div', { class: 'lr-text' },
          h('div', { class: 'lr-title', text: `Lap ${lap.n}` }),
          h('div', { class: 'lr-sub', text: `+${fmtDuration(delta)}` }),
        ),
        h('div', { class: 'lr-value', text: fmtDuration(lap.t) }),
      ));
    }
    refs.swLaps.scrollTop = refs.swLaps.scrollHeight;
  }

  function toggleStopwatch() {
    if (swRunning) {
      swAccum = swNow();
      swRunning = false;
      refs.swStart.innerHTML = `${icon('play', 15)}<span id="sw-start-label">Resume</span>`;
    } else {
      swStart = performance.now();
      swRunning = true;
      refs.swStart.innerHTML = `${icon('pause', 15)}<span id="sw-start-label">Pause</span>`;
      bus.emit('log', { level: 'info', message: 'stopwatch started' });
    }
  }

  function lapStopwatch() {
    if (!swRunning) return;
    laps.unshift({ n: laps.length + 1, t: swNow() });
    if (laps.length > 50) laps.pop();
    renderLaps();
    bus.emit('log', { level: 'info', message: `lap ${laps.length}: ${fmtDuration(laps[0].t)}` });
  }

  function resetStopwatch() {
    swAccum = 0;
    swRunning = false;
    laps = [];
    refs.swTime.textContent = '00:00.000';
    refs.swStart.innerHTML = `${icon('play', 15)}<span id="sw-start-label">Start</span>`;
    renderLaps();
  }

  /* --------------------------------------------------------- countdown */

  function readCountdownInputs() {
    const min = Math.max(0, Math.min(999, parseInt(refs.cdMin.value, 10) || 0));
    const sec = Math.max(0, Math.min(59, parseInt(refs.cdSec.value, 10) || 0));
    return (min * 60 + sec) * 1000;
  }

  function drawRing(frac) {
    if (!cdRing) return;
    const { ctx, w, h } = cdRing;
    if (!ctx || !w) return;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 10;
    const a0 = -Math.PI / 2;
    const a1 = a0 + Math.PI * 2 * Math.max(0, Math.min(1, frac));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 10;
    ctx.stroke();
    if (frac > 0.001) {
      const css = getComputedStyle(document.documentElement);
      const c1 = css.getPropertyValue('--acc-1').trim() || '#22d3ee';
      const c2 = css.getPropertyValue('--acc-3').trim() || '#e879f9';
      const g = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, a1);
      ctx.strokeStyle = g;
      ctx.lineWidth = 10;
      ctx.shadowColor = 'rgba(34,211,238,0.45)';
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function updateCountdown() {
    if (!refs) return;
    if (cdRunning) {
      cdRemaining = Math.max(0, cdEnd - performance.now());
      if (cdRemaining <= 0) {
        cdRunning = false;
        cdRemaining = 0;
        refs.cdStart.innerHTML = `${icon('play', 15)}<span id="cd-start-label">Start</span>`;
        refs.cdValue.textContent = '00:00';
        drawRing(0);
        beep();
        toast({ type: 'success', title: 'Countdown finished', message: 'The timer reached zero.', timeout: 6000 });
        bus.emit('log', { level: 'success', message: 'countdown completed' });
        return;
      }
    }
    refs.cdValue.textContent = fmtCountdown(cdRemaining);
    drawRing(cdTotal > 0 ? cdRemaining / cdTotal : 0);
  }

  function toggleCountdown() {
    if (cdRunning) {
      cdRemaining = Math.max(0, cdEnd - performance.now());
      cdRunning = false;
      refs.cdStart.innerHTML = `${icon('play', 15)}<span id="cd-start-label">Resume</span>`;
      bus.emit('log', { level: 'info', message: `countdown paused at ${fmtCountdown(cdRemaining)}` });
      return;
    }
    if (cdRemaining <= 0) {
      cdTotal = readCountdownInputs();
      if (cdTotal <= 0) {
        toast({ type: 'warn', title: 'Set a duration first', message: 'Enter minutes and seconds for the countdown.' });
        return;
      }
      cdRemaining = cdTotal;
    }
    cdEnd = performance.now() + cdRemaining;
    cdRunning = true;
    refs.cdStart.innerHTML = `${icon('pause', 15)}<span id="cd-start-label">Pause</span>`;
    bus.emit('log', { level: 'info', message: `countdown started: ${fmtCountdown(cdRemaining)}` });
  }

  function resetCountdown() {
    cdRunning = false;
    cdRemaining = 0;
    cdTotal = readCountdownInputs();
    refs.cdStart.innerHTML = `${icon('play', 15)}<span id="cd-start-label">Start</span>`;
    refs.cdValue.textContent = fmtCountdown(cdTotal);
    drawRing(1);
  }

  /* ------------------------------------------------------------- init */

  M.timelab = {
    init(root) {
      refs = {
        clockTime: $('#clock-time', root),
        clockDate: $('#clock-date', root),
        clockTz: $('#clock-tz', root),
        clock24: $('#clock-24h', root),
        clockMsToggle: $('#clock-ms-toggle', root),
        swTime: $('#stopwatch-time', root),
        swStart: $('#sw-start', root),
        swLap: $('#sw-lap', root),
        swReset: $('#sw-reset', root),
        swLaps: $('#sw-laps', root),
        cdMin: $('#cd-min', root),
        cdSec: $('#cd-sec', root),
        cdStart: $('#cd-start', root),
        cdReset: $('#cd-reset', root),
        cdValue: $('#countdown-value', root),
        sessionTime: $('#session-time', root),
        sessionBadge: $('#session-badge', root),
        systemUptime: $('#system-uptime', root),
        processUptime: $('#process-uptime', root),
        tzName: $('#tz-name', root),
        clockDrift: $('#clock-drift', root),
        copyTime: $('#btn-copy-time', root),
      };

      // countdown ring canvas
      const canvas = $('#countdown-ring', root);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = canvas.parentElement.clientWidth || 130;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cdRing = { ctx, w: size, h: size };

      refs.swStart.addEventListener('click', toggleStopwatch);
      refs.swLap.addEventListener('click', lapStopwatch);
      refs.swReset.addEventListener('click', resetStopwatch);
      refs.cdStart.addEventListener('click', toggleCountdown);
      refs.cdReset.addEventListener('click', resetCountdown);
      $$('[data-cd-preset]', root).forEach(btn => {
        btn.addEventListener('click', () => {
          const [m, s] = btn.dataset.cdPreset.split(':').map(Number);
          refs.cdMin.value = m;
          refs.cdSec.value = s;
          resetCountdown();
          bus.emit('log', { level: 'info', message: `countdown preset: ${btn.dataset.cdPreset}` });
        });
      });
      refs.copyTime.addEventListener('click', () => {
        const ts = new Date().toISOString();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(ts).then(() => {
            toast({ type: 'success', title: 'Timestamp copied', message: ts });
          }).catch(() => toast({ type: 'warn', title: 'Clipboard unavailable', message: ts }));
        } else {
          toast({ type: 'info', title: 'Current timestamp', message: ts });
        }
      });

      unsubTick = bus.on('sys:tick', data => {
        if (refs && data.uptime != null) refs.systemUptime.textContent = fmtUptime(data.uptime);
      });

      // clock drift: compare the wall clock against the monotonic clock origin
      const drift = () => {
        if (!refs) return;
        const wall = Date.now();
        const mono = performance.timeOrigin + performance.now();
        refs.clockDrift.textContent = `${(wall - mono).toFixed(0)} ms`;
      };
      drift();
      setInterval(drift, 5000);

      refs.tzName.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || '—';
      resetCountdown();
      renderLaps();

      const loop = () => {
        tickClock();
        if (swRunning) refs.swTime.textContent = fmtDuration(swNow());
        if (cdRunning || cdRemaining > 0) updateCountdown();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      bus.emit('log', { level: 'info', message: 'time lab initialized' });
    },

    destroy() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      if (unsubTick) unsubTick();
      refs = null;
    },
  };
})(window.SEMENU);
