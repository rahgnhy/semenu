/* ============================================================================
   opencode-reset.js - OpenCode Reset Tokens tab.
   Launches the bundled OpenCode Infinite app (.bat) with start/stop controls.
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, toast, icon } = P.dom;

  const BAT_LABEL = 'Bundled OpenCode Infinite launcher';

  const S = {
    mounted: false,
    root: null,
    term: null,
    pathLabels: {},
    statusPills: {},
    startBtns: {},
    stopBtns: {},
    running: { app: false, terminal: false },
    pids: { app: null, terminal: null },
    unsubs: [],
    buf: '',
    maxBuf: 200000,
  };

  function setModeRunning(mode, running, pid) {
    S.running[mode] = !!running;
    S.pids[mode] = pid || null;
    const pill = S.statusPills[mode];
    if (pill) {
      pill.textContent = S.running[mode] ? `RUNNING${S.pids[mode] ? ' · PID ' + S.pids[mode] : ''}` : 'STOPPED';
      pill.classList.toggle('on', S.running[mode]);
    }
    if (S.startBtns[mode]) S.startBtns[mode].disabled = S.running[mode];
    if (S.stopBtns[mode]) S.stopBtns[mode].disabled = !S.running[mode];
  }

  function applyStatus(st) {
    if (!st) return;
    const modes = st.modes || {};
    const m = modes.terminal || {};
    setModeRunning('terminal', !!m.running, m.pid);
    if (st.path) setPathLabel(st.path);
  }

  function appendText(text) {
    if (!S.term || text == null) return;
    S.buf += String(text);
    if (S.buf.length > S.maxBuf) S.buf = S.buf.slice(-S.maxBuf);
    const atBottom = (S.term.scrollTop + S.term.clientHeight) >= (S.term.scrollHeight - 24);
    S.term.textContent = S.buf;
    if (atBottom) S.term.scrollTop = S.term.scrollHeight;
  }

  function setPathLabel(p) {
    const text = p || BAT_LABEL;
    if (S.pathLabels.terminal) S.pathLabels.terminal.textContent = text;
  }

  async function refreshStatus() {
    if (!window.seMenu || !window.seMenu.opencodeReset) return;
    try {
      const st = await window.seMenu.opencodeReset.status();
      applyStatus(st);
    } catch (e) { /* noop */ }
  }

  async function start(mode) {
    if (mode !== 'terminal') return;
    if (S.running[mode]) return;
    try {
      appendText(`\r\n[se-menu] checking for running OpenCode terminal/session...\r\n`);
      if (window.seMenu && window.seMenu.opencodeReset && window.seMenu.opencodeReset.check) {
        const chk = await window.seMenu.opencodeReset.check();
        if (chk && chk.ok) {
          if (chk.processes && chk.processes.length) {
            appendText(`[se-menu] found OpenCode process(es): ${chk.processes.map(p => `${p.name}${p.pid ? ' (PID ' + p.pid + ')' : ''}`).join(', ')}\r\n`);
          } else {
            appendText(`[se-menu] no running OpenCode process detected. Open your OpenCode terminal with chats if you want them preserved/resumed.\r\n`);
          }
          if (chk.windows && chk.windows.length) {
            appendText(`[se-menu] OpenCode terminal/window: ${chk.windows.join(' | ')}\r\n`);
          }
        }
      }
      const res = await window.seMenu.opencodeReset.start({ mode: 'terminal' });
      if (!res || res.ok === false) {
        toast({ type: 'error', title: 'Could not start launcher', message: (res && res.error) || 'unknown error', timeout: 5000 });
        appendText(`\r\n[se-menu] start failed: ${(res && res.error) || 'unknown error'}\r\n`);
        return;
      }
      applyStatus(res);
    } catch (e) {
      toast({ type: 'error', title: 'Could not start launcher', message: e.message, timeout: 5000 });
      appendText(`\r\n[se-menu] start error: ${e.message}\r\n`);
    }
  }

  async function stop(mode) {
    if (mode !== 'terminal') return;
    try {
      await window.seMenu.opencodeReset.stop({ mode: 'terminal' });
    } catch (e) { /* noop */ }
  }

  async function sendLine() {
    if (!S.running || !S.input) return;
    const val = S.input.value;
    if (val == null) return;
    try {
      const res = await window.seMenu.opencodeReset.write(val + '\r\n');
      if (res && res.ok === false) {
        appendText(`\r\n[se-menu] ${res.error || 'input not available in this mode'}\r\n`);
      } else {
        S.input.value = '';
      }
    } catch (e) { /* noop */ }
  }

  async function copyText() {
    const text = S.buf || (S.term ? S.term.textContent : '') || '';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast({ type: 'success', title: 'Copied', message: 'Log text copied to clipboard.', timeout: 2000 });
    } catch (e) {
      toast({ type: 'error', title: 'Copy failed', message: e.message, timeout: 3000 });
    }
  }

  function clearTerm() {
    S.buf = '';
    if (S.term) S.term.textContent = '';
  }

  function launcherCard(mode, title, desc) {
    return h('section', { class: 'card', style: 'margin-bottom:12px;' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-icon', html: icon('play', 16) }),
        h('div', { class: 'card-head-text' },
          h('div', { class: 'card-title', text: title }),
          h('div', { class: 'card-sub', id: `ocrt-path-${mode}`, text: BAT_LABEL }),
        ),
        h('div', { class: 'card-actions', style: 'margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center;' },
          h('span', { class: 'pill', id: `ocrt-status-${mode}`, text: 'STOPPED' }),
          h('button', { class: 'btn btn-sm btn-primary', id: `ocrt-start-${mode}` },
            h('span', { html: icon('play', 13) }),
            h('span', { text: 'Start' }),
          ),
          h('button', { class: 'btn btn-sm btn-ghost', id: `ocrt-stop-${mode}`, disabled: true },
            h('span', { html: icon('x', 13) }),
            h('span', { text: 'Stop' }),
          ),
        ),
      ),
      h('div', { class: 'card-body' },
        h('div', { class: 'page-sub', style: 'margin:0;', text: desc }),
      ),
    );
  }

  function buildUI(root) {
    root.innerHTML = '';

    const page = h('div', { class: 'page-head' },
      h('div', {},
        h('div', { class: 'page-title', text: 'OpenCode Reset Tokens' }),
        h('div', { class: 'page-sub', text: 'Launch the bundled OpenCode Infinite launcher (original .bat) in terminal mode. Session output logs below.' }),
      ),
    );

    const launcher = launcherCard(
      'terminal',
      'OpenCode menu',
      'Runs the OpenCode Infinite launcher in a terminal window. Keeps running when SE-MENU closes. Make sure your OpenCode terminal with chats is open before starting so chats can be preserved/resumed.'
    );

    const logCard = h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-icon', html: icon('terminal', 16) }),
        h('div', { class: 'card-head-text' },
          h('div', { class: 'card-title', text: 'Session log' }),
          h('div', { class: 'card-sub', text: 'Launcher session logs' }),
        ),
        h('div', { class: 'card-actions', style: 'margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;' },
          h('button', { class: 'btn btn-sm btn-ghost', id: 'ocrt-copy', title: 'Copy log text' },
            h('span', { html: icon('copy', 13) }),
            h('span', { text: 'Copy text' }),
          ),
          h('button', { class: 'btn btn-sm btn-ghost', id: 'ocrt-clear', title: 'Clear log' },
            h('span', { html: icon('trash', 13) }),
            h('span', { text: 'Clear' }),
          ),
        ),
      ),
      h('div', { class: 'card-body', style: 'padding:0;' },
        h('div', {
          id: 'ocrt-term',
          style: [
            'height:360px',
            'overflow:auto',
            'background:#0a0b0f',
            'color:#d7dce5',
            'font-family:var(--font-mono)',
            'font-size:12px',
            'line-height:1.45',
            'padding:14px 16px',
            'white-space:pre-wrap',
            'word-break:break-word',
            'border-top:1px solid rgba(255,255,255,0.06)',
          ].join(';'),
        }),
      ),
    );

    root.appendChild(page);
    root.appendChild(launcher);
    root.appendChild(logCard);

    S.root = root;
    S.term = $('#ocrt-term', root);
    S.pathLabels = {
      terminal: $(`#ocrt-path-terminal`, root),
    };
    S.statusPills = {
      terminal: $(`#ocrt-status-terminal`, root),
    };
    S.startBtns = {
      terminal: $(`#ocrt-start-terminal`, root),
    };
    S.stopBtns = {
      terminal: $(`#ocrt-stop-terminal`, root),
    };

    S.startBtns.terminal.addEventListener('click', () => start('terminal'));
    S.stopBtns.terminal.addEventListener('click', () => stop('terminal'));
    $('#ocrt-clear', root).addEventListener('click', clearTerm);
    $('#ocrt-copy', root).addEventListener('click', copyText);
  }

  function subscribe() {
    if (!window.seMenu || !window.seMenu.opencodeReset) return;
    const api = window.seMenu.opencodeReset;
    S.unsubs.push(api.onData((data) => appendText(data)));
    S.unsubs.push(api.onExit((info) => {
      if (info && info.mode) setModeRunning(info.mode, false, null);
      if (info && info.error) appendText(`\r\n[se-menu${info.mode ? ':' + info.mode : ''}] ${info.error}\r\n`);
    }));
    S.unsubs.push(api.onStatus((st) => applyStatus(st)));
  }

  function mount(container) {
    S.mounted = true;
    S.buf = '';
    S.running = { terminal: false };
    S.pids = { terminal: null };
    buildUI(container);
    subscribe();
    refreshStatus();
  }

  function unmount() {
    for (const off of S.unsubs) { try { off(); } catch (e) { /* noop */ } }
    S.unsubs = [];
    S.mounted = false;
    S.root = null;
    S.term = null;
    S.pathLabels = {};
    S.statusPills = {};
    S.startBtns = {};
    S.stopBtns = {};
  }

  M.opencodeReset = { mount, unmount, start, stop };
})(window.SEMENU);
