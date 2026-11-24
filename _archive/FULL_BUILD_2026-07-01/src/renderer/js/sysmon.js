/* ============================================================================
   sysmon.js — System Monitor: CPU, memory, disk, GPU, uptime, hardware.
   Consumes the main process telemetry stream (bus 'sys:tick').
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, $$, clear, bus, fmtBytes, fmtUptime, icon } = P.dom;

  let refs = null;
  let cpuChart = null;
  let ramChart = null;
  let unsubTick = null;
  let unsubPower = null;
  let coreBars = [];
  let diskRows = new Map();
  let hardwareRendered = false;
  let lastGpuSignature = '';
  let lastDiskSignature = '';
  let disksReady = false;

  function rendererHeap() {
    const m = performance.memory;
    if (!m) return null;
    return { used: m.usedJSHeapSize, total: m.totalJSHeapSize, limit: m.jsHeapSizeLimit };
  }

  function buildCoreBars(count) {
    if (!refs) return;
    clear(refs.cpuLegend);
    coreBars = [];
    const n = Math.min(32, count || 1);
    for (let i = 0; i < n; i++) {
      const bar = h('div', {
        style: {
          width: '7px', height: '34px', borderRadius: '4px',
          background: 'rgba(255,255,255,0.09)', position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'flex-end',
        },
        'data-tip': `Core ${i}`,
      }, h('div', {
        class: 'core-fill',
        style: {
          width: '100%', height: '0%', borderRadius: '4px',
          background: 'linear-gradient(180deg, var(--acc-1), var(--acc-2))',
          transition: 'height .4s ease',
        },
      }));
      refs.cpuLegend.appendChild(bar);
      coreBars.push(bar.querySelector('.core-fill'));
    }
  }

  function renderDisks(disks) {
    if (!refs) return;
    const sig = disks.map(d => d.id).join('|');
    if (!disksReady || sig !== lastDiskSignature) {
      disksReady = true;
      lastDiskSignature = sig;
      clear(refs.diskList);
      diskRows = new Map();
      for (const d of disks) {
        const row = h('div', { class: 'col', style: 'gap:5px' },
          h('div', { class: 'row between center' },
            h('div', { class: 'row center', style: 'gap:7px' },
              h('span', { html: icon('disk', 13), style: { color: 'var(--acc-1)' } }),
              h('span', { class: 'mono', style: 'font-size:.74rem', text: `${d.id} ${d.vol || ''}`.trim() }),
            ),
            h('span', { class: 'mono disk-pct', style: 'font-size:.72rem;color:var(--text-3)', text: '—' }),
          ),
          h('div', { class: 'progress sm' }, h('div', { class: 'fill disk-fill', style: { width: '0%' } })),
        );
        refs.diskList.appendChild(row);
        diskRows.set(d.id, {
          pct: row.querySelector('.disk-pct'),
          fill: row.querySelector('.disk-fill'),
        });
      }
      if (!disks.length) refs.diskList.appendChild(h('div', { class: 'empty-state', text: 'No drives detected' }));
    }
    for (const d of disks) {
      const row = diskRows.get(d.id);
      if (!row) continue;
      row.pct.textContent = `${d.percent.toFixed(0)}% · ${fmtBytes(d.free)} free`;
      row.fill.style.width = `${Math.min(100, d.percent)}%`;
      row.fill.style.background = d.percent > 90 ? 'linear-gradient(90deg,#f87171,#fbbf24)' : '';
    }
  }

  function renderGpu(gpus) {
    if (!refs) return;
    const sig = JSON.stringify(gpus.map(g => [g.name, g.driver, g.vram]));
    if (sig === lastGpuSignature) return;
    lastGpuSignature = sig;
    clear(refs.gpuList);
    if (!gpus.length) {
      refs.gpuList.appendChild(h('div', { class: 'empty-state', text: 'No GPU information available' }));
      return;
    }
    const sorted = gpus.slice().sort((a, b) => {
      const rank = g => (g.status === 'OK' ? 0 : 1);
      return rank(a) - rank(b);
    });
    for (const g of sorted) {
      refs.gpuList.appendChild(h('div', { class: 'list-row' },
        h('div', { class: 'lr-icon', html: icon('gpu', 13) }),
        h('div', { class: 'lr-text' },
          h('div', { class: 'lr-title', text: g.name || 'Unknown GPU' }),
          h('div', { class: 'lr-sub', text: `driver ${g.driver || '—'} · vram ${g.vram ? fmtBytes(g.vram) : '—'}` }),
        ),
        h('div', { class: 'lr-value', text: g.status || '' }),
      ));
    }
  }

  function renderHardware(hw) {
    if (!refs) return;
    clear(refs.hwChips);
    const chips = [
      ['cpu', hw.cpuName || 'Unknown CPU', `${hw.cpuCores}C / ${hw.cpuLogical}T${hw.cpuMaxClock ? ` · ${hw.cpuMaxClock} MHz` : ''}`],
      ['box', `${hw.manufacturer || 'Unknown'} ${hw.model || ''}`.trim(), hw.systemType || ''],
      ['memory', 'System memory', fmtBytes(hw.totalmem || 0)],
      ['monitor', hw.osCaption || 'Windows', `build ${hw.osBuild || '—'}`],
      ['map-pin', 'Hostname', hw.hostname || '—'],
    ];
    for (const [ic, title, sub] of chips) {
      refs.hwChips.appendChild(h('div', { class: 'list-row', style: 'border:1px solid var(--stroke);background:var(--panel-2);padding:8px 11px' },
        h('div', { class: 'lr-icon', html: icon(ic, 13) }),
        h('div', { class: 'lr-text' },
          h('div', { class: 'lr-title', text: title }),
          h('div', { class: 'lr-sub', text: sub }),
        ),
      ));
    }
  }

  function onTick(data) {
    if (!refs) return;
    const cpu = data.cpu || { load: 0, perCore: [] };
    const mem = data.mem || { percent: 0, used: 0, total: 0, free: 0 };

    refs.cpuValue.textContent = `${cpu.load.toFixed(1)}%`;
    refs.cpuValue.style.color = cpu.load > 85 ? 'var(--err)' : cpu.load > 60 ? 'var(--warn)' : 'var(--text-1)';
    cpuChart.push(cpu.load);
    if (coreBars.length !== Math.min(32, cpu.perCore.length)) buildCoreBars(cpu.perCore.length);
    cpu.perCore.forEach((v, i) => {
      if (coreBars[i]) coreBars[i].style.height = `${Math.min(100, v)}%`;
    });

    refs.ramValue.textContent = `${mem.percent.toFixed(1)}%`;
    refs.ramValue.style.color = mem.percent > 90 ? 'var(--err)' : mem.percent > 75 ? 'var(--warn)' : 'var(--text-1)';
    ramChart.push(mem.percent);
    refs.ramLegend.innerHTML = `<span class="key"><span class="swatch" style="background:var(--acc-3)"></span>${fmtBytes(mem.used)} used</span><span class="key"><span class="swatch" style="background:rgba(255,255,255,.25)"></span>${fmtBytes(mem.free)} free</span><span class="key">${fmtBytes(mem.total)} total</span>`;

    // app memory: renderer heap + main process
    const heap = rendererHeap();
    const mainMem = data.app || {};
    const heapUsed = heap ? heap.used : mainMem.heapUsed || 0;
    const heapTotal = heap ? heap.total : mainMem.heapTotal || 0;
    const rss = mainMem.rss || 0;
    const limit = heap ? heap.limit : 0;
    refs.appMemValue.textContent = fmtBytes(heapUsed);
    refs.appMemBar.style.width = `${limit ? Math.min(100, (heapUsed / limit) * 100) : 0}%`;
    refs.appMemBar.style.background = heapUsed / (limit || 1) > 0.8 ? 'linear-gradient(90deg,#f87171,#fbbf24)' : '';
    refs.appMemKv.innerHTML = '';
    const rows = [
      ['JS heap used', fmtBytes(heapUsed)],
      ['JS heap total', fmtBytes(heapTotal)],
      ['Heap limit', fmtBytes(limit)],
      ['Main process RSS', fmtBytes(rss)],
      ['External', fmtBytes(mainMem.external || 0)],
    ];
    for (const [k, v] of rows) {
      refs.appMemKv.appendChild(h('dt', { text: k }));
      refs.appMemKv.appendChild(h('dd', { text: v }));
    }

    renderDisks(data.disk || []);
    renderGpu(data.gpu || []);

    // Hardware identity comes from the slower WMI snapshot — paint it as soon
    // as it is available rather than on the first (possibly empty) telemetry.
    if (!hardwareRendered && data.hardware && data.hardware.manufacturer) {
      hardwareRendered = true;
      renderHardware(data.hardware);
      if (refs.osBadge) refs.osBadge.textContent = `${data.hardware.osCaption || 'Windows'} ${data.hardware.osBuild || ''}`.trim();
      bus.emit('log', {
        level: 'info',
        message: `hardware identity — ${data.hardware.manufacturer} ${data.hardware.model} · ${data.hardware.cpuName || 'CPU'}`,
      });
    }

    const bat = data.battery;
    refs.uptimeKv.innerHTML = '';
    const upRows = [
      ['System uptime', fmtUptime(data.uptime)],
      ['Power', bat ? (bat.status === 2 ? 'On AC power' : `On battery (${bat.charge == null ? '—' : `${bat.charge}%`})`) : 'On AC power'],
      ['Load average', Array.isArray(data.load) ? data.load.map(v => v.toFixed(2)).join(' · ') : '—'],
    ];
    for (const [k, v] of upRows) {
      refs.uptimeKv.appendChild(h('dt', { text: k }));
      refs.uptimeKv.appendChild(h('dd', { text: v }));
    }
  }

  M.sysmon = {
    init(root) {
      refs = {
        cpuValue: $('#cpu-value', root),
        cpuChart: $('#cpu-chart', root),
        cpuLegend: $('#cpu-legend', root),
        ramValue: $('#ram-value', root),
        ramChart: $('#ram-chart', root),
        ramLegend: $('#ram-legend', root),
        appMemValue: $('#app-mem-value', root),
        appMemBar: $('#app-mem-bar', root),
        appMemKv: $('#app-mem-kv', root),
        diskList: $('#disk-list', root),
        gpuList: $('#gpu-list', root),
        uptimeKv: $('#uptime-kv', root),
        hwChips: $('#hw-chips', root),
        osBadge: $('#sys-os-badge', root),
      };

      cpuChart = new P.charts.LineChart(refs.cpuChart, { color: '#22d3ee', yMin: 0, yMax: 100, points: 90, glow: 8, fillAlpha: 0.2 });
      ramChart = new P.charts.LineChart(refs.ramChart, { color: '#e879f9', yMin: 0, yMax: 100, points: 90, glow: 8, fillAlpha: 0.2 });

      unsubTick = bus.on('sys:tick', onTick);
      unsubPower = bus.on('power:event', ev => {
        bus.emit('log', { level: 'info', message: `power event: ${ev.type}` });
      });

      window.se-menu.sys.info().then(data => {
        onTick(data);
        const hw = data.hardware || {};
        renderHardware(hw);
        if (refs.osBadge) refs.osBadge.textContent = `${hw.osCaption || 'Windows'} ${hw.osBuild || ''}`.trim();
        bus.emit('log', {
          level: 'info',
          message: `system telemetry online — ${hw.cpuName || 'CPU'} · ${hw.cpuCores}C/${hw.cpuLogical}T · ${fmtBytes(hw.totalmem || 0)} RAM`,
        });
      }).catch(e => bus.emit('log', { level: 'error', message: `sys info failed: ${e.message}` }));

      buildCoreBars(8);
    },

    destroy() {
      if (unsubTick) unsubTick();
      if (unsubPower) unsubPower();
      if (cpuChart) cpuChart.destroy();
      if (ramChart) ramChart.destroy();
      cpuChart = ramChart = null;
      refs = null;
    },
  };
})(window.SEMENU);
