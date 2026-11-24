/* ============================================================================
   netlab.js — Network Lab: ping monitor, speed test, DNS, traceroute,
   interfaces. All measurements are real.
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, $$, clear, toast, bus, fmtMs, fmtMbps, clamp, icon } = P.dom;

  let refs = null;
  let pingChart = null;
  let downGauge = null;
  let upGauge = null;
  let pingTimer = null;
  let running = false;
  let speedRunning = false;
  let history = [];
  const MAX_HISTORY = 120;

  /* ------------------------------------------------------------- ping */

  function setStatus(level, text) {
    if (!refs) return;
    refs.status.textContent = text;
    const colors = { ok: 'var(--ok)', err: 'var(--err)', warn: 'var(--warn)', idle: 'var(--text-3)' };
    refs.dot.style.background = colors[level] || colors.idle;
    refs.dot.style.boxShadow = level === 'ok' ? '0 0 10px rgba(52,211,153,.7)' : level === 'err' ? '0 0 10px rgba(248,113,113,.7)' : 'none';
    refs.badgeEl.className = 'badge ' + (level === 'ok' ? 'ok' : level === 'err' ? 'err' : level === 'warn' ? 'warn' : 'acc');
    refs.badge.textContent = text;
    P.app.setSideStatus(text, level === 'ok' ? '' : level === 'err' ? 'err' : level === 'warn' ? 'warn' : '');
  }

  function updateStats() {
    if (!refs) return;
    const ok = history.filter(v => v != null);
    const lost = history.length - ok.length;
    if (!ok.length) {
      refs.avg.textContent = '—';
      refs.min.textContent = '—';
      refs.max.textContent = '—';
      refs.jitter.textContent = '—';
      refs.loss.textContent = history.length ? '100%' : '—';
      refs.samplesEl.textContent = String(history.length);
      return;
    }
    const sum = ok.reduce((a, b) => a + b, 0);
    const avg = sum / ok.length;
    const min = Math.min(...ok);
    const max = Math.max(...ok);
    let jitter = 0;
    for (let i = 1; i < ok.length; i++) jitter += Math.abs(ok[i] - ok[i - 1]);
    jitter = ok.length > 1 ? jitter / (ok.length - 1) : 0;
    refs.avg.innerHTML = `${fmtMs(avg)}<span class="unit">ms</span>`;
    refs.min.innerHTML = `${fmtMs(min)}<span class="unit">ms</span>`;
    refs.max.innerHTML = `${fmtMs(max)}<span class="unit">ms</span>`;
    refs.jitter.innerHTML = `${fmtMs(jitter)}<span class="unit">ms</span>`;
    refs.loss.textContent = `${((lost / history.length) * 100).toFixed(1)}%`;
    refs.loss.style.color = lost > 0 ? 'var(--warn)' : 'var(--text-1)';
    refs.samplesEl.textContent = String(history.length);
  }

  async function pingOnce() {
    if (!running || !refs) return;
    const host = (refs.host.value || '1.1.1.1').trim() || '1.1.1.1';
    try {
      const res = await window.se-menu.net.ping(host, 2000);
      if (!running) return;
      history.push(res.ok && res.ms != null ? res.ms : null);
      if (history.length > MAX_HISTORY) history.shift();
      if (res.ok && res.ms != null) {
        refs.value.textContent = fmtMs(res.ms);
        refs.value.style.color = res.ms < 60 ? 'var(--text-1)' : res.ms < 140 ? 'var(--warn)' : 'var(--err)';
        setStatus('ok', `Reachable · ${host}`);
        bus.emit('chip:ping', res.ms);
        pingChart.push(res.ms);
      } else {
        refs.value.textContent = '✕';
        refs.value.style.color = 'var(--err)';
        setStatus('err', `Unreachable · ${host}`);
        bus.emit('chip:ping', null);
        pingChart.push(0);
      }
      updateStats();
    } catch (e) {
      setStatus('err', `Ping error: ${e.message}`);
    }
  }

  function startPing() {
    if (running) return;
    running = true;
    refs.toggle.innerHTML = `${icon('stop', 15)}<span id="net-ping-toggle-label">Stop ping</span>`;
    refs.toggle.classList.add('btn-danger');
    refs.toggle.classList.remove('btn-primary');
    const interval = Math.max(300, Number(P.app.state.config.network.pingIntervalMs) || 1000);
    pingOnce();
    pingTimer = setInterval(pingOnce, interval);
    bus.emit('log', { level: 'info', message: `ping monitor started → ${refs.host.value}` });
  }

  function stopPing() {
    running = false;
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    if (!refs) return;
    refs.toggle.innerHTML = `${icon('play', 15)}<span id="net-ping-toggle-label">Start ping</span>`;
    refs.toggle.classList.remove('btn-danger');
    refs.toggle.classList.add('btn-primary');
    setStatus('idle', 'Stopped');
    P.app.setSideStatus('Ready', '');
    bus.emit('log', { level: 'info', message: 'ping monitor stopped' });
  }

  /* --------------------------------------------------------- speed test */

  async function runSpeedTest() {
    if (speedRunning || !refs) return;
    speedRunning = true;
    const cfg = P.app.state.config.network;
    const downUrl = cfg.speedDownUrl;
    const upUrl = cfg.speedUpUrl;
    const dur = Math.max(3000, Number(cfg.speedDurationMs) || 12000);
    refs.speedStart.disabled = true;
    refs.speedStart.classList.add('btn-loading');
    refs.speedStart.innerHTML = '<span class="btn-spinner"></span>';
    refs.speedStatus.textContent = 'Testing download…';
    refs.speedProgress.style.width = '0%';
    refs.downVal.textContent = '—';
    refs.upVal.textContent = '—';
    downGauge.setValue(0);
    upGauge.setValue(0);

    const off = window.se-menu.net.onSpeedProgress(p => {
      const pct = clamp((p.elapsed / dur) * 100, 0, 100);
      refs.speedProgress.style.width = `${pct}%`;
      if (p.phase === 'download') {
        refs.speedStatus.textContent = `Download… ${fmtMbps(p.instant)} Mbps`;
        refs.downVal.textContent = fmtMbps(p.instant);
        downGauge.setValue(p.instant);
      } else {
        refs.speedStatus.textContent = `Upload… ${fmtMbps(p.instant)} Mbps`;
        refs.upVal.textContent = fmtMbps(p.instant);
        upGauge.setValue(p.instant);
      }
    });

    try {
      const down = await window.se-menu.net.speedtest('download', downUrl, dur);
      refs.downVal.textContent = fmtMbps(down.mbps);
      downGauge.opts.max = Math.max(100, Math.ceil(down.mbps * 1.25));
      downGauge.setValue(down.mbps);
      bus.emit('log', { level: 'success', message: `download: ${fmtMbps(down.mbps)} Mbps (${P.dom.fmtBytes(down.bytes)} in ${(down.durationMs / 1000).toFixed(1)}s)` });

      refs.speedStatus.textContent = 'Testing upload…';
      const up = await window.se-menu.net.speedtest('upload', upUrl, dur);
      refs.upVal.textContent = fmtMbps(up.mbps);
      upGauge.opts.max = Math.max(100, Math.ceil(up.mbps * 1.25));
      upGauge.setValue(up.mbps);
      bus.emit('log', { level: 'success', message: `upload: ${fmtMbps(up.mbps)} Mbps (${P.dom.fmtBytes(up.bytes)} in ${(up.durationMs / 1000).toFixed(1)}s)` });

      refs.speedStatus.textContent = `Done · ↓${fmtMbps(down.mbps)} ↑${fmtMbps(up.mbps)} Mbps`;
      toast({
        type: 'success',
        title: 'Speed test complete',
        message: `${fmtMbps(down.mbps)} Mbps down · ${fmtMbps(up.mbps)} Mbps up`,
      });
    } catch (e) {
      refs.speedStatus.textContent = `Failed: ${e.message}`;
      bus.emit('log', { level: 'error', message: `speed test failed: ${e.message}` });
      toast({ type: 'error', title: 'Speed test failed', message: e.message, timeout: 6000 });
    } finally {
      off();
      refs.speedStart.disabled = false;
      refs.speedStart.classList.remove('btn-loading');
      refs.speedStart.innerHTML = `${icon('zap', 15)} Run speed test`;
      speedRunning = false;
    }
  }

  /* ------------------------------------------------------- connectivity */

  async function detectExternalIp() {
    if (!refs) return;
    refs.extip.disabled = true;
    refs.extipVal.textContent = 'detecting…';
    refs.extipVal.style.color = 'var(--text-3)';
    const res = await window.se-menu.net.externalIP();
    refs.extip.disabled = false;
    if (res.ok) {
      refs.extipVal.textContent = `${res.ip} · ${res.timeMs} ms`;
      refs.extipVal.style.color = 'var(--ok)';
      bus.emit('log', { level: 'info', message: `public IP: ${res.ip} (${res.timeMs} ms)` });
    } else {
      refs.extipVal.textContent = `failed: ${res.error}`;
      refs.extipVal.style.color = 'var(--err)';
      bus.emit('log', { level: 'warn', message: `public IP lookup failed: ${res.error}` });
    }
  }

  async function runDns() {
    if (!refs) return;
    const host = refs.dnsHost.value.trim();
    if (!host) {
      refs.dnsResult.textContent = 'Enter a hostname to resolve';
      refs.dnsResult.style.color = 'var(--warn)';
      return;
    }
    const type = refs.dnsType.value;
    refs.dnsBtn.disabled = true;
    refs.dnsResult.style.color = 'var(--text-3)';
    refs.dnsResult.textContent = `resolving ${type} ${host}…`;
    const res = await window.se-menu.net.dns(host, type);
    refs.dnsBtn.disabled = false;
    if (res.ok) {
      const flat = res.answers.map(a => Array.isArray(a) ? a.join(' ') : (a && typeof a === 'object' ? JSON.stringify(a) : String(a)));
      refs.dnsResult.style.color = 'var(--text-2)';
      refs.dnsResult.textContent = flat.length ? `${res.timeMs} ms · ${flat.slice(0, 5).join('  ·  ')}` : `${res.timeMs} ms · no records`;
      bus.emit('log', { level: 'success', message: `DNS ${type} ${host}: ${flat.slice(0, 3).join(', ') || 'no records'} (${res.timeMs} ms)` });
    } else {
      refs.dnsResult.style.color = 'var(--err)';
      refs.dnsResult.textContent = `${res.error} (${res.timeMs} ms)`;
      bus.emit('log', { level: 'warn', message: `DNS ${type} ${host} failed: ${res.error}` });
    }
  }

  async function loadInterfaces() {
    if (!refs) return;
    const list = await window.se-menu.net.interfaces();
    clear(refs.ifaces);
    const filtered = list.filter(ni => !(ni.family === 'IPv6' && /^fe80/i.test(ni.address)));
    if (!filtered.length) {
      refs.ifaces.appendChild(h('div', { class: 'empty-state', text: 'No interfaces found' }));
      return;
    }
    for (const ni of filtered) {
      const isWireless = /wi-?fi|wireless|wlan/i.test(ni.name);
      refs.ifaces.appendChild(h('div', { class: 'list-row' },
        h('div', { class: 'lr-icon', html: icon(ni.internal ? 'lock' : isWireless ? 'wifi' : 'network', 13) }),
        h('div', { class: 'lr-text' },
          h('div', { class: 'lr-title', text: ni.name }),
          h('div', { class: 'lr-sub', text: `${ni.family} · ${ni.mac || 'no mac'}` }),
        ),
        h('div', { class: 'lr-value', text: ni.address }),
      ));
    }
    bus.emit('log', { level: 'info', message: `${filtered.length} network interfaces enumerated` });
  }

  /* -------------------------------------------------------- traceroute */

  function runTrace() {
    if (!refs) return;
    const host = (refs.traceHost.value || refs.host.value || '1.1.1.1').trim() || '1.1.1.1';
    refs.traceBtn.disabled = true;
    refs.traceStatus.textContent = 'tracing…';
    clear(refs.traceResults);
    const off = window.se-menu.net.onTraceHop(hop => {
      refs.traceResults.appendChild(h('div', { class: 'list-row' },
        h('div', { class: 'lr-icon', html: icon(hop.timeout ? 'x-circle' : 'chevron-right', 13) }),
        h('div', { class: 'lr-text' },
          h('div', { class: 'lr-title', text: hop.ip || `hop ${hop.n}` }),
          h('div', { class: 'lr-sub', text: hop.timeout ? 'no reply' : `${hop.times.map(t => t.toFixed(0)).join(' / ')} ms` }),
        ),
        h('div', { class: 'lr-value', text: hop.ms != null ? `${hop.ms.toFixed(1)} ms` : '—' }),
      ));
      bus.emit('log', { level: 'debug', message: `trace ${hop.n}: ${hop.ip || '*'} ${hop.ms != null ? `${hop.ms.toFixed(1)}ms` : 'timeout'}` });
    });
    window.se-menu.net.traceroute(host)
      .then(res => {
        refs.traceStatus.textContent = res.ok ? `${res.hops.length} hops to ${host}` : `stopped (${res.error || 'no reply'})`;
        if (!res.hops.length) refs.traceResults.appendChild(h('div', { class: 'empty-state', text: 'No hops returned' }));
        bus.emit('log', { level: 'info', message: `traceroute ${host}: ${res.hops.length} hops` });
      })
      .catch(e => { refs.traceStatus.textContent = `failed: ${e.message}`; })
      .finally(() => { off(); refs.traceBtn.disabled = false; });
  }

  function clearTrace() {
    if (!refs) return;
    clear(refs.traceResults);
    refs.traceStatus.textContent = 'Idle';
  }

  /* ------------------------------------------------------------- init */

  M.netlab = {
    init(root) {
      refs = {
        host: $('#ping-host', root),
        preset: $('#ping-preset', root),
        toggle: $('#net-ping-toggle', root),
        value: $('#ping-value', root),
        dot: $('#ping-dot', root),
        status: $('#ping-status', root),
        badge: $('#net-status-text', root),
        badgeEl: $('#net-status-badge', root),
        avg: $('#ping-avg', root),
        min: $('#ping-min', root),
        max: $('#ping-max', root),
        jitter: $('#ping-jitter', root),
        loss: $('#ping-loss', root),
        samplesEl: $('#ping-samples', root),
        chart: $('#ping-chart', root),
        gaugeDown: $('#gauge-down', root),
        gaugeUp: $('#gauge-up', root),
        downVal: $('#speed-down-value', root),
        upVal: $('#speed-up-value', root),
        speedProgress: $('#speed-progress', root),
        speedStart: $('#speed-start', root),
        speedStatus: $('#speed-status', root),
        extip: $('#net-extip', root),
        extipVal: $('#extip-value', root),
        dnsHost: $('#dns-host', root),
        dnsType: $('#dns-type', root),
        dnsBtn: $('#dns-lookup', root),
        dnsResult: $('#dns-result', root),
        ifaces: $('#iface-list', root),
        traceHost: $('#trace-host', root),
        traceBtn: $('#trace-start', root),
        traceStatus: $('#trace-status', root),
        traceResults: $('#trace-results', root),
      };

      pingChart = new P.charts.LineChart(refs.chart, { color: '#22d3ee', points: MAX_HISTORY, yMin: 0, yMax: 60, glow: 10, fillAlpha: 0.22 });
      downGauge = new P.charts.Gauge(refs.gaugeDown, { min: 0, max: 100, color: '#22d3ee', color2: '#818cf8' });
      upGauge = new P.charts.Gauge(refs.gaugeUp, { min: 0, max: 100, color: '#e879f9', color2: '#f472b6' });

      refs.toggle.addEventListener('click', () => (running ? stopPing() : startPing()));
      refs.preset.addEventListener('change', () => {
        if (refs.preset.value !== 'custom') refs.host.value = refs.preset.value;
        else { refs.host.focus(); refs.host.select(); }
        if (running) { stopPing(); startPing(); }
      });
      refs.host.addEventListener('change', () => { if (running) { stopPing(); startPing(); } });
      refs.speedStart.addEventListener('click', runSpeedTest);
      refs.extip.addEventListener('click', detectExternalIp);
      refs.dnsBtn.addEventListener('click', runDns);
      refs.dnsHost.addEventListener('keydown', e => { if (e.key === 'Enter') runDns(); });
      refs.traceBtn.addEventListener('click', runTrace);
      $('#net-trace-btn', root).addEventListener('click', () => {
        refs.traceHost.value = refs.host.value;
        refs.traceHost.focus();
      });
      $('#trace-clear', root).addEventListener('click', clearTrace);

      loadInterfaces();
      updateStats();
      bus.emit('log', { level: 'info', message: 'network lab initialized' });
    },

    destroy() {
      stopPing();
      if (pingChart) pingChart.destroy();
      if (downGauge) downGauge.destroy();
      if (upGauge) upGauge.destroy();
      pingChart = downGauge = upGauge = null;
      refs = null;
    },

    state() {
      return { ping: running, speed: speedRunning };
    },
  };
})(window.SEMENU);
