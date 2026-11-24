/* ============================================================================
   utilities.js — Utility Bench: hashing, encoding, formatters, color tools,
   capture, sensors and experiments.
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, $$, clear, toast, bus, icon, fmtBytes, fmtInt, fmtMbps, clamp, uid } = P.dom;

  /* ------------------------------------------------------------- helpers */

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ type: 'success', title: 'Copied', message: label || text.slice(0, 60) });
      return true;
    } catch (e) {
      toast({ type: 'warn', title: 'Clipboard unavailable', message: e.message });
      return false;
    }
  }

  function resultLine(tile, text, kind) {
    const el = tile.querySelector('.ut-result');
    el.innerHTML = '';
    el.appendChild(h('span', { class: kind || '', text: text }));
    return el;
  }

  function makeTile(ic, title, sub, withResult) {
    const body = h('div', { class: 'ut-body' });
    const tile = h('div', { class: 'util-tile' },
      h('div', { class: 'ut-head' },
        h('div', { class: 'ut-icon', html: icon(ic, 15) }),
        h('div', {},
          h('div', { class: 'ut-title', text: title }),
          h('div', { class: 'ut-sub', text: sub }),
        ),
      ),
      body,
      withResult ? h('div', { class: 'ut-result', text: '—' }) : null,
    );
    return { tile, body, result: withResult ? tile.querySelector('.ut-result') : null };
  }

  function miniInput(placeholder, mono) {
    return h('input', { class: 'input' + (mono ? ' mono' : ''), placeholder: placeholder || '' });
  }

  function miniButton(label, onClick, variant) {
    return h('button', { class: 'btn btn-sm ' + (variant || ''), onClick }, label);
  }

  async function digest(algo, text) {
    const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function hexToRgb(hex) {
    const m = hex.replace('#', '');
    const n = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  }

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }

  function hexToHsl(hex) {
    const { r, g, b } = hexToRgb(hex);
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let hh = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rn) hh = (gn - bn) / d + (gn < bn ? 6 : 0);
      else if (max === gn) hh = (bn - rn) / d + 2;
      else hh = (rn - gn) / d + 4;
      hh *= 60;
    }
    return { h: hh, s, l };
  }

  function relLuminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }

  function contrastRatio(a, b) {
    const la = relLuminance(a);
    const lb = relLuminance(b);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  /* -------------------------------------------------------------- tools */

  function jsonTool() {
    const { tile, body, result } = makeTile('braces', 'JSON formatter', 'Validate, prettify and minify JSON', true);
    const input = h('textarea', { class: 'textarea', placeholder: '{"hello":"world","n":42}', style: 'min-height:88px;font-family:var(--font-mono);font-size:.76rem' });
    body.appendChild(input);
    const status = h('div', { class: 'mono', style: 'font-size:.68rem;color:var(--text-3);min-height:1.2em' });
    body.appendChild(status);
    const run = (mode) => {
      const raw = input.value.trim();
      if (!raw) { status.textContent = 'Paste some JSON first.'; status.style.color = 'var(--warn)'; return; }
      try {
        const parsed = JSON.parse(raw);
        if (mode === 'minify') result.textContent = JSON.stringify(parsed);
        else if (mode === 'validate') result.textContent = `valid JSON · ${Array.isArray(parsed) ? `array[${parsed.length}]` : typeof parsed}`;
        else result.textContent = JSON.stringify(parsed, null, 2);
        status.textContent = 'valid ✓';
        status.style.color = 'var(--ok)';
        bus.emit('test:record', { name: 'JSON ' + mode, ok: true, detail: `${raw.length} chars`, durationMs: 0 });
      } catch (e) {
        status.textContent = `invalid: ${e.message}`;
        status.style.color = 'var(--err)';
        result.textContent = '—';
        bus.emit('test:record', { name: 'JSON ' + mode, ok: false, detail: e.message });
      }
    };
    const row = h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
      miniButton('Format', () => run('format'), 'btn-primary'),
      miniButton('Minify', () => run('minify')),
      miniButton('Validate', () => run('validate')),
      miniButton('Copy', () => copyText(result.textContent, 'JSON copied')),
    );
    body.appendChild(row);
    return tile;
  }

  function base64Tool() {
    const { tile, body, result } = makeTile('code', 'Base64', 'Encode and decode Base64', true);
    const input = h('textarea', { class: 'textarea', placeholder: 'Text or Base64…', style: 'min-height:70px;font-family:var(--font-mono);font-size:.76rem' });
    body.appendChild(input);
    body.appendChild(h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
      miniButton('Encode', () => { result.textContent = btoa(unescape(encodeURIComponent(input.value))); }, 'btn-primary'),
      miniButton('Decode', () => {
        try { result.textContent = decodeURIComponent(escape(atob(input.value.trim()))); }
        catch (e) { result.textContent = 'invalid Base64'; }
      }),
      miniButton('Copy', () => copyText(result.textContent, 'Base64 copied')),
    ));
    return tile;
  }

  function uuidTool() {
    const { tile, body, result } = makeTile('hash', 'UUID & tokens', 'Cryptographic random identifiers', true);
    result.textContent = '—';
    body.appendChild(h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
      miniButton('UUID v4', () => { result.textContent = crypto.randomUUID(); }, 'btn-primary'),
      miniButton('Hex token', () => {
        const bytes = new Uint8Array(24);
        crypto.getRandomValues(bytes);
        result.textContent = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
      }),
      miniButton('Copy', () => copyText(result.textContent, 'Identifier copied')),
    ));
    body.appendChild(h('div', { class: 'muted', style: 'font-size:.66rem' }, 'Generated in-browser with crypto.getRandomValues / randomUUID.'));
    return tile;
  }

  function hashTool() {
    const { tile, body, result } = makeTile('shield', 'Hash generator', 'SHA-256 · SHA-1 of any text', true);
    const input = h('textarea', { class: 'textarea', placeholder: 'Text to hash…', style: 'min-height:64px' });
    body.appendChild(input);
    const run = async () => {
      const text = input.value;
      if (!text) return;
      const started = performance.now();
      const [sha256, sha1] = await Promise.all([digest('SHA-256', text), digest('SHA-1', text)]);
      const ms = performance.now() - started;
      result.innerHTML = '';
      result.appendChild(h('div', {}, h('span', { class: 'muted' }, 'SHA-256  '), h('span', { text: sha256 })));
      result.appendChild(h('div', {}, h('span', { class: 'muted' }, 'SHA-1    '), h('span', { text: sha1 })));
      result.appendChild(h('div', { class: 'row', style: 'gap:6px;margin-top:6px' },
        miniButton('Copy SHA-256', () => copyText(sha256, 'SHA-256 copied')),
        h('span', { class: 'mono muted', style: 'font-size:.64rem;align-self:center' }, `${ms.toFixed(1)} ms`),
      ));
      bus.emit('test:record', { name: 'Hash generator', ok: true, detail: `${text.length} chars · ${ms.toFixed(1)} ms`, durationMs: ms });
    };
    body.appendChild(h('div', { class: 'row', style: 'gap:6px' }, miniButton('Hash text', run, 'btn-primary')));
    return tile;
  }

  function textStatsTool() {
    const { tile, body, result } = makeTile('type', 'Text statistics', 'Characters, words, reading time', true);
    const input = h('textarea', { class: 'textarea', placeholder: 'Paste text to analyze…', style: 'min-height:84px' });
    body.appendChild(input);
    const update = () => {
      const text = input.value;
      const chars = text.length;
      const noSpace = text.replace(/\s/g, '').length;
      const words = (text.match(/\S+/g) || []).length;
      const lines = text ? text.split(/\r?\n/).length : 0;
      const sentences = (text.match(/[.!?]+(\s|$)/g) || []).length;
      const paragraphs = (text.match(/\n\s*\n/g) || []).length + (text ? 1 : 0);
      const reading = (words / 200);
      result.innerHTML = '';
      const rows = [
        ['Characters', fmtInt(chars)], ['No spaces', fmtInt(noSpace)],
        ['Words', fmtInt(words)], ['Sentences', fmtInt(sentences)],
        ['Paragraphs', fmtInt(paragraphs)], ['Lines', fmtInt(lines)],
        ['Reading time', reading < 1 ? `${Math.max(1, Math.round(reading * 60))} sec` : `${reading.toFixed(1)} min`],
      ];
      for (const [k, v] of rows) result.appendChild(h('div', { class: 'row between center', style: 'padding:1px 0' },
        h('span', { class: 'muted' }, k), h('span', { text: v })));
    };
    input.addEventListener('input', update);
    body.appendChild(h('div', { class: 'row', style: 'gap:6px' }, miniButton('Clear', () => { input.value = ''; update(); })));
    return tile;
  }

  function paletteTool() {
    const { tile, body, result } = makeTile('palette', 'Color palette', 'Harmonies from a base color', true);
    const color = h('input', { type: 'color', value: '#818cf8' });
    const wrap = h('div', { class: 'color-field' }, color, h('span', { class: 'mono', style: 'font-size:.74rem;color:var(--text-3)', id: 'pal-hex', text: '#818cf8' }));
    body.appendChild(wrap);
    const grid = h('div', { class: 'row wrap', style: 'gap:6px' });
    body.appendChild(grid);
    const render = () => {
      const hex = color.value;
      $('#pal-hex', body).textContent = hex;
      const { h: hh, s, l } = hexToHsl(hex);
      const sets = [
        ['Base', hex], ['Comp', hslToHex(hh + 180, s, l)], ['Analog−', hslToHex(hh - 30, s, l)], ['Analog+', hslToHex(hh + 30, s, l)],
        ['Tri−', hslToHex(hh + 120, s, l)], ['Tri+', hslToHex(hh + 240, s, l)],
        ['Light', hslToHex(hh, s, Math.min(0.92, l + 0.25))], ['Dark', hslToHex(hh, s, Math.max(0.12, l - 0.25))],
      ];
      clear(grid);
      for (const [label, value] of sets) {
        grid.appendChild(h('button', {
          class: 'swatch',
          style: { background: value, width: 34, height: 34 },
          'data-tip': `${label} ${value} — click to copy`,
          onClick: () => copyText(value, `${label} ${value} copied`),
        }));
      }
      result.textContent = `H ${hh.toFixed(0)}° · S ${(s * 100).toFixed(0)}% · L ${(l * 100).toFixed(0)}%`;
    };
    color.addEventListener('input', render);
    render();
    return tile;
  }

  function contrastTool() {
    const { tile, body, result } = makeTile('contrast', 'Contrast checker', 'WCAG ratio and compliance', true);
    const fg = h('input', { type: 'color', value: '#ffffff' });
    const bg = h('input', { type: 'color', value: '#4f46e5' });
    body.appendChild(h('div', { class: 'row', style: 'gap:10px' },
      h('div', { class: 'color-field grow' }, fg, h('span', { class: 'mono muted', style: 'font-size:.7rem' }, 'Text')),
      h('div', { class: 'color-field grow' }, bg, h('span', { class: 'mono muted', style: 'font-size:.7rem' }, 'Background')),
    ));
    const preview = h('div', {
      style: 'border-radius:10px;padding:10px 12px;font-weight:600;border:1px solid var(--stroke)',
    }, 'The quick brown fox jumps over the lazy dog');
    body.appendChild(preview);
    const update = () => {
      const ratio = contrastRatio(fg.value, bg.value);
      preview.style.background = bg.value;
      preview.style.color = fg.value;
      result.innerHTML = '';
      result.appendChild(h('div', { class: 'row between center', style: 'flex-wrap:wrap;gap:6px' },
        h('span', { text: `${ratio.toFixed(2)} : 1`, style: 'white-space:nowrap' }),
        h('div', { class: 'row', style: 'gap:5px' },
          h('span', { class: 'badge ' + (ratio >= 3 ? 'ok' : 'err'), text: `AA large ${ratio >= 3 ? '✓' : '✕'}` }),
          h('span', { class: 'badge ' + (ratio >= 4.5 ? 'ok' : 'err'), text: `AA ${ratio >= 4.5 ? '✓' : '✕'}` }),
          h('span', { class: 'badge ' + (ratio >= 7 ? 'ok' : 'err'), text: `AAA ${ratio >= 7 ? '✓' : '✕'}` }),
        ),
      ));
    };
    fg.addEventListener('input', update);
    bg.addEventListener('input', update);
    update();
    return tile;
  }

  function fileHashTool() {
    const { tile, body, result } = makeTile('file-text', 'File hasher', 'SHA-256 of any file on disk', true);
    const pick = async () => {
      const res = await window.se-menu.dialog.openFile({
        properties: ['openFile'],
        filters: [{ name: 'All files', extensions: ['*'] }],
      });
      if (!res || !res.ok) return;
      result.textContent = 'hashing…';
      const off = window.se-menu.file.onHashProgress(({ size }) => {
        result.textContent = `hashing… ${fmtBytes(size)}`;
      });
      const started = performance.now();
      const out = await window.se-menu.file.hash(res.path, 'sha256');
      off();
      const ms = performance.now() - started;
      if (out && out.ok) {
        result.innerHTML = '';
        result.appendChild(h('div', { text: out.hash }));
        result.appendChild(h('div', { class: 'muted', style: 'font-size:.66rem;margin-top:3px' }, `${fmtBytes(out.size)} · ${ms.toFixed(0)} ms`));
        result.appendChild(h('div', { style: 'margin-top:6px' }, miniButton('Copy hash', () => copyText(out.hash, 'File hash copied'))));
        bus.emit('test:record', { name: 'File hash', ok: true, detail: `${fmtBytes(out.size)} · ${ms.toFixed(0)} ms`, durationMs: ms });
      } else {
        result.textContent = `failed: ${out && out.error}`;
      }
    };
    body.appendChild(h('div', { class: 'row', style: 'gap:6px' }, miniButton('Choose file…', pick, 'btn-primary')));
    return tile;
  }

  function httpTool() {
    const { tile, body, result } = makeTile('send', 'HTTP tester', 'Send a request, measure the response', true);
    const method = h('select', { class: 'select', style: 'width:96px' },
      h('option', { text: 'GET' }), h('option', { text: 'POST' }), h('option', { text: 'PUT' }), h('option', { text: 'HEAD' }), h('option', { text: 'DELETE' }));
    const url = miniInput('https://example.com');
    url.style.flex = '1';
    const bodyInput = h('textarea', { class: 'textarea', placeholder: 'Request body (optional)', style: 'min-height:52px;font-family:var(--font-mono);font-size:.72rem' });
    body.appendChild(h('div', { class: 'row', style: 'gap:7px' }, method, url));
    body.appendChild(bodyInput);
    const history = h('div', { class: 'col', style: 'gap:4px' });
    body.appendChild(history);
    const send = async () => {
      const target = url.value.trim();
      if (!target) { result.textContent = 'Enter a URL first'; return; }
      const started = performance.now();
      const res = await window.se-menu.net.http({
        method: method.value,
        url: target,
        body: bodyInput.value || null,
        timeoutMs: 12000,
      });
      const ms = performance.now() - started;
      if (res && res.status) {
        result.innerHTML = '';
        result.appendChild(h('div', { class: 'row between center' },
          h('span', { class: 'badge ' + (res.ok ? 'ok' : res.status < 500 ? 'warn' : 'err'), text: `HTTP ${res.status}` }),
          h('span', { class: 'mono muted', style: 'font-size:.66rem' }, `${ms.toFixed(0)} ms · ${fmtBytes(res.size)} · ${res.redirects || 0} redirects`),
        ));
        bus.emit('test:record', { name: `HTTP ${method.value} ${new URL(target).host}`, ok: res.ok, detail: `${res.status} · ${ms.toFixed(0)} ms`, durationMs: ms });
        history.prepend(h('div', { class: 'row between center mono', style: 'font-size:.66rem;color:var(--text-3)' },
          h('span', {}, h('span', { class: res.ok ? 'ok' : 'err', text: `${res.status}` }), ` ${method.value} ${target.slice(0, 42)}`),
          h('span', { text: `${ms.toFixed(0)} ms` }),
        ));
        while (history.children.length > 4) history.lastChild.remove();
      } else {
        result.textContent = `failed: ${res && res.error}`;
        bus.emit('test:record', { name: `HTTP ${method.value}`, ok: false, detail: res && res.error });
      }
    };
    body.appendChild(h('div', { class: 'row', style: 'gap:6px' }, miniButton('Send request', send, 'btn-primary')));
    return tile;
  }

  function urlParserTool() {
    const { tile, body, result } = makeTile('link', 'URL parser', 'Break a URL into its parts', true);
    const input = miniInput('https://user:pass@example.com:8443/path?q=1#frag', true);
    body.appendChild(input);
    const parse = () => {
      try {
        const u = new URL(input.value.trim());
        result.innerHTML = '';
        const rows = [
          ['Protocol', u.protocol], ['Username', u.username || '—'], ['Password', u.password || '—'],
          ['Host', u.host], ['Hostname', u.hostname], ['Port', u.port || 'default'],
          ['Path', u.pathname], ['Query', u.search || '—'], ['Hash', u.hash || '—'],
        ];
        for (const [k, v] of rows) {
          result.appendChild(h('div', { class: 'row between center', style: 'padding:1px 0;gap:10px' },
            h('span', { class: 'muted', style: 'flex:none;width:64px' }, k),
            h('span', { text: v, style: 'text-align:right;word-break:break-all' }),
          ));
        }
        const params = [...u.searchParams.entries()];
        if (params.length) {
          result.appendChild(h('div', { class: 'muted', style: 'font-size:.66rem;margin-top:5px' }, `Parameters: ${params.map(([k, v]) => `${k}=${v}`).join(' · ')}`));
        }
      } catch (e) {
        result.textContent = 'invalid URL — include the protocol, e.g. https://example.com';
      }
    };
    input.addEventListener('input', P.dom.debounce(parse, 250));
    body.appendChild(h('div', { class: 'row', style: 'gap:6px' }, miniButton('Parse', parse, 'btn-primary')));
    return tile;
  }

  function screenshotTool() {
    const { tile, body, result } = makeTile('camera', 'Screenshot', 'Capture the primary display', true);
    const thumb = h('div', {
      style: 'border-radius:10px;border:1px solid var(--stroke);background:rgba(4,6,12,.5);height:96px;display:grid;place-items:center;overflow:hidden;color:var(--text-3);font-size:.7rem',
      text: 'No capture yet',
    });
    body.appendChild(thumb);
    let lastDataUrl = '';
    const capture = async () => {
      try {
        const sources = await window.se-menu.desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 } });
        if (!sources.length) { result.textContent = 'No screen sources available'; return; }
        lastDataUrl = sources[0].thumbnail;
        clear(thumb);
        thumb.appendChild(h('img', { src: lastDataUrl, style: 'width:100%;height:100%;object-fit:cover' }));
        result.textContent = `${sources[0].name} · ${sources.length} source${sources.length > 1 ? 's' : ''}`;
      } catch (e) {
        result.textContent = `capture failed: ${e.message}`;
      }
    };
    body.appendChild(h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
      miniButton('Capture', capture, 'btn-primary'),
      miniButton('Save PNG', async () => {
        if (!lastDataUrl) { toast({ type: 'warn', title: 'Nothing to save', message: 'Capture a screenshot first.' }); return; }
        const res = await window.se-menu.dialog.save({
          defaultName: `se-menu-screenshot-${Date.now()}.png`,
          data: lastDataUrl.split(',')[1] || '',
          base64: true,
          filters: [{ name: 'PNG image', extensions: ['png'] }],
        });
        if (res && res.ok) toast({ type: 'success', title: 'Screenshot saved', message: res.path });
      }),
    ));
    return tile;
  }

  function deadPixelTool() {
    const { tile, body, result } = makeTile('monitor', 'Dead pixel tester', 'Cycle pure colors on screen', true);
    const colors = ['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#000000'];
    let overlay = null;
    let idx = 0;
    const close = () => { if (overlay) { overlay.remove(); overlay = null; result.textContent = 'closed'; } };
    const advance = () => {
      idx = (idx + 1) % colors.length;
      if (overlay) overlay.style.background = colors[idx];
    };
    const open = () => {
      if (overlay) return;
      overlay = h('div', {
        style: 'position:fixed;inset:0;z-index:800;background:#fff;display:grid;place-items:center;cursor:pointer;transition:background .25s ease',
        'data-tip': 'Click to cycle · ESC to exit',
      },
        h('div', { style: 'position:absolute;bottom:26px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.55);color:#fff;padding:8px 14px;border-radius:99px;font-family:var(--font-mono);font-size:.72rem;backdrop-filter:blur(8px)' },
          'Click to cycle colors · ESC to exit'),
      );
      overlay.addEventListener('click', advance);
      overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
      document.body.appendChild(overlay);
      result.textContent = 'running — click to cycle';
      const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
      document.addEventListener('keydown', onKey);
    };
    body.appendChild(h('div', { class: 'row', style: 'gap:6px' }, miniButton('Start', open, 'btn-primary'), miniButton('Stop', close)));
    result.textContent = 'ready';
    return tile;
  }

  function screenInfoTool() {
    const { tile, body, result } = makeTile('monitor', 'Display info', 'Resolution, scaling and refresh', true);
    const load = async () => {
      try {
        const d = await window.se-menu.screen.displays();
        result.innerHTML = '';
        for (const disp of d.all) {
          result.appendChild(h('div', { class: 'row between center', style: 'padding:1px 0;gap:8px' },
            h('span', { text: `${disp.label || 'display'} ${disp.internal ? '(internal)' : ''}` }),
            h('span', { class: 'muted', style: 'text-align:right' }, `${disp.bounds.width}×${disp.bounds.height} · ${disp.scaleFactor}× · ${disp.refreshRate || '—'}Hz · ${disp.colorDepth}bit`),
          ));
        }
        result.appendChild(h('div', { class: 'muted', style: 'font-size:.66rem;margin-top:4px' }, `Viewport ${window.innerWidth}×${window.innerHeight} · DPR ${window.devicePixelRatio} · cursor ${d.cursor.x},${d.cursor.y}`));
      } catch (e) {
        result.textContent = `unavailable: ${e.message}`;
      }
    };
    body.appendChild(h('div', { class: 'row', style: 'gap:6px' }, miniButton('Refresh', load, 'btn-primary')));
    load();
    return tile;
  }

  function batteryTool() {
    const { tile, body, result } = makeTile('battery', 'Power & battery', 'AC state, charge level, events', true);
    let lastEvent = '—';
    const unsubTick = bus.on('sys:tick', data => {
      const bat = data.battery;
      result.innerHTML = '';
      const rows = [
        ['Power source', bat ? (bat.status === 2 ? 'AC power' : 'Battery') : 'AC power'],
        ['Charge', bat && bat.charge != null ? `${bat.charge}%` : 'not reported'],
        ['Status code', bat ? String(bat.status) : '—'],
        ['Last event', lastEvent],
      ];
      for (const [k, v] of rows) result.appendChild(h('div', { class: 'row between center', style: 'padding:1px 0' },
        h('span', { class: 'muted' }, k), h('span', { text: v })));
    });
    const unsubPower = bus.on('power:event', ev => { lastEvent = ev.type; });
    tile._cleanup = () => { unsubTick(); unsubPower(); };
    body.appendChild(h('div', { class: 'muted', style: 'font-size:.66rem' }, 'Updates live from the operating system power monitor.'));
    return tile;
  }

  function storageTool() {
    const { tile, body, result } = makeTile('disk', 'Storage estimate', 'Quota and usage for this app', true);
    const load = async () => {
      try {
        if (!navigator.storage || !navigator.storage.estimate) {
          result.textContent = 'Storage estimate unavailable in this session';
          return;
        }
        const est = await navigator.storage.estimate();
        const pct = est.quota ? (est.usage / est.quota) * 100 : 0;
        result.innerHTML = '';
        result.appendChild(h('div', { class: 'row between center' }, h('span', { class: 'muted' }, 'Used'), h('span', { text: fmtBytes(est.usage) })));
        result.appendChild(h('div', { class: 'row between center' }, h('span', { class: 'muted' }, 'Quota'), h('span', { text: fmtBytes(est.quota) })));
        result.appendChild(h('div', { style: 'margin-top:6px' }, h('div', { class: 'progress sm' }, h('div', { class: 'fill', style: { width: `${clamp(pct, 0, 100)}%` } }))));
        if (est.usageDetails) {
          result.appendChild(h('div', { class: 'muted', style: 'font-size:.64rem;margin-top:4px' }, `IndexedDB ${fmtBytes(est.usageDetails.indexedDB || 0)} · Cache ${fmtBytes(est.usageDetails.caches || 0)}`));
        }
      } catch (e) {
        result.textContent = `unavailable: ${e.message}`;
      }
    };
    body.appendChild(h('div', { class: 'row', style: 'gap:6px' }, miniButton('Refresh', load, 'btn-primary')));
    load();
    return tile;
  }

  function reactionTool() {
    const { tile, body, result } = makeTile('zap', 'Reaction time', 'Wait for green, then click', true);
    const pad = h('button', {
      style: 'border-radius:12px;border:1px solid var(--stroke);background:rgba(255,107,107,.14);padding:22px 14px;font-weight:700;letter-spacing:.02em;transition:background .12s ease;min-height:96px',
      text: 'Wait for green…',
    });
    body.appendChild(pad);
    let state = 'idle';
    let timer = null;
    let t0 = 0;
    const best = () => {
      const v = localStorage.getItem('se-menu.reactionBest');
      return v ? Number(v) : null;
    };
    const render = () => {
      const b = best();
      result.innerHTML = '';
      result.appendChild(h('div', { class: 'row between center' },
        h('span', { class: 'muted' }, 'Best'), h('span', { text: b ? `${b.toFixed(0)} ms` : '—' })));
    };
    pad.addEventListener('click', () => {
      if (state === 'waiting') {
        clearTimeout(timer);
        state = 'early';
        pad.style.background = 'rgba(251,191,36,.16)';
        pad.textContent = 'Too soon — click to retry';
        result.textContent = 'Clicked too early';
        return;
      }
      if (state === 'ready') {
        const dt = performance.now() - t0;
        state = 'done';
        pad.style.background = 'rgba(52,211,153,.18)';
        pad.textContent = `${dt.toFixed(0)} ms — click to go again`;
        const b = best();
        if (!b || dt < b) localStorage.setItem('se-menu.reactionBest', String(dt));
        result.textContent = `${dt.toFixed(0)} ms`;
        bus.emit('test:record', { name: 'Reaction time', ok: true, detail: `${dt.toFixed(0)} ms`, durationMs: dt });
        render();
        return;
      }
      state = 'waiting';
      pad.style.background = 'rgba(251,191,36,.14)';
      pad.textContent = 'Wait for green…';
      timer = setTimeout(() => {
        state = 'ready';
        t0 = performance.now();
        pad.style.background = 'rgba(52,211,153,.2)';
        pad.textContent = 'CLICK NOW';
      }, 900 + Math.random() * 2200);
    });
    render();
    return tile;
  }

  function stressTool() {
    const { tile, body, result } = makeTile('flame', 'CPU stress', 'Controlled load generator', true);
    let running = false;
    let startedAt = 0;
    const offProgress = window.se-menu.perf.onStress(p => {
      if (!running) return;
      const sec = (p.elapsed / 1000).toFixed(1);
      result.innerHTML = '';
      result.appendChild(h('div', { class: 'row between center' }, h('span', { class: 'muted' }, 'Elapsed'), h('span', { text: `${sec} s` })));
      result.appendChild(h('div', { class: 'row between center' }, h('span', { class: 'muted' }, 'Work units'), h('span', { text: fmtInt(p.ops) })));
    });
    const offDone = window.se-menu.perf.onStressDone(() => {
      running = false;
      result.textContent = 'stopped';
      toast({ type: 'info', title: 'Stress test stopped', message: 'CPU load released.' });
    });
    const start = seconds => {
      if (running) return;
      running = true;
      startedAt = Date.now();
      window.se-menu.perf.stressStart(seconds);
      result.textContent = 'starting…';
      bus.emit('log', { level: 'warn', message: `CPU stress started (${seconds}s)` });
      bus.emit('test:record', { name: 'CPU stress', ok: true, detail: `${seconds}s run`, durationMs: seconds * 1000 });
    };
    body.appendChild(h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
      miniButton('5 s', () => start(5), 'btn-primary'),
      miniButton('10 s', () => start(10)),
      miniButton('30 s', () => start(30)),
      miniButton('Stop', () => { window.se-menu.perf.stressStop(); running = false; result.textContent = 'stopped'; }, 'btn-danger'),
    ));
    tile._cleanup = () => { offProgress(); offDone(); };
    body.appendChild(h('div', { class: 'muted', style: 'font-size:.64rem' }, 'Runs a worker thread in the main process — the UI stays responsive.'));
    return tile;
  }

  function clipboardTool() {
    const { tile, body, result } = makeTile('clipboard', 'Clipboard', 'Write and read the system clipboard', true);
    const input = h('textarea', { class: 'textarea', placeholder: 'Text to copy…', style: 'min-height:56px' });
    body.appendChild(input);
    body.appendChild(h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
      miniButton('Copy text', async () => {
        const ok = await copyText(input.value, 'Text copied to clipboard');
        result.textContent = ok ? 'written to clipboard' : 'write failed';
      }, 'btn-primary'),
      miniButton('Read clipboard', async () => {
        try {
          const text = await navigator.clipboard.readText();
          result.textContent = text ? `"${text.slice(0, 160)}"` : 'clipboard is empty';
        } catch (e) {
          result.textContent = `read failed: ${e.message}`;
        }
      }),
    ));
    return tile;
  }

  function baseConverterTool() {
    const { tile, body, result } = makeTile('hash', 'Number base', 'Decimal ↔ hex ↔ binary ↔ octal', true);
    const dec = miniInput('42', true);
    const hex = miniInput('2a', true);
    const bin = miniInput('101010', true);
    const oct = miniInput('52', true);
    body.appendChild(h('div', { class: 'col', style: 'gap:6px' },
      h('div', { class: 'row center', style: 'gap:8px' }, h('span', { class: 'muted', style: 'width:52px;font-size:.7rem' }, 'Dec'), dec),
      h('div', { class: 'row center', style: 'gap:8px' }, h('span', { class: 'muted', style: 'width:52px;font-size:.7rem' }, 'Hex'), hex),
      h('div', { class: 'row center', style: 'gap:8px' }, h('span', { class: 'muted', style: 'width:52px;font-size:.7rem' }, 'Binary'), bin),
      h('div', { class: 'row center', style: 'gap:8px' }, h('span', { class: 'muted', style: 'width:52px;font-size:.7rem' }, 'Octal'), oct),
    ));
    const setAll = (source, value) => {
      const n = parseInt(value, source === 'bin' ? 2 : source === 'hex' ? 16 : source === 'oct' ? 8 : 10);
      if (!isFinite(n)) return;
      dec.value = String(n);
      hex.value = n.toString(16);
      bin.value = n.toString(2);
      oct.value = n.toString(8);
      result.textContent = `${n} · 0x${n.toString(16)} · ${n.toString(2)}b · 0${n.toString(8)}`;
    };
    dec.addEventListener('input', () => setAll('dec', dec.value));
    hex.addEventListener('input', () => setAll('hex', hex.value));
    bin.addEventListener('input', () => setAll('bin', bin.value));
    oct.addEventListener('input', () => setAll('oct', oct.value));
    setAll('dec', '42');
    return tile;
  }

  function timestampTool() {
    const { tile, body, result } = makeTile('clock', 'Timestamps', 'Unix epoch ↔ human readable', true);
    const input = miniInput('1735689600', true);
    body.appendChild(h('div', { class: 'row', style: 'gap:7px' }, input, miniButton('Now', () => { input.value = String(Math.floor(Date.now() / 1000)); convert(); }, 'btn-primary')));
    const convert = () => {
      const raw = parseInt(input.value.trim(), 10);
      if (!isFinite(raw)) { result.textContent = 'Enter a unix timestamp'; return; }
      const ms = raw < 1e12 ? raw * 1000 : raw;
      const d = new Date(ms);
      if (isNaN(d.getTime())) { result.textContent = 'out of range'; return; }
      result.innerHTML = '';
      result.appendChild(h('div', { class: 'row between center' }, h('span', { class: 'muted' }, 'Local'), h('span', { text: d.toLocaleString() })));
      result.appendChild(h('div', { class: 'row between center' }, h('span', { class: 'muted' }, 'UTC'), h('span', { text: d.toUTCString() })));
      result.appendChild(h('div', { class: 'row between center' }, h('span', { class: 'muted' }, 'ISO'), h('span', { text: d.toISOString() })));
      result.appendChild(h('div', { class: 'row between center' }, h('span', { class: 'muted' }, 'Relative'), h('span', { text: relative(d) })));
      result.appendChild(h('div', { style: 'margin-top:6px' }, miniButton('Copy ISO', () => copyText(d.toISOString(), 'ISO timestamp copied'))));
    };
    input.addEventListener('input', P.dom.debounce(convert, 200));
    convert();
    return tile;
  }

  function relative(d) {
    const diff = Date.now() - d.getTime();
    const abs = Math.abs(diff);
    const suffix = diff >= 0 ? 'ago' : 'from now';
    const mins = Math.round(abs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ${suffix}`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} h ${suffix}`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} d ${suffix}`;
    const months = Math.round(days / 30);
    if (months < 12) return `${months} mo ${suffix}`;
    return `${Math.round(months / 12)} y ${suffix}`;
  }

  function passwordTool() {
    const { tile, body, result } = makeTile('lock', 'Password generator', 'Cryptographic random passwords', true);
    const len = h('div', { class: 'slider' }, h('input', { type: 'range', min: '6', max: '64', value: '20', id: 'pw-len' }), h('span', { class: 'slider-value', id: 'pw-len-val', text: '20' }));
    body.appendChild(len);
    const boxes = {};
    const opts = h('div', { class: 'row wrap', style: 'gap:12px' },
      box('Uppercase', true), box('Lowercase', true), box('Digits', true), box('Symbols', true));
    body.appendChild(opts);
    const out = h('div', { class: 'mono', style: 'font-family:var(--font-mono);font-size:.76rem;background:rgba(4,6,12,.5);border:1px solid var(--stroke);border-radius:9px;padding:9px 11px;word-break:break-all', text: '—' });
    body.appendChild(out);
    const strength = h('div', { class: 'progress sm', style: 'margin-top:6px' }, h('div', { class: 'fill', style: { width: '0%' } }));
    body.appendChild(strength);
    function box(label, initial) {
      const el = h('label', { class: 'checkbox', style: 'font-size:.74rem' },
        h('input', { type: 'checkbox', ...(initial ? { checked: 'true' } : {}) }),
        h('span', { class: 'box', html: icon('check', 12) }),
        label);
      boxes[label] = el.querySelector('input');
      return el;
    }
    const gen = () => {
      const length = parseInt(len.querySelector('input').value, 10);
      let chars = '';
      if (boxes.Uppercase.checked) chars += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      if (boxes.Lowercase.checked) chars += 'abcdefghijkmnpqrstuvwxyz';
      if (boxes.Digits.checked) chars += '23456789';
      if (boxes.Symbols.checked) chars += '!@#$%^&*()-_=+[]{}';
      if (!chars) { out.textContent = 'select at least one character set'; strength.querySelector('.fill').style.width = '0%'; return; }
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      const pw = [...bytes].map(b => chars[b % chars.length]).join('');
      out.textContent = pw;
      const entropy = length * Math.log2(chars.length);
      const pct = clamp((entropy / 128) * 100, 4, 100);
      const fill = strength.querySelector('.fill');
      fill.style.width = `${pct}%`;
      fill.style.background = entropy < 50 ? 'linear-gradient(90deg,#f87171,#fbbf24)' : 'var(--grad)';
      result.textContent = `${entropy.toFixed(0)} bits of entropy`;
    };
    len.querySelector('input').addEventListener('input', () => {
      len.querySelector('#pg-len-val, #pw-len-val').textContent = len.querySelector('input').value;
      gen();
    });
    Object.values(boxes).forEach(b => b.addEventListener('change', gen));
    body.appendChild(h('div', { class: 'row', style: 'gap:6px;margin-top:6px' },
      miniButton('Generate', gen, 'btn-primary'),
      miniButton('Copy', () => copyText(out.textContent, 'Password copied')),
    ));
    gen();
    return tile;
  }

  /* --------------------------------------------------------------- init */

  const TOOLS = [
    jsonTool, base64Tool, uuidTool, hashTool, textStatsTool, paletteTool, contrastTool,
    fileHashTool, httpTool, urlParserTool, screenshotTool, deadPixelTool, screenInfoTool,
    batteryTool, storageTool, reactionTool, stressTool, clipboardTool, baseConverterTool,
    timestampTool, passwordTool,
  ];

  M.utilities = {
    init(root) {
      const grid = $('#util-grid', root);
      if (!grid) return;
      const tiles = [];
      for (const tool of TOOLS) {
        const tile = tool();
        tiles.push(tile);
        grid.appendChild(tile);
      }
      bus.emit('log', { level: 'info', message: `${TOOLS.length} utility tools mounted` });
      this._tiles = tiles;
    },

    destroy() {
      if (this._tiles) for (const t of this._tiles) { if (t._cleanup) t._cleanup(); }
      this._tiles = [];
    },
  };
})(window.SEMENU);
