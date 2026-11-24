/* ============================================================================
   dom.js — DOM builder, icons, formatting, toasts, tooltips, modals, bus
   ========================================================================== */
window.SEMENU = window.SEMENU || {};

(function (P) {
  'use strict';

  /* ------------------------------------------------------------- icons */

  const ICONS = {
    se-menu: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>',
    memory: '<path d="M6 19v3M10 19v3M14 19v3M18 19v3M6 2v3M10 2v3M14 2v3M18 2v3M2 6h20M2 10h20M2 14h20M2 18h20"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
    hourglass: '<path d="M6 2h12M6 22h12M8 2v4l4 4 4-4V2M8 22v-4l4-4 4 4v4"/>',
    gauge: '<path d="m12 15 3.5-5.5"/><path d="M20.2 15a8.5 8.5 0 1 0-16.4 0"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none"/>',
    route: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h6.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H15"/>',
    play: '<path d="M6 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    flag: '<path d="M4 22V4c4-2 8 2 12 0v10c-4 2-8-2-12 0"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    'download-cloud': '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    upload: '<path d="M12 21V9M7 14l5-5 5 5"/><path d="M4 7v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
    minus: '<path d="M5 12h14"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M16 21h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 1-2-2v-3"/>',
    minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5"/>',
    'x-circle': '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    export: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4M12 2v13"/>',
    terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    braces: '<path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1"/>',
    flame: '<path d="M12 2c1 4-3 5-3 9a5 5 0 0 0 10 0c0-2-1-3.5-2-5-.5 1.5-1.5 2-2.5 2 .5-2-1-5-2.5-6z"/>',
    network: '<rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M12 12H5v4M12 12h7v4"/>',
    'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    disk: '<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01M10 16h.01"/>',
    gpu: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M7 19v3M17 19v3M7 14.5h.01M11 14.5h.01"/>',
    battery: '<rect x="2" y="7" width="16" height="10" rx="2"/><path d="M22 11v2M6 11v2M10 11v2"/>',
    'battery-charging': '<path d="M15 7h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2M6 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1"/><path d="m11 7-3 5h4l-3 5"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="8.5" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="6.5" cy="12.5" r="1" fill="currentColor" stroke="none"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 22 10.8C21.6 5.9 17.3 2 12 2z"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
    wand: '<path d="m15 4 5 5L7 22l-5-5z"/><path d="m14 7 3 3M5 6v4M3 8h4M19 14v4M17 16h4"/>',
    loader: '<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>',
    mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    layers: '<path d="m12 2 9 4.9-9 4.9-9-4.9z"/><path d="m3 11.9 9 4.9 9-4.9"/><path d="m3 16.9 9 4.9 9-4.9"/>',
    box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    app: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    power: '<path d="M18.4 6.6a9 9 0 1 1-12.8 0M12 2v9"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    'trending-up': '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>',
    flask: '<path d="M9 2h6M10 2v6.3L4.7 18a2 2 0 0 0 1.8 3h11a2 2 0 0 0 1.8-3L14 8.3V2"/><path d="M7 15h10"/>',
    bug: '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="M19 7l-3 2M5 7l3 2M12 6V2M8 22l2-3M16 22l-2-3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    globe2: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/>',
    dot: '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
  };

  function icon(name, size) {
    const body = ICONS[name] || ICONS.info;
    const s = size || 24;
    return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  function hydrateIcons(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-icon]').forEach(el => {
      if (el.dataset.iconDone) return;
      el.innerHTML = icon(el.dataset.icon, parseInt(el.dataset.iconSize || '24', 10));
      el.dataset.iconDone = '1';
    });
  }

  /* ------------------------------------------------------------- builder */

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'attrs') for (const [a, av] of Object.entries(v)) el.setAttribute(a, av);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    append(el, children);
    return el;
  }

  function append(parent, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false || c === true) continue;
      parent.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return [...(root || document).querySelectorAll(sel)]; }

  function markDirty(el) {
    if (el && el.dataset) delete el.dataset.iconDone;
  }

  /* ------------------------------------------------------------- format */

  const pad2 = n => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function fmtInt(n) {
    if (n == null || !isFinite(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  }

  function fmtBytes(bytes, decimals) {
    if (bytes == null || !isFinite(bytes)) return '—';
    if (bytes === 0) return '0 B';
    const d = decimals == null ? 1 : decimals;
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : d)} ${units[i]}`;
  }

  function fmtMbps(v) {
    if (v == null || !isFinite(v)) return '—';
    return v >= 100 ? v.toFixed(0) : v.toFixed(2);
  }

  function fmtMs(v) {
    if (v == null || !isFinite(v)) return '—';
    return v < 10 ? v.toFixed(1) : String(Math.round(v));
  }

  function fmtUptime(totalSec) {
    if (totalSec == null || !isFinite(totalSec)) return '—';
    const s = Math.max(0, Math.floor(totalSec));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return d > 0 ? `${d}d ${pad2(h)}:${pad2(m)}:${pad2(sec)}` : `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
  }

  function fmtDuration(ms) {
    if (ms == null || !isFinite(ms)) return '00:00.000';
    const t = Math.max(0, Math.floor(ms));
    const m = Math.floor(t / 60000);
    const s = Math.floor((t % 60000) / 1000);
    const milli = t % 1000;
    return `${pad2(m)}:${pad2(s)}.${String(milli).padStart(3, '0')}`;
  }

  function fmtCountdown(ms) {
    if (ms == null || !isFinite(ms)) return '00:00';
    const t = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${pad2(m)}:${pad2(s)}`;
  }

  function fmtDate(d) {
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  function fmtTime(d, use24, withMs) {
    let h = d.getHours();
    const m = pad2(d.getMinutes());
    const s = pad2(d.getSeconds());
    let suffix = '';
    if (!use24) {
      suffix = h >= 12 ? ' PM' : ' AM';
      h = h % 12 || 12;
    }
    const base = `${pad2(h)}:${m}:${s}`;
    return base + (withMs ? `<span class="clock-ms">.${String(d.getMilliseconds()).padStart(3, '0')}</span>` : '') + (suffix ? `<span class="clock-ms">${suffix}</span>` : '');
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function throttle(fn, ms) {
    let last = 0;
    let timer = null;
    return function (...args) {
      const now = Date.now();
      const run = () => { last = Date.now(); fn.apply(this, args); };
      if (now - last >= ms) run();
      else { clearTimeout(timer); timer = setTimeout(run, ms - (now - last)); }
    };
  }

  function uid() { return Math.random().toString(36).slice(2, 10); }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ------------------------------------------------------------- bus */

  const listeners = new Map();
  const bus = {
    on(name, cb) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(cb);
      return () => bus.off(name, cb);
    },
    off(name, cb) {
      const set = listeners.get(name);
      if (set) set.delete(cb);
    },
    emit(name, data) {
      const set = listeners.get(name);
      if (set) for (const cb of [...set]) { try { cb(data); } catch (e) { console.error('[bus]', name, e); } }
    },
  };

  /* ------------------------------------------------------------- toast */

  let toastRoot = null;
  function ensureToastRoot() {
    if (toastRoot) return toastRoot;
    toastRoot = $('#toasts');
    return toastRoot;
  }

  const TOAST_ICONS = { info: 'info', success: 'check-circle', warn: 'alert', error: 'x-circle' };

  function toast(opts) {
    const o = typeof opts === 'string' ? { title: opts } : (opts || {});
    const cfg = (P.config && P.config.data && P.config.data.notifications) || {};
    if (cfg.enabled === false) return null;
    const root = ensureToastRoot();
    const type = o.type || 'info';
    const timeout = o.timeout != null ? o.timeout : (cfg.duration || 4200);
    const el = h('div', { class: `toast ${type}` },
      h('div', { class: 'toast-icon', html: icon(TOAST_ICONS[type] || 'info', 16) }),
      h('div', { class: 'toast-body' },
        h('div', { class: 'toast-title', text: o.title || 'SE-MENU' }),
        o.message ? h('div', { class: 'toast-msg', text: o.message }) : null,
        o.action ? h('div', { class: 'toast-action' },
          h('button', {
            class: 'btn btn-sm ' + (o.action.variant || 'btn-primary'),
            text: o.action.label,
            onClick: () => { if (o.action.onClick) o.action.onClick(); dismiss(); },
          })) : null,
      ),
      h('button', { class: 'toast-close', html: icon('x', 13), 'data-tip': 'Dismiss', onClick: () => dismiss() }),
      timeout > 0 ? h('div', { class: 'toast-progress', style: { animationDuration: `${timeout}ms` } }) : null,
    );
    root.appendChild(el);
    let dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 300);
    }
    if (timeout > 0) setTimeout(dismiss, timeout);
    bus.emit('toast', { type, title: o.title });
    return { el, dismiss };
  }

  function notify(title, message, type) {
    toast({ title, message, type: type || 'info' });
    try {
      if (P.config && P.config.data && P.config.data.notifications && P.config.data.notifications.native) {
        if (window.se-menu && window.se-menu.notify) window.se-menu.notify(title, message);
      }
    } catch (e) { /* noop */ }
  }

  /* ------------------------------------------------------------- tooltip */

  let tipEl = null;
  let tipTimer = null;

  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = $('#tooltip');
    return tipEl;
  }

  function showTip(el) {
    const text = el.dataset.tip;
    if (!text) return;
    const tip = ensureTip();
    const title = el.dataset.tipTitle;
    tip.innerHTML = '';
    if (title) tip.appendChild(h('div', { class: 'tip-title', text: title }));
    tip.appendChild(h('div', { text: text }));
    tip.classList.add('show');
    const pos = el.dataset.tipPos || 'top';
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    let y = r.top - th - 9;
    if (pos === 'bottom') y = r.bottom + 9;
    if (pos === 'left') { x = r.left - tw - 9; y = r.top + r.height / 2 - th / 2; }
    if (pos === 'right') { x = r.right + 9; y = r.top + r.height / 2 - th / 2; }
    x = clamp(x, 8, window.innerWidth - tw - 8);
    if (y < 8) y = r.bottom + 9;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  function hideTip() {
    if (tipEl) tipEl.classList.remove('show');
  }

  function initTooltips() {
    document.addEventListener('mouseover', e => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      if (!el) return;
      clearTimeout(tipTimer);
      tipTimer = setTimeout(() => showTip(el), 130);
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest && e.target.closest('[data-tip]')) {
        clearTimeout(tipTimer);
        hideTip();
      }
    });
    document.addEventListener('mousedown', () => { clearTimeout(tipTimer); hideTip(); });
  }

  /* ------------------------------------------------------------- modal */

  let modalStack = [];

  function openModal(opts) {
    const o = typeof opts === 'string' ? { body: opts } : (opts || {});
    const overlay = h('div', { class: 'modal-overlay' });
    const footer = o.footer == null
      ? h('div', { class: 'modal-foot' },
          h('button', {
            class: 'btn ' + (o.cancelLabel ? '' : 'btn-primary'),
            text: o.cancelLabel || 'Close',
            onClick: () => close(),
          }))
      : h('div', { class: 'modal-foot' }, o.footer);
    const modal = h('div', { class: 'modal', style: o.width ? { width: o.width } : null },
      h('div', { class: 'modal-head' },
        o.icon ? h('div', { class: 'card-icon', style: { width: 34, height: 34 }, html: icon(o.icon, 17) }) : null,
        h('div', { class: 'grow' },
          h('div', { class: 'modal-title', text: o.title || '' }),
          o.sub ? h('div', { class: 'modal-sub', text: o.sub }) : null,
        ),
        h('button', { class: 'modal-close', html: icon('x', 16), 'data-tip': 'Close', onClick: () => close() }),
      ),
      h('div', { class: 'modal-body' }, o.body),
      footer,
    );
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    hydrateIcons(modal);

    function close() {
      if (overlay.dataset.closed) return;
      overlay.dataset.closed = '1';
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 220);
      modalStack = modalStack.filter(m => m !== overlay);
      if (o.onClose) { try { o.onClose(); } catch (e) { console.error(e); } }
    }
    overlay.addEventListener('mousedown', e => { if (e.target === overlay && o.dismissable !== false) close(); });
    modalStack.push(overlay);
    return { close, el: modal, overlay };
  }

  function closeAllModals() {
    [...modalStack].forEach(o => o.dispatchEvent(new Event('esc-close')));
    modalStack.slice().forEach(overlay => {
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 220);
    });
    modalStack = [];
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalStack.length) {
      const top = modalStack[modalStack.length - 1];
      top.classList.add('closing');
      setTimeout(() => top.remove(), 220);
      modalStack.pop();
    }
  });

  function confirmDialog(opts) {
    return new Promise(resolve => {
      const o = opts || {};
      const footer = h('div', { class: 'modal-foot' },
        h('button', { class: 'btn btn-ghost', text: o.cancelLabel || 'Cancel', onClick: () => { m.close(); resolve(false); } }),
        h('button', {
          class: 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary'),
          text: o.confirmLabel || 'Confirm',
          onClick: () => { m.close(); resolve(true); },
        }));
      const m = openModal({
        title: o.title || 'Are you sure?',
        sub: o.sub,
        icon: o.icon || (o.danger ? 'alert' : 'info'),
        body: h('div', { style: 'color:var(--text-2);font-size:.88rem;line-height:1.6' }, o.message || ''),
        footer,
        width: o.width || '440px',
      });
    });
  }

  /* ------------------------------------------------------------- ripple */

  function attachRipple(el) {
    el.classList.add('ripple-host');
    el.addEventListener('pointerdown', e => {
      const r = el.getBoundingClientRect();
      const d = Math.max(r.width, r.height);
      const span = h('span', { class: 'ripple', style: { width: `${d}px`, height: `${d}px`, left: `${e.clientX - r.left - d / 2}px`, top: `${e.clientY - r.top - d / 2}px` } });
      el.appendChild(span);
      setTimeout(() => span.remove(), 620);
    });
  }

  /* ------------------------------------------------------------- export */

  P.icon = icon;
  P.hydrateIcons = hydrateIcons;
  P.dom = {
    h, append, clear, $, $$, markDirty,
    icon, hydrateIcons,
    pad2, clamp, lerp, fmtInt, fmtBytes, fmtMbps, fmtMs, fmtUptime, fmtDuration, fmtCountdown, fmtDate, fmtTime,
    debounce, throttle, uid, escapeHtml,
    toast, notify, openModal, closeAllModals, confirmDialog, attachRipple,
    initTooltips, bus,
    ICONS,
  };
  P.bus = bus;
})(window.SEMENU);
