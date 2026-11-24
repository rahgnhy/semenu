/* ============================================================================
   il2cpp-dumper.js - Il2CppDumper tab for VR (Unity/IL2CPP) games.
   Upload an .apk, extract libil2cpp.so + global-metadata.dat, run Il2CppDumper,
   then browse/edit/download the generated dump + offsets.
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, $$, toast, icon } = P.dom;

  const S = {
    mounted: false,
    root: null,
    apkPath: null,
    apkName: null,
    state: 'idle', // idle | extracting | dumping | done | error
    result: null,
    selectedFile: null,
    unsubs: [],
  };

  function setState(state, msg) {
    S.state = state;
    const pill = S.root ? $('#icd-status', S.root) : null;
    if (pill) {
      const map = { idle: 'IDLE', extracting: 'EXTRACTING', dumping: 'DUMPING', done: 'DONE', error: 'ERROR' };
      pill.textContent = map[state] || state.toUpperCase();
      pill.classList.toggle('on', state === 'done');
      pill.classList.toggle('err', state === 'error');
    }
    const statusText = S.root ? $('#icd-status-text', S.root) : null;
    if (statusText && msg) statusText.textContent = msg;
    renderProgress();
  }

  function renderProgress() {
    const wrap = S.root ? $('#icd-progress', S.root) : null;
    if (!wrap) return;
    const active = S.state === 'extracting' || S.state === 'dumping';
    wrap.classList.toggle('active', active);
    const bar = $('#icd-progress-bar', S.root);
    if (bar) {
      if (active) bar.style.width = '100%';
      else if (S.state === 'done') bar.style.width = '100%';
      else bar.style.width = '0%';
    }
  }

  function clearAll() {
    S.apkPath = null;
    S.apkName = null;
    S.state = 'idle';
    S.result = null;
    S.selectedFile = null;
    if (S.root) {
      const drop = $('#icd-drop', S.root);
      if (drop) drop.classList.remove('has-file');
      const title = $('#icd-drop-title', S.root);
      if (title) title.textContent = 'Drop .apk file here';
      const sub = $('#icd-drop-sub', S.root);
      if (sub) sub.textContent = 'or click Browse above';
      const name = $('#icd-apk-name', S.root);
      if (name) name.textContent = 'No APK selected';
      const info = $('#icd-info', S.root);
      if (info) info.innerHTML = '';
      const out = $('#icd-output', S.root);
      if (out) out.innerHTML = '';
      const preview = $('#icd-preview', S.root);
      if (preview) preview.innerHTML = '';
      setState('idle', 'Drop an .apk or click Browse to begin.');
    }
  }

  function buildUI(root) {
    root.innerHTML = '';

    const page = h('div', { class: 'page-head' },
      h('div', {},
        h('div', { class: 'page-title', text: 'Il2CppDumper' }),
        h('div', { class: 'page-sub', text: 'Unobfuscate Unity/IL2CPP VR (and Android) games: extract libil2cpp.so + global-metadata.dat from an .apk, dump types/methods/offsets, then browse, edit and download the results.' }),
      ),
      h('div', { class: 'card-actions', style: 'display:flex;gap:8px;align-items:center;' },
        h('span', { class: 'pill', id: 'icd-status', text: 'IDLE' }),
      ),
    );

    // Drop zone card
    const dropCard = h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-icon', html: icon('upload', 16) }),
        h('div', { class: 'card-head-text' },
          h('div', { class: 'card-title', text: 'Source APK' }),
          h('div', { class: 'card-sub', text: 'Drop a .apk here or browse. VR game apks (arm64-v8a) work best.' }),
        ),
        h('div', { class: 'card-actions', style: 'margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;' },
          h('button', { class: 'btn btn-sm btn-primary', id: 'icd-browse' },
            h('span', { html: icon('folder', 13) }),
            h('span', { text: 'Browse' }),
          ),
          h('button', { class: 'btn btn-sm btn-ghost', id: 'icd-clear' },
            h('span', { html: icon('trash', 13) }),
            h('span', { text: 'Clear' }),
          ),
        ),
      ),
      h('div', { class: 'card-body' },
        h('div', { id: 'icd-drop', class: 'icd-drop' },
          h('div', { class: 'icd-drop-icon', html: icon('package', 40) }),
          h('div', { class: 'icd-drop-title', id: 'icd-drop-title', text: 'Drop .apk file here' }),
          h('div', { class: 'icd-drop-sub', id: 'icd-drop-sub', text: 'or click Browse above' }),
          h('div', { class: 'icd-drop-name', id: 'icd-apk-name', text: 'No APK selected' }),
        ),
        h('div', { id: 'icd-progress', class: 'icd-progress' },
          h('div', { id: 'icd-progress-bar', class: 'icd-progress-bar' }),
        ),
        h('div', { id: 'icd-status-text', class: 'icd-status-text', text: 'Drop an .apk or click Browse to begin.' }),
        h('div', { style: 'display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap;' },
          h('label', { style: 'font-family:var(--font-mono);font-size:11px;color:var(--text-2);', text: 'XOR key (hex, optional):' }),
          h('input', { id: 'icd-xorkey', type: 'text', class: 'input mono', placeholder: 'e.g. 5DE8450F (for encrypted metadata)', style: 'flex:1;min-width:180px;font-size:12px;' }),
        ),
        h('div', { style: 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;' },
          h('button', { class: 'btn btn-sm btn-primary', id: 'icd-run' },
            h('span', { html: icon('play', 13) }),
            h('span', { text: 'Unobfuscate & Dump' }),
          ),
          h('button', { class: 'btn btn-sm btn-ghost', id: 'icd-open-folder', disabled: true },
            h('span', { html: icon('folder-open', 13) }),
            h('span', { text: 'Open output folder' }),
          ),
        ),
      ),
    );

    // Detected files card
    const detectCard = h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-icon', html: icon('search', 16) }),
        h('div', { class: 'card-head-text' },
          h('div', { class: 'card-title', text: 'Detected IL2CPP files' }),
          h('div', { class: 'card-sub', text: 'libil2cpp.so and global-metadata.dat located inside the APK' }),
        ),
      ),
      h('div', { class: 'card-body', id: 'icd-info', style: 'min-height:60px;' }),
    );

    // Output files card
    const outputCard = h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-icon', html: icon('file-text', 16) }),
        h('div', { class: 'card-head-text' },
          h('div', { class: 'card-title', text: 'Dump output' }),
          h('div', { class: 'card-sub', text: 'Generated files: dump.cs, script.json, offsets, structs and more' }),
        ),
        h('div', { class: 'card-actions', style: 'margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;' },
          h('button', { class: 'btn btn-sm btn-ghost', id: 'icd-download-all', disabled: true },
            h('span', { html: icon('download', 13) }),
            h('span', { text: 'Download all' }),
          ),
          h('button', { class: 'btn btn-sm btn-ghost', id: 'icd-copy-all', disabled: true },
            h('span', { html: icon('copy', 13) }),
            h('span', { text: 'Copy' }),
          ),
        ),
      ),
      h('div', { class: 'card-body', style: 'padding:0;display:flex;min-height:320px;' },
        h('div', { id: 'icd-filelist', class: 'icd-filelist' }),
        h('div', { id: 'icd-preview', class: 'icd-preview' }),
      ),
    );

    root.appendChild(page);
    root.appendChild(dropCard);
    root.appendChild(detectCard);
    root.appendChild(outputCard);

    S.root = root;

    // wire
    const drop = $('#icd-drop', root);
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /\.apk$/i.test(f.name)) {
        const p = (window.seMenu && window.seMenu.getPathForFile) ? window.seMenu.getPathForFile(f) : (f.path || '');
        if (p) {
          S.apkPath = p;
          S.apkName = f.name;
          drop.classList.add('has-file');
          const title = $('#icd-drop-title', S.root);
          if (title) title.textContent = 'APK ready';
          const sub = $('#icd-drop-sub', S.root);
          if (sub) sub.textContent = 'Click Unobfuscate & Dump to start';
          const name = $('#icd-apk-name', S.root);
          if (name) name.textContent = f.name;
          setState('idle', `Selected: ${f.name}. Click Unobfuscate & Dump.`);
        } else {
          toast({ type: 'info', title: 'Use Browse', message: 'Could not read the dropped file path. Please use Browse.', timeout: 4000 });
        }
      }
    });

    $('#icd-browse', root).addEventListener('click', browseApk);
    $('#icd-clear', root).addEventListener('click', clearAll);
    $('#icd-run', root).addEventListener('click', runDump);
    $('#icd-open-folder', root).addEventListener('click', openFolder);
    $('#icd-download-all', root).addEventListener('click', downloadAll);
    $('#icd-copy-all', root).addEventListener('click', copyAll);
  }

  async function browseApk() {
    if (!window.seMenu || !window.seMenu.il2cpp) return;
    try {
      const res = await window.seMenu.il2cpp.pickApk();
      if (res && res.path) {
        S.apkPath = res.path;
        S.apkName = res.name || res.path.split(/[\\/]/).pop();
        const drop = $('#icd-drop', S.root);
        if (drop) drop.classList.add('has-file');
        const title = $('#icd-drop-title', S.root);
        if (title) title.textContent = 'APK ready';
        const sub = $('#icd-drop-sub', S.root);
        if (sub) sub.textContent = 'Click Unobfuscate & Dump to start';
        const name = $('#icd-apk-name', S.root);
        if (name) name.textContent = S.apkName;
        setState('idle', `Selected: ${S.apkName}. Click Unobfuscate & Dump.`);
      }
    } catch (e) {
      toast({ type: 'error', title: 'Browse failed', message: e.message, timeout: 5000 });
    }
  }

  async function runDump() {
    if (!S.apkPath) {
      toast({ type: 'error', title: 'No APK', message: 'Browse for an .apk first.', timeout: 4000 });
      return;
    }
    const runBtn = $('#icd-run', S.root);
    if (runBtn) runBtn.disabled = true;
    try {
      const keyInput = $('#icd-xorkey', S.root);
      const xorKey = keyInput ? keyInput.value.trim() : '';
      setState('extracting', 'Extracting APK (this can take a moment)...');
      // small delay so UI updates
      await new Promise(r => setTimeout(r, 60));
      const res = await window.seMenu.il2cpp.dump({ apkPath: S.apkPath, xorKey });
      if (!res || res.ok === false) {
        setState('error', (res && res.error) || 'dump failed');
        toast({ type: 'error', title: 'Dump failed', message: (res && res.error) || 'unknown error', timeout: 8000 });
        if (runBtn) runBtn.disabled = false;
        return;
      }
      S.result = res;
      setState('done', `Done. ${res.files.length} files generated.`);
      renderDetected(res.detected);
      renderOutput(res.files);
      const ofb = $('#icd-open-folder', S.root);
      if (ofb) { ofb.disabled = false; ofb.dataset.path = res.outDir; }
      const da = $('#icd-download-all', S.root);
      if (da) da.disabled = false;
      const ca = $('#icd-copy-all', S.root);
      if (ca) ca.disabled = false;
    } catch (e) {
      setState('error', e.message);
      toast({ type: 'error', title: 'Dump failed', message: e.message, timeout: 8000 });
    } finally {
      if (runBtn) runBtn.disabled = false;
    }
  }

  function renderDetected(det) {
    const info = $('#icd-info', S.root);
    if (!info) return;
    info.innerHTML = '';
    if (!det) {
      info.appendChild(h('div', { class: 'page-sub', text: 'No files detected.' }));
      return;
    }
    const rows = [
      ['libil2cpp.so', det.lib || 'not found'],
      ['global-metadata.dat', det.metadata || 'not found'],
      ['architecture', det.arch || 'unknown'],
      ['metadata encrypted', det.encrypted ? 'YES - provide XOR key above' : 'no'],
    ];
    for (const [k, v] of rows) {
      const row = h('div', { style: 'display:flex;gap:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);' },
        h('div', { style: 'width:180px;color:var(--text-2);font-family:var(--font-mono);font-size:12px;', text: k }),
        h('div', { style: 'flex:1;font-family:var(--font-mono);font-size:12px;word-break:break-all;', text: v }),
      );
      info.appendChild(row);
    }
  }

  function renderOutput(files) {
    const list = $('#icd-filelist', S.root);
    if (!list) return;
    list.innerHTML = '';
    if (!files || !files.length) {
      list.appendChild(h('div', { class: 'page-sub', style: 'padding:12px;', text: 'No output files.' }));
      return;
    }
    for (const f of files) {
      const item = h('button', {
        class: 'icd-fileitem',
        onclick: () => selectFile(f),
      },
        h('span', { class: 'icd-fileicon', html: icon(fileIcon(f.name), 13) }),
        h('span', { class: 'icd-filename', text: f.name }),
        h('span', { class: 'icd-filesize', text: fmtSize(f.size) }),
      );
      list.appendChild(item);
    }
    // auto-select first text file
    const first = files.find(f => /\.(cs|json|txt|py|cpp|h)$/i.test(f.name)) || files[0];
    if (first) selectFile(first);
  }

  function fileIcon(name) {
    if (/\.cs$/i.test(name)) return 'code';
    if (/\.json$/i.test(name)) return 'braces';
    if (/\.py$/i.test(name)) return 'code';
    if (/dump/i.test(name)) return 'file-text';
    return 'file';
  }

  function fmtSize(b) {
    if (b == null) return '';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function selectFile(f) {
    S.selectedFile = f;
    // highlight
    const list = $('#icd-filelist', S.root);
    if (list) {
      for (const el of list.querySelectorAll('.icd-fileitem')) el.classList.remove('active');
      // find by name
      for (const el of list.querySelectorAll('.icd-fileitem')) {
        if (el.querySelector('.icd-filename') && el.querySelector('.icd-filename').textContent === f.name) el.classList.add('active');
      }
    }
    const preview = $('#icd-preview', S.root);
    if (!preview) return;
    preview.innerHTML = '';
    // show loading
    preview.appendChild(h('div', { class: 'icd-loading', text: 'Loading ' + f.name + '...' }));
    try {
      const res = await window.seMenu.il2cpp.readFile({ path: f.path });
      preview.innerHTML = '';
      if (!res || res.ok === false) {
        preview.appendChild(h('div', { class: 'page-sub', text: (res && res.error) || 'could not read file' }));
        return;
      }
      const isText = /\.(cs|json|txt|py|cpp|h|js|md|log)$/i.test(f.name) || (res.content && res.content.length < 200000);
      const tooBig = res.size && res.size > 2 * 1024 * 1024;
      if (isText && !tooBig) {
        const ta = h('textarea', { class: 'icd-editor', spellcheck: false });
        ta.value = res.content || '';
        ta.dataset.path = f.path;
        preview.appendChild(ta);
        const bar = h('div', { class: 'icd-preview-bar' },
          h('span', { text: f.name }),
          h('div', { style: 'display:flex;gap:6px;' },
            h('button', { class: 'btn btn-sm btn-ghost', onclick: () => saveFile(f.path, ta) }, h('span', { html: icon('save', 12) }), h('span', { text: 'Save' })),
            h('button', { class: 'btn btn-sm btn-ghost', onclick: () => downloadFile(f) }, h('span', { html: icon('download', 12) }), h('span', { text: 'Download' })),
          ),
        );
        preview.insertBefore(bar, preview.firstChild);
      } else if (tooBig) {
        preview.appendChild(h('div', { class: 'page-sub', text: `${f.name} (${fmtSize(f.size)}) is large - use Download to save it.` }));
        const dl = h('button', { class: 'btn btn-sm btn-primary', style: 'margin-top:10px;', onclick: () => downloadFile(f) },
          h('span', { html: icon('download', 13) }), h('span', { text: 'Download' }));
        preview.appendChild(dl);
      } else {
        preview.appendChild(h('div', { class: 'page-sub', text: `${f.name} (${fmtSize(f.size)}) - binary file. Use Download.` }));
      }
    } catch (e) {
      preview.innerHTML = '';
      preview.appendChild(h('div', { class: 'page-sub', text: e.message }));
    }
  }

  async function saveFile(p, ta) {
    try {
      const res = await window.seMenu.il2cpp.saveFile({ path: p, content: ta.value });
      if (res && res.ok) toast({ type: 'success', title: 'Saved', message: p.split(/[\\/]/).pop(), timeout: 2000 });
      else toast({ type: 'error', title: 'Save failed', message: (res && res.error) || 'unknown', timeout: 4000 });
    } catch (e) {
      toast({ type: 'error', title: 'Save failed', message: e.message, timeout: 4000 });
    }
  }

  async function downloadFile(f) {
    try {
      const res = await window.seMenu.il2cpp.downloadFile({ path: f.path, name: f.name });
      if (res && res.ok) toast({ type: 'success', title: 'Downloaded', message: res.savedTo || f.name, timeout: 3000 });
      else toast({ type: 'error', title: 'Download failed', message: (res && res.error) || 'unknown', timeout: 4000 });
    } catch (e) {
      toast({ type: 'error', title: 'Download failed', message: e.message, timeout: 4000 });
    }
  }

  async function downloadAll() {
    if (!S.result) return;
    try {
      const res = await window.seMenu.il2cpp.downloadAll({ outDir: S.result.outDir });
      if (res && res.ok) toast({ type: 'success', title: 'Downloaded', message: res.savedTo, timeout: 4000 });
      else toast({ type: 'error', title: 'Download failed', message: (res && res.error) || 'unknown', timeout: 4000 });
    } catch (e) {
      toast({ type: 'error', title: 'Download failed', message: e.message, timeout: 4000 });
    }
  }

  async function copyAll() {
    if (!S.result) return;
    try {
      // concatenate all text files
      let out = '';
      for (const f of S.result.files) {
        if (!/\.(cs|json|txt|py|cpp|h|js|md|log)$/i.test(f.name)) continue;
        const r = await window.seMenu.il2cpp.readFile({ path: f.path });
        if (r && r.ok) out += `\n===== ${f.name} =====\n${r.content}\n`;
      }
      await navigator.clipboard.writeText(out);
      toast({ type: 'success', title: 'Copied', message: 'All text output copied.', timeout: 2500 });
    } catch (e) {
      toast({ type: 'error', title: 'Copy failed', message: e.message, timeout: 4000 });
    }
  }

  async function openFolder() {
    const btn = $('#icd-open-folder', S.root);
    const p = btn && btn.dataset.path;
    if (!p) return;
    try { await window.seMenu.il2cpp.openFolder({ path: p }); }
    catch (e) { toast({ type: 'error', title: 'Open failed', message: e.message, timeout: 4000 }); }
  }

  function mount(container) {
    S.mounted = true;
    buildUI(container);
  }

  function unmount() {
    S.mounted = false;
    S.root = null;
  }

  M.il2cppDumper = { mount, unmount };

  // inject styles
  const style = document.createElement('style');
  style.textContent = `
    .icd-drop { border: 2px dashed rgba(255,255,255,0.12); border-radius: 14px; padding: 28px 20px; text-align: center; background: rgba(255,255,255,0.02); transition: all .2s ease; }
    .icd-drop.drag { border-color: var(--acc-1, #a78bfa); background: rgba(167,139,250,0.06); }
    .icd-drop.has-file { border-color: rgba(127,185,154,0.5); background: rgba(127,185,154,0.05); }
    .icd-drop-icon { color: var(--text-2); margin-bottom: 8px; opacity: 0.7; }
    .icd-drop-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
    .icd-drop-sub { font-size: 12px; color: var(--text-2); margin-bottom: 10px; }
    .icd-drop-name { font-family: var(--font-mono); font-size: 12px; color: var(--acc-1, #a78bfa); }
    .icd-progress { height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; margin-top: 14px; }
    .icd-progress-bar { height: 100%; width: 0%; background: linear-gradient(90deg, var(--acc-1,#a78bfa), var(--acc-2,#8b7cf6)); transition: width .4s ease; }
    .icd-progress.active .icd-progress-bar { animation: icd-indet 1.4s ease-in-out infinite; }
    @keyframes icd-indet { 0% { width: 0%; margin-left: 0%; } 50% { width: 60%; margin-left: 20%; } 100% { width: 0%; margin-left: 100%; } }
    .icd-status-text { font-family: var(--font-mono); font-size: 12px; color: var(--text-2); margin-top: 10px; min-height: 16px; }
    .icd-filelist { width: 240px; border-right: 1px solid rgba(255,255,255,0.06); overflow: auto; padding: 6px; flex-shrink: 0; }
    .icd-fileitem { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: none; background: transparent; color: var(--text-1); text-align: left; cursor: pointer; border-radius: 8px; font-size: 12px; font-family: var(--font-mono); transition: background .15s; }
    .icd-fileitem:hover { background: rgba(255,255,255,0.04); }
    .icd-fileitem.active { background: rgba(167,139,250,0.12); color: var(--acc-1,#a78bfa); }
    .icd-filename { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icd-filesize { color: var(--text-2); font-size: 10px; }
    .icd-preview { flex: 1; overflow: auto; padding: 0; position: relative; }
    .icd-preview-bar { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); font-family: var(--font-mono); font-size: 12px; color: var(--text-2); background: rgba(0,0,0,0.2); position: sticky; top: 0; z-index: 2; }
    .icd-editor { width: 100%; height: calc(100% - 40px); min-height: 280px; border: none; background: #0a0b0f; color: #d7dce5; font-family: var(--font-mono); font-size: 12px; line-height: 1.45; padding: 14px 16px; resize: none; outline: none; box-sizing: border-box; }
    .icd-loading { padding: 20px; color: var(--text-2); font-family: var(--font-mono); font-size: 12px; }
    .pill.err { background: rgba(239,68,68,0.15); color: #fca5a5; }
  `;
  document.head.appendChild(style);

})(window.SEMENU);
