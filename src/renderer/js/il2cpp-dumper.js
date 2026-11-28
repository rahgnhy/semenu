/* ============================================================================
   il2cpp-dumper.js - Il2CppDumper tab for VR (Unity/IL2CPP) games.
   Upload an .apk, extract libil2cpp.so + global-metadata.dat, decrypt and repair
   the metadata, run Il2CppDumper, then browse, edit, search and download the
   results. Every number shown here was measured by the main process.
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
    analysis: null,
    selectedFile: null,
    searchSeq: 0,
    menuEl: null,
    menuCleanup: null,
  };

  const STATE_LABEL = { idle: 'IDLE', extracting: 'EXTRACTING', dumping: 'DUMPING', done: 'DONE', error: 'ERROR' };

  /* ---------------------------------------------------------------- status */

  function setState(state, msg) {
    S.state = state;
    const pill = S.root ? $('#icd-status', S.root) : null;
    if (pill) {
      pill.textContent = STATE_LABEL[state] || String(state).toUpperCase();
      pill.dataset.state = state;
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
    wrap.classList.toggle('done', S.state === 'done');
    const bar = $('#icd-progress-bar', S.root);
    if (bar) bar.style.width = active ? '100%' : S.state === 'done' ? '100%' : '0%';
  }

  function clearAll() {
    S.apkPath = null;
    S.apkName = null;
    S.state = 'idle';
    S.result = null;
    S.selectedFile = null;
    S.analysis = null;
    if (!S.root) return;
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
    const out = $('#icd-filelist', S.root);
    if (out) out.innerHTML = '';
    const preview = $('#icd-preview', S.root);
    if (preview) {
      preview.innerHTML = '';
      preview.appendChild(emptyPreview());
    }
    const searchInput = $('#icd-search-input', S.root);
    if (searchInput) { searchInput.value = ''; searchInput.disabled = true; }
    const searchMeta = $('#icd-search-meta', S.root);
    if (searchMeta) searchMeta.textContent = 'No query.';
    const results = $('#icd-search-results', S.root);
    if (results) results.innerHTML = '';
    const detail = $('#icd-type-detail', S.root);
    if (detail) {
      detail.innerHTML = '';
      detail.appendChild(emptyDetail());
    }
    const ofb = $('#icd-open-folder', S.root);
    if (ofb) { ofb.disabled = true; ofb.dataset.path = ''; }
    const da = $('#icd-download-all', S.root);
    if (da) da.disabled = true;
    const ca = $('#icd-copy-all', S.root);
    if (ca) ca.disabled = true;
    const outdir = $('#icd-outdir', S.root);
    if (outdir) outdir.textContent = 'No output folder yet.';
    renderMetrics(null);
    renderFlow(null);
    renderAnalysis(null);
    setState('idle', 'Drop an .apk or click Browse to begin.');
  }

  /* ------------------------------------------------------------------- UI */

  function emptyPreview() {
    return h('div', { class: 'icd-empty' },
      h('div', { class: 'icd-empty-icon', html: icon('file-text', 22) }),
      h('div', { class: 'icd-empty-title', text: 'Nothing selected' }),
      h('div', { class: 'icd-empty-sub', text: 'Run a dump, then pick a file on the left to read or edit it. Right-click a file for download, save-as and copy.' }),
    );
  }

  function emptyDetail() {
    return h('div', { class: 'icd-empty' },
      h('div', { class: 'icd-empty-icon', html: icon('search', 22) }),
      h('div', { class: 'icd-empty-title', text: 'No type open' }),
      h('div', { class: 'icd-empty-sub', text: 'Search the dump above and click a result to read its members and source.' }),
    );
  }

  function buildUI(root) {
    root.innerHTML = '';

    const page = h('div', { class: 'icd-page' });

    /* ---- hero ---- */
    page.appendChild(h('header', { class: 'icd-hero' },
      h('div', { class: 'icd-hero-main' },
        h('div', { class: 'icd-eyebrow' },
          h('span', { class: 'icd-eyebrow-dot' }),
          h('span', { text: 'UNITY · IL2CPP · ARM64' }),
        ),
        h('h1', { class: 'icd-title' },
          h('span', { text: 'Il2Cpp' }),
          h('span', { class: 'accent', text: 'Dumper' }),
        ),
        h('p', { class: 'icd-lede', text: 'Extract, decrypt and repair a Unity IL2CPP build, then read the whole assembly: types, members, offsets, naming and roles. Every claim carries the number behind it.' }),
      ),
      h('div', { class: 'icd-hero-side' },
        h('span', { class: 'icd-status', id: 'icd-status', dataset: { state: 'idle' }, text: 'IDLE' }),
        h('div', { class: 'icd-status-text', id: 'icd-status-text', text: 'Drop an .apk or click Browse to begin.' }),
      ),
    ));

    /* ---- run ---- */
    const runCard = h('section', { class: 'card icd-run' },
      h('div', { class: 'icd-run-grid' },
        h('div', { class: 'icd-source' },
          h('div', { class: 'icd-block-head' },
            h('div', { class: 'card-icon', html: icon('upload', 15) }),
            h('div', { class: 'icd-block-head-text' },
              h('div', { class: 'card-title', text: 'Source APK' }),
              h('div', { class: 'card-sub', text: 'arm64-v8a VR and Android builds' }),
            ),
            h('div', { class: 'icd-block-actions' },
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
          h('div', { class: 'icd-drop', id: 'icd-drop' },
            h('div', { class: 'icd-drop-icon', html: icon('package', 26) }),
            h('div', { class: 'icd-drop-text' },
              h('div', { class: 'icd-drop-title', id: 'icd-drop-title', text: 'Drop .apk file here' }),
              h('div', { class: 'icd-drop-sub', id: 'icd-drop-sub', text: 'or click Browse above' }),
            ),
            h('div', { class: 'icd-drop-name', id: 'icd-apk-name', text: 'No APK selected' }),
          ),
          h('div', { class: 'icd-progress', id: 'icd-progress' },
            h('div', { class: 'icd-progress-bar', id: 'icd-progress-bar' }),
          ),
          h('details', { class: 'icd-advanced' },
            h('summary', { text: 'Legacy XOR key' }),
            h('div', { class: 'icd-advanced-body' },
              h('input', { id: 'icd-xorkey', type: 'text', class: 'input mono', placeholder: 'hex, e.g. 1f2e3d4c', spellcheck: 'false' }),
              h('div', { class: 'icd-hint', text: 'Only for a plain repeating-XOR protector. Container metadata is decrypted automatically from libil2cpp.so; leave this empty for it.' }),
            ),
          ),
          h('div', { class: 'icd-run-actions' },
            h('button', { class: 'btn btn-primary', id: 'icd-run' },
              h('span', { html: icon('play', 13) }),
              h('span', { text: 'Unobfuscate & Dump' }),
            ),
            h('button', { class: 'btn btn-ghost', id: 'icd-open-folder', disabled: true },
              h('span', { html: icon('folder-open', 13) }),
              h('span', { text: 'Open output folder' }),
            ),
          ),
        ),
        h('aside', { class: 'icd-flow' },
          h('div', { class: 'icd-flow-title', text: 'Pipeline' }),
          h('ol', { class: 'icd-flow-list', id: 'icd-flow' }),
          h('div', { class: 'icd-flow-note', text: 'A dump is only finished when the files exist. Il2CppDumper exits 0 even when it throws, so success is proven by output, never by an exit code.' }),
        ),
      ),
    );
    page.appendChild(runCard);

    /* ---- metrics ---- */
    page.appendChild(h('section', { class: 'icd-metrics', id: 'icd-metrics' }));

    /* ---- detected ---- */
    page.appendChild(h('section', { class: 'card icd-detect' },
      h('div', { class: 'icd-block-head' },
        h('div', { class: 'card-icon', html: icon('search', 15) }),
        h('div', { class: 'icd-block-head-text' },
          h('div', { class: 'card-title', text: 'Detected IL2CPP files' }),
          h('div', { class: 'card-sub', text: 'libil2cpp.so and global-metadata.dat located inside the APK' }),
        ),
      ),
      h('div', { class: 'icd-detect-body', id: 'icd-info' },
        h('div', { class: 'icd-hint', text: 'Nothing scanned yet.' }),
      ),
    ));

    /* ---- output ---- */
    page.appendChild(h('section', { class: 'card icd-output' },
      h('div', { class: 'icd-block-head' },
        h('div', { class: 'card-icon', html: icon('file-text', 15) }),
        h('div', { class: 'icd-block-head-text' },
          h('div', { class: 'card-title', text: 'Dump output' }),
          h('div', { class: 'card-sub', text: 'Read, edit and download the generated files' }),
        ),
        h('div', { class: 'icd-block-actions' },
          h('button', { class: 'btn btn-sm btn-ghost', id: 'icd-download-all', disabled: true },
            h('span', { html: icon('download', 13) }),
            h('span', { text: 'Download all' }),
          ),
          h('button', { class: 'btn btn-sm btn-ghost', id: 'icd-copy-all', disabled: true },
            h('span', { html: icon('copy', 13) }),
            h('span', { text: 'Copy text' }),
          ),
        ),
      ),
      h('div', { class: 'icd-split' },
        h('div', { class: 'icd-filelist', id: 'icd-filelist' }),
        h('div', { class: 'icd-preview', id: 'icd-preview' }, emptyPreview()),
      ),
      h('div', { class: 'icd-outdir', id: 'icd-outdir', text: 'No output folder yet.' }),
    ));

    /* ---- analysis ---- */
    page.appendChild(h('section', { class: 'card icd-analysis-card' },
      h('div', { class: 'icd-block-head' },
        h('div', { class: 'card-icon', html: icon('activity', 15) }),
        h('div', { class: 'icd-block-head-text' },
          h('div', { class: 'card-title', text: 'Analysis' }),
          h('div', { class: 'card-sub', text: 'Metadata structure, repairs, dump agreement and naming' }),
        ),
        h('div', { class: 'icd-block-actions' },
          h('span', { class: 'icd-status', id: 'icd-verdict', dataset: { state: 'idle' }, text: 'NOT RUN' }),
          h('button', { class: 'btn btn-sm btn-ghost', id: 'icd-reanalyse', disabled: true },
            h('span', { html: icon('refresh', 13) }),
            h('span', { text: 'Re-run' }),
          ),
        ),
      ),
      h('div', { class: 'icd-analysis', id: 'icd-analysis' },
        h('div', { class: 'icd-hint', text: 'Run a dump to analyse the metadata and the listing.' }),
      ),
    ));

    /* ---- explorer ---- */
    page.appendChild(h('section', { class: 'card icd-explorer' },
      h('div', { class: 'icd-block-head' },
        h('div', { class: 'card-icon', html: icon('search', 15) }),
        h('div', { class: 'icd-block-head-text' },
          h('div', { class: 'card-title', text: 'Explorer' }),
          h('div', { class: 'card-sub', text: 'Types, methods, fields and properties by name' }),
        ),
        h('div', { class: 'icd-block-actions' },
          h('select', { id: 'icd-search-kind', class: 'icd-kind' },
            h('option', { value: '', text: 'all kinds' }),
            h('option', { value: 'type', text: 'types' }),
            h('option', { value: 'method', text: 'methods' }),
            h('option', { value: 'field', text: 'fields' }),
            h('option', { value: 'property', text: 'properties' }),
          ),
        ),
      ),
      h('div', { class: 'icd-searchbar' },
        h('span', { class: 'icd-searchbar-icon', html: icon('search', 15) }),
        h('input', { id: 'icd-search-input', class: 'icd-searchbar-input', type: 'text', placeholder: 'search a type, method, field or property', spellcheck: 'false', disabled: true }),
        h('span', { class: 'icd-searchbar-key', text: '/' }),
      ),
      h('div', { class: 'icd-search-meta', id: 'icd-search-meta', text: 'No query.' }),
      h('div', { class: 'icd-explorer-split' },
        h('div', { class: 'icd-search-results', id: 'icd-search-results' }),
        h('div', { class: 'icd-type-detail', id: 'icd-type-detail' }, emptyDetail()),
      ),
    ));

    root.appendChild(page);
    S.root = root;

    renderFlow(null);
    renderMetrics(null);
    wire();
  }

  function wire() {
    const drop = $('#icd-drop', S.root);
    if (drop) {
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
      drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('drag');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!f) return;
        if (!/\.apk$/i.test(f.name)) {
          toast({ type: 'error', title: 'Not an APK', message: 'Pick a file that ends in .apk.', timeout: 3500 });
          return;
        }
        const p = (window.seMenu && window.seMenu.getPathForFile) ? window.seMenu.getPathForFile(f) : (f.path || '');
        if (!p) {
          toast({ type: 'info', title: 'Use Browse', message: 'Could not read the dropped file path. Please use Browse.', timeout: 4000 });
          return;
        }
        acceptApk(p, f.name);
      });
    }

    $('#icd-browse', S.root).addEventListener('click', browseApk);
    $('#icd-clear', S.root).addEventListener('click', clearAll);
    $('#icd-run', S.root).addEventListener('click', runDump);
    $('#icd-open-folder', S.root).addEventListener('click', openFolder);
    $('#icd-download-all', S.root).addEventListener('click', downloadAll);
    $('#icd-copy-all', S.root).addEventListener('click', copyAll);
    const rerun = $('#icd-reanalyse', S.root);
    if (rerun) rerun.addEventListener('click', runReanalyse);
    wireSearch();

    const input = $('#icd-search-input', S.root);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { input.value = ''; runSearch(); }
      });
    }
  }

  function acceptApk(p, name) {
    S.apkPath = p;
    S.apkName = name || p.split(/[\\/]/).pop();
    const drop = $('#icd-drop', S.root);
    if (drop) drop.classList.add('has-file');
    const title = $('#icd-drop-title', S.root);
    if (title) title.textContent = 'APK ready';
    const sub = $('#icd-drop-sub', S.root);
    if (sub) sub.textContent = 'Click Unobfuscate & Dump to start';
    const label = $('#icd-apk-name', S.root);
    if (label) label.textContent = S.apkName;
    setState('idle', `Selected: ${S.apkName}. Click Unobfuscate & Dump.`);
  }

  /* ---------------------------------------------------------------- pipeline */

  function renderFlow(res) {
    const list = S.root ? $('#icd-flow', S.root) : null;
    if (!list) return;
    list.innerHTML = '';

    const d = res && res.decrypt;
    const m = (res && res.metaReport) || {};
    const a = (res && res.analysis) || null;
    const files = (res && res.files) || [];
    const repairs = (m.repairs || []).length;

    const steps = res ? [
      {
        key: 'extract',
        label: 'Extract',
        state: 'ok',
        value: `${res.arch || 'unknown'} · ${res.libPath ? '2 payloads' : '0 payloads'}`,
      },
      {
        key: 'decrypt',
        label: 'Decrypt',
        state: d ? 'ok' : 'skip',
        value: d
          ? (d.mode === 'container'
            ? `container · seed ${String(d.headerSeed || '').slice(0, 8)}…`
            : 'repeating XOR key')
          : 'stock metadata',
      },
      {
        key: 'repair',
        label: 'Repair',
        state: repairs ? 'warn' : 'ok',
        value: repairs ? `${repairs} change set${repairs === 1 ? '' : 's'}` : 'none needed',
      },
      {
        key: 'dump',
        label: 'Dump',
        state: files.length ? 'ok' : 'warn',
        value: files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : 'no files',
      },
      {
        key: 'analyse',
        label: 'Analyse',
        state: a ? (a.verdict === 'pass' ? 'ok' : a.verdict === 'warn' ? 'warn' : 'err') : 'warn',
        value: a ? String(a.verdict || '').toUpperCase() : (res.analysisError ? 'failed' : 'not run'),
      },
    ] : [
      { key: 'extract', label: 'Extract', state: 'pending', value: 'apk payloads' },
      { key: 'decrypt', label: 'Decrypt', state: 'pending', value: 'container or stock' },
      { key: 'repair', label: 'Repair', state: 'pending', value: 'v31 structure' },
      { key: 'dump', label: 'Dump', state: 'pending', value: 'types and offsets' },
      { key: 'analyse', label: 'Analyse', state: 'pending', value: 'naming and roles' },
    ];

    for (const step of steps) {
      list.appendChild(h('li', { class: 'icd-flow-step', dataset: { state: step.state } },
        h('span', { class: 'icd-flow-dot' }),
        h('span', { class: 'icd-flow-label', text: step.label }),
        h('span', { class: 'icd-flow-value', text: step.value }),
      ));
    }
  }

  function metricTile(label, value, sub, tone) {
    return h('div', { class: 'icd-metric', dataset: tone ? { tone } : {} },
      h('div', { class: 'icd-metric-label', text: label }),
      h('div', { class: 'icd-metric-value', text: value == null ? '—' : String(value) }),
      h('div', { class: 'icd-metric-sub', text: sub || '' }),
    );
  }

  function fmtInt(n) {
    return typeof n === 'number' ? n.toLocaleString('en-US') : (n == null ? '—' : String(n));
  }

  function renderMetrics(res) {
    const box = S.root ? $('#icd-metrics', S.root) : null;
    if (!box) return;
    box.innerHTML = '';
    const a = res && res.analysis;
    const d = a && a.dump;
    const m = (res && res.metaReport) || {};
    const counts = m.counts || {};
    const verdict = a ? String(a.verdict || '').toUpperCase() : null;
    const tone = a ? (a.verdict === 'pass' ? 'ok' : a.verdict === 'warn' ? 'warn' : 'err') : null;

    box.appendChild(metricTile('Types', d ? fmtInt(d.types) : fmtInt(counts.typeDefinitions), d ? 'in dump.cs' : 'from metadata'));
    box.appendChild(metricTile('Methods', d ? fmtInt(d.methods) : fmtInt(counts.methods), d ? 'in dump.cs' : 'from metadata'));
    box.appendChild(metricTile('Fields', d ? fmtInt(d.fields) : fmtInt(counts.fields), d ? 'in dump.cs' : 'from metadata'));
    box.appendChild(metricTile('Images', d ? fmtInt(d.images) : fmtInt(counts.images), 'assemblies'));
    box.appendChild(metricTile('Metadata', m.version ? `v${m.version}` : '-',
      m.version ? (m.repairs && m.repairs.length ? `${m.repairs.length} repair set${m.repairs.length === 1 ? '' : 's'}` : 'structurally valid') : 'not read'));
    box.appendChild(metricTile('Verdict', verdict || '-',
      a ? (a.verdictReasons && a.verdictReasons.length ? a.verdictReasons[0] : 'no findings') : 'not analysed', tone));
  }

  /* ------------------------------------------------------------------ run */

  async function browseApk() {
    if (!window.seMenu || !window.seMenu.il2cpp) return;
    try {
      const res = await window.seMenu.il2cpp.pickApk();
      if (res && res.path) acceptApk(res.path, res.name);
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
      setState('extracting', 'Extracting libil2cpp.so and global-metadata.dat from the APK…');
      await new Promise(r => setTimeout(r, 60));
      setState('dumping', 'Decrypting, repairing, dumping and analysing. This is the long part…');
      const res = await window.seMenu.il2cpp.dump({ apkPath: S.apkPath, xorKey });
      if (!res || res.ok === false) {
        setState('error', (res && res.error) || 'dump failed');
        toast({ type: 'error', title: 'Dump failed', message: (res && res.error) || 'unknown error', timeout: 8000 });
        return;
      }
      open(res);
    } catch (e) {
      setState('error', e.message);
      toast({ type: 'error', title: 'Dump failed', message: e.message, timeout: 8000 });
    } finally {
      if (runBtn) runBtn.disabled = false;
    }
  }

  /**
   * Show a completed dump: flow, metrics, detected files, output list, analysis.
   * Also the entry point for re-opening a dump that already exists on disk.
   * @param {{outDir:string, files?:Array, analysis?:object, analysisError?:string, decrypt?:object, detected?:object}} res
   */
  function open(res) {
    if (!res || res.ok === false || !res.outDir) return;
    S.result = res;
    const d = res.decrypt;
    const extra = d && d.mode === 'container'
      ? ` Decrypted container (seed ${d.headerSeed}, ${(d.counts && d.counts.typeDefinitions) || '?'} types).`
      : (d && d.mode === 'xor' ? ' Decrypted with the supplied XOR key.' : '');
    setState('done', `Done. ${(res.files || []).length} files generated.${extra}`);
    renderFlow(res);
    renderMetrics(res);
    renderDetected(res.detected || null);
    renderOutput(res.files || []);
    renderAnalysis(res.analysis || null);

    const outdir = $('#icd-outdir', S.root);
    if (outdir) outdir.textContent = res.outDir;

    if (res.analysisError) {
      toast({ type: 'info', title: 'Analysis incomplete', message: res.analysisError, timeout: 8000 });
    }
    const searchInput = $('#icd-search-input', S.root);
    if (searchInput) searchInput.disabled = false;
    const ofb = $('#icd-open-folder', S.root);
    if (ofb) { ofb.disabled = false; ofb.dataset.path = res.outDir; }
    const da = $('#icd-download-all', S.root);
    if (da) da.disabled = false;
    const ca = $('#icd-copy-all', S.root);
    if (ca) ca.disabled = false;
  }

  function renderDetected(det) {
    const info = S.root ? $('#icd-info', S.root) : null;
    if (!info) return;
    info.innerHTML = '';
    if (!det) {
      info.appendChild(h('div', { class: 'icd-hint', text: 'No files detected.' }));
      return;
    }
    const rows = [
      ['libil2cpp.so', det.lib || 'not found'],
      ['global-metadata.dat', det.metadata || 'not found'],
      ['architecture', det.arch || 'unknown'],
      ['metadata encrypted', det.encrypted ? 'yes - decrypted automatically' : 'no'],
    ];
    const grid = h('div', { class: 'icd-detect-grid' });
    for (const [k, v] of rows) {
      grid.appendChild(h('div', { class: 'icd-detect-k', text: k }));
      grid.appendChild(h('div', { class: 'icd-detect-v', text: v }));
    }
    info.appendChild(grid);
  }

  /* --------------------------------------------------------------- output */

  function fileRank(name) {
    if (/^dump\.cs$/i.test(name)) return 0;
    if (/^il2cpp\.h$/i.test(name)) return 1;
    if (/^script\.json$/i.test(name)) return 2;
    if (/^stringliteral\.json$/i.test(name)) return 3;
    if (/^rename-map\.json$/i.test(name)) return 4;
    if (/^report\.json$/i.test(name)) return 5;
    if (/^report\.md$/i.test(name)) return 6;
    if (/^types\.csv$/i.test(name)) return 7;
    if (/\.(json)$/i.test(name)) return 8;
    if (/\.(md|txt|csv|log)$/i.test(name)) return 9;
    if (/\.dll$/i.test(name)) return 11;
    return 10;
  }

  function fileIcon(name) {
    if (/\.cs$/i.test(name)) return 'code';
    if (/\.json$/i.test(name)) return 'braces';
    if (/\.(py|js)$/i.test(name)) return 'code';
    if (/\.(h|cpp)$/i.test(name)) return 'code';
    if (/\.(md|txt)$/i.test(name)) return 'file-text';
    if (/\.(csv)$/i.test(name)) return 'grid';
    if (/\.log$/i.test(name)) return 'terminal';
    if (/\.dll$/i.test(name)) return 'package';
    if (/dump/i.test(name)) return 'file-text';
    return 'file';
  }

  function isTextFile(name) {
    return /\.(cs|json|txt|py|cpp|h|js|md|log|csv|xml|yml|yaml)$/i.test(name);
  }

  function fmtSize(b) {
    if (b == null) return '';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderOutput(files) {
    const list = S.root ? $('#icd-filelist', S.root) : null;
    if (!list) return;
    list.innerHTML = '';
    if (!files || !files.length) {
      list.appendChild(h('div', { class: 'icd-hint', style: 'padding:12px;', text: 'No output files.' }));
      return;
    }
    const sorted = [...files].sort((a, b) => fileRank(a.name) - fileRank(b.name) || a.name.localeCompare(b.name));
    for (const f of sorted) {
      const row = h('div', {
        class: 'icd-fileitem',
        tabindex: '0',
        role: 'button',
        dataset: { name: f.name },
        onclick: () => selectFile(f),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectFile(f); } },
        oncontextmenu: (e) => openFileMenu(e, f),
      },
        h('span', { class: 'icd-fileicon', html: icon(fileIcon(f.name), 13) }),
        h('span', { class: 'icd-filetext' },
          h('span', { class: 'icd-filename', text: f.name }),
          h('span', { class: 'icd-filesize', text: fmtSize(f.size) }),
        ),
        h('button', {
          class: 'icd-file-dl',
          title: 'Download ' + f.name,
          attrs: { 'aria-label': 'Download ' + f.name },
          onclick: (e) => { e.stopPropagation(); downloadFile(f); },
        }, h('span', { html: icon('download', 12) })),
      );
      list.appendChild(row);
    }
    const first = sorted.find(f => /\.(cs|json|txt|py|cpp|h)$/i.test(f.name)) || sorted[0];
    if (first) selectFile(first);
  }

  async function selectFile(f) {
    S.selectedFile = f;
    const list = S.root ? $('#icd-filelist', S.root) : null;
    if (list) {
      for (const el of list.querySelectorAll('.icd-fileitem')) {
        el.classList.toggle('active', el.dataset.name === f.name);
      }
    }
    const preview = S.root ? $('#icd-preview', S.root) : null;
    if (!preview) return;
    preview.innerHTML = '';
    preview.appendChild(h('div', { class: 'icd-loading', text: 'Loading ' + f.name + '…' }));
    try {
      const res = await window.seMenu.il2cpp.readFile({ path: f.path });
      preview.innerHTML = '';
      if (!res || res.ok === false) {
        preview.appendChild(h('div', { class: 'icd-hint', text: (res && res.error) || 'could not read file' }));
        return;
      }
      const tooBig = res.size && res.size > 2 * 1024 * 1024;
      if (res.binary) {
        preview.appendChild(h('div', { class: 'icd-empty' },
          h('div', { class: 'icd-empty-icon', html: icon('package', 22) }),
          h('div', { class: 'icd-empty-title', text: f.name }),
          h('div', { class: 'icd-empty-sub', text: `${fmtSize(f.size)} · binary file, not shown as text.` }),
          h('div', { class: 'icd-empty-actions' },
            h('button', { class: 'btn btn-sm btn-primary', onclick: () => downloadFile(f) },
              h('span', { html: icon('download', 13) }), h('span', { text: 'Download' })),
            h('button', { class: 'btn btn-sm btn-ghost', onclick: () => saveAsFile(f) },
              h('span', { html: icon('save', 13) }), h('span', { text: 'Save as…' })),
          ),
        ));
        return;
      }
      if (tooBig) {
        preview.appendChild(h('div', { class: 'icd-empty' },
          h('div', { class: 'icd-empty-icon', html: icon('file-text', 22) }),
          h('div', { class: 'icd-empty-title', text: f.name }),
          h('div', { class: 'icd-empty-sub', text: `${fmtSize(f.size)} · too large for the editor. Download it, or open a type in the Explorer.` }),
          h('div', { class: 'icd-empty-actions' },
            h('button', { class: 'btn btn-sm btn-primary', onclick: () => downloadFile(f) },
              h('span', { html: icon('download', 13) }), h('span', { text: 'Download' })),
            h('button', { class: 'btn btn-sm btn-ghost', onclick: () => saveAsFile(f) },
              h('span', { html: icon('save', 13) }), h('span', { text: 'Save as…' })),
          ),
        ));
        return;
      }
      const ta = h('textarea', { class: 'icd-editor', spellcheck: false });
      ta.value = res.content || '';
      ta.dataset.path = f.path;
      const bar = h('div', { class: 'icd-preview-bar' },
        h('div', { class: 'icd-preview-name' },
          h('span', { class: 'icd-fileicon', html: icon(fileIcon(f.name), 13) }),
          h('span', { text: f.name }),
          h('span', { class: 'icd-preview-size', text: fmtSize(f.size) }),
        ),
        h('div', { class: 'icd-preview-actions' },
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => saveFile(f.path, ta) },
            h('span', { html: icon('save', 12) }), h('span', { text: 'Save' })),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => downloadFile(f) },
            h('span', { html: icon('download', 12) }), h('span', { text: 'Download' })),
        ),
      );
      preview.appendChild(bar);
      preview.appendChild(ta);
    } catch (e) {
      preview.innerHTML = '';
      preview.appendChild(h('div', { class: 'icd-hint', text: e.message }));
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

  async function saveAsFile(f) {
    try {
      const res = await window.seMenu.il2cpp.saveAs({ path: f.path, name: f.name });
      if (res && res.ok) toast({ type: 'success', title: 'Saved', message: res.savedTo, timeout: 3000 });
      else if (res && res.canceled) { /* the user closed the dialog */ }
      else toast({ type: 'error', title: 'Save failed', message: (res && res.error) || 'unknown', timeout: 4000 });
    } catch (e) {
      toast({ type: 'error', title: 'Save failed', message: e.message, timeout: 4000 });
    }
  }

  async function revealFile(f) {
    try {
      const res = await window.seMenu.il2cpp.revealFile({ path: f.path });
      if (!res || res.ok === false) throw new Error((res && res.error) || 'reveal failed');
    } catch (e) {
      toast({ type: 'error', title: 'Could not open the folder', message: e.message, timeout: 4000 });
    }
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      toast({ type: 'success', title: 'Copied', message: label || 'Copied to the clipboard.', timeout: 2000 });
    } catch (e) {
      toast({ type: 'error', title: 'Copy failed', message: e.message, timeout: 4000 });
    }
  }

  async function copyContents(f) {
    try {
      const r = await window.seMenu.il2cpp.readFile({ path: f.path });
      if (!r || r.ok === false) throw new Error((r && r.error) || 'could not read file');
      if (r.binary) throw new Error('binary file');
      if ((r.size || 0) > 5 * 1024 * 1024) throw new Error('file is larger than 5 MB');
      await copyText(r.content, `${f.name} copied.`);
    } catch (e) {
      toast({ type: 'error', title: 'Copy failed', message: e.message, timeout: 4000 });
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
      let out = '';
      for (const f of S.result.files) {
        if (!isTextFile(f.name) || (f.size || 0) > 8 * 1024 * 1024) continue;
        const r = await window.seMenu.il2cpp.readFile({ path: f.path });
        if (r && r.ok && !r.binary) out += `\n===== ${f.name} =====\n${r.content}\n`;
      }
      if (!out) throw new Error('no text output to copy');
      await copyText(out, 'All text output copied.');
    } catch (e) {
      toast({ type: 'error', title: 'Copy failed', message: e.message, timeout: 4000 });
    }
  }

  async function openFolder() {
    const btn = S.root ? $('#icd-open-folder', S.root) : null;
    const p = btn && btn.dataset.path;
    if (!p) return;
    try { await window.seMenu.il2cpp.openFolder({ path: p }); }
    catch (e) { toast({ type: 'error', title: 'Open failed', message: e.message, timeout: 4000 }); }
  }

  /* ---------------------------------------------------------- context menu */

  function closeMenu() {
    if (S.menuCleanup) { S.menuCleanup(); S.menuCleanup = null; }
    if (S.menuEl && S.menuEl.parentNode) S.menuEl.parentNode.removeChild(S.menuEl);
    S.menuEl = null;
  }

  function openFileMenu(ev, f) {
    ev.preventDefault();
    ev.stopPropagation();
    closeMenu();

    const items = [
      { icon: 'download', label: 'Download', hint: 'to Downloads', run: () => downloadFile(f) },
      { icon: 'save', label: 'Save as…', hint: '', run: () => saveAsFile(f) },
      { sep: true },
      { icon: 'copy', label: 'Copy path', run: () => copyText(f.path, 'Path copied.') },
    ];
    if (isTextFile(f.name) && (f.size || 0) <= 5 * 1024 * 1024) {
      items.push({ icon: 'file-text', label: 'Copy contents', run: () => copyContents(f) });
    }
    items.push(
      { sep: true },
      { icon: 'folder-open', label: 'Show in folder', run: () => revealFile(f) },
      { icon: 'folder', label: 'Open output folder', run: openFolder },
    );

    const menu = h('div', { class: 'icd-menu', role: 'menu' });
    for (const item of items) {
      if (item.sep) { menu.appendChild(h('div', { class: 'icd-menu-sep' })); continue; }
      const btn = h('button', {
        class: 'icd-menu-item',
        role: 'menuitem',
        onclick: () => { closeMenu(); item.run(); },
      },
        h('span', { class: 'icd-menu-icon', html: icon(item.icon, 13) }),
        h('span', { class: 'icd-menu-label', text: item.label }),
        item.hint ? h('span', { class: 'icd-menu-hint', text: item.hint }) : null,
      );
      menu.appendChild(btn);
    }
    menu.appendChild(h('div', { class: 'icd-menu-foot', text: f.name }));

    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const x = Math.min(ev.clientX, window.innerWidth - rect.width - 8);
    const y = Math.min(ev.clientY, window.innerHeight - rect.height - 8);
    menu.style.left = Math.max(8, x) + 'px';
    menu.style.top = Math.max(8, y) + 'px';
    S.menuEl = menu;

    const onDown = (e) => { if (!menu.contains(e.target)) closeMenu(); };
    const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
    const onBlur = () => closeMenu();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    S.menuCleanup = () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
    const first = menu.querySelector('.icd-menu-item');
    if (first) first.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------- analysis */

  function verdictState(v) {
    if (v === 'pass') return 'ok';
    if (v === 'warn') return 'warn';
    if (!v) return 'idle';
    return 'err';
  }

  function block(title, badge, body, open) {
    return h('details', { class: 'icd-block', open: !!open },
      h('summary', { class: 'icd-block-summary' },
        h('span', { class: 'icd-block-chevron', html: icon('chevron-right', 12) }),
        h('span', { class: 'icd-block-title', text: title }),
        badge != null ? h('span', { class: 'icd-block-badge', text: String(badge) }) : null,
      ),
      h('div', { class: 'icd-block-body' }, body),
    );
  }

  function kvGrid(pairs) {
    const box = h('div', { class: 'icd-kv' });
    for (const [k, v] of pairs) {
      box.appendChild(h('div', { class: 'icd-kv-k', text: k }));
      box.appendChild(h('div', { class: 'icd-kv-v', text: v == null ? '—' : String(v) }));
    }
    return box;
  }

  function dataTable(headers, rows, opts) {
    const o = opts || {};
    const wrap = h('div', { class: 'icd-table-wrap' });
    const t = h('table', { class: 'icd-table' });
    const thead = h('thead');
    const hr = h('tr');
    for (const hd of headers) hr.appendChild(h('th', { text: hd }));
    thead.appendChild(hr);
    t.appendChild(thead);
    const tb = h('tbody');
    for (const row of rows) {
      const tr = h('tr');
      if (row && row.__typeDefIndex != null) {
        tr.className = 'icd-row-click';
        tr.addEventListener('click', () => openTypeByIndex(row.__typeDefIndex, row.__label));
      }
      for (const cell of (row && row.cells) || row) {
        tr.appendChild(h('td', { text: cell == null ? '—' : String(cell) }));
      }
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    wrap.appendChild(t);
    if (o.max) wrap.style.maxHeight = o.max;
    return wrap;
  }

  function bulletList(items) {
    const ul = h('ul', { class: 'icd-bullets' });
    for (const it of items) ul.appendChild(h('li', { text: it }));
    return ul;
  }

  function countsGrid(counts) {
    const grid = h('div', { class: 'icd-counts' });
    const order = ['typeDefinitions', 'methods', 'fields', 'properties', 'events', 'parameters',
      'images', 'assemblies', 'genericContainers', 'genericParameters', 'interfaces',
      'nestedTypes', 'fieldRefs', 'stringLiteral', 'attributes', 'vtableMethods'];
    const keys = [...order.filter(k => counts[k] != null), ...Object.keys(counts).filter(k => !order.includes(k))];
    for (const k of keys) {
      grid.appendChild(h('div', { class: 'icd-count' },
        h('div', { class: 'icd-count-v', text: fmtInt(Number(counts[k])) }),
        h('div', { class: 'icd-count-k', text: k }),
      ));
    }
    return grid;
  }

  function signalRows(signals) {
    const list = h('div', { class: 'icd-signals' });
    for (const s of signals) {
      const pressure = Number(s.pressure) || 0;
      const tone = pressure >= 0.9 ? 'err' : pressure >= 0.5 ? 'warn' : pressure > 0 ? 'mid' : 'ok';
      list.appendChild(h('div', { class: 'icd-signal', dataset: { tone } },
        h('div', { class: 'icd-signal-head' },
          h('span', { class: 'icd-signal-name', text: s.name }),
          h('span', { class: 'icd-signal-num', text: s.of ? `${fmtInt(s.measured)} / ${fmtInt(s.of)}` : `${s.measured}` }),
        ),
        h('div', { class: 'icd-signal-bar' }, h('i', { style: `width:${Math.round(pressure * 100)}%` })),
        h('div', { class: 'icd-signal-foot' },
          h('span', { text: `pressure ${pressure.toFixed(2)}` }),
          h('span', { text: `normal ${s.normal}` }),
        ),
      ));
    }
    return list;
  }

  function renameTable(entries) {
    const rows = entries.map(r => ({
      cells: [
        r.original,
        r.suggestion,
        `${Math.round((r.confidence || 0) * 100)}%`,
        r.role || '—',
        (r.evidence || []).join('; '),
      ],
      __typeDefIndex: r.typeDefIndex,
      __label: r.original,
    }));
    return dataTable(['type', 'suggested', 'confidence', 'role', 'evidence'], rows, { max: '320px' });
  }

  function roleBars(roles) {
    const entries = Object.entries(roles).sort((a, b) => b[1] - a[1]);
    const max = entries.length ? entries[0][1] : 1;
    const list = h('div', { class: 'icd-roles' });
    for (const [role, n] of entries) {
      list.appendChild(h('div', { class: 'icd-role' },
        h('div', { class: 'icd-role-head' },
          h('span', { class: 'icd-role-name', text: role }),
          h('span', { class: 'icd-role-n', text: fmtInt(n) }),
        ),
        h('div', { class: 'icd-role-bar' }, h('i', { style: `width:${Math.round((n / max) * 100)}%` })),
      ));
    }
    return list;
  }

  function decryptBlock(d) {
    if (!d) return null;
    const v = d.verification || null;
    const rec = d.recovered || null;
    const body = h('div', { class: 'icd-stack' });
    if (d.mode !== 'container') {
      body.appendChild(h('div', { class: 'icd-hint', text: `Legacy path: repeating XOR with the supplied key. Output ${fmtSize(d.outputSize)}.` }));
      return body;
    }
    body.appendChild(kvGrid([
      ['mode', 'container'],
      ['header seed', d.headerSeed],
      ['descriptor score', `${d.headerScore} / 126`],
      ['S-box', `${d.sbox ? d.sbox.va : '?'} (${d.sbox ? d.sbox.source : '?'})`],
      ['size', `${fmtSize(d.inputSize)} → ${fmtSize(d.outputSize)}`],
      ['validation', d.validation ? (d.validation.ok ? 'valid on arrival' : `${d.validation.issues.length} issue(s) left`) : 'not checked'],
    ]));
    if (rec) {
      body.appendChild(h('div', { class: 'icd-inline-note' },
        `Recovered exactly: ${fmtInt(rec.genericContainerIndex)} generic container indexes, ${fmtInt(rec.elementTypeIndex)} enum element types.`));
    }
    if (v) {
      if (v.literalVerified) {
        const layout = v.literalLayout === 'offsets'
          ? 'an offset array, with each length taken from the gap to the next row'
          : 'stock {length, dataIndex} rows';
        body.appendChild(h('div', { class: 'icd-inline-note ok',
          text: `String literals verified as ${layout}: ${fmtInt(v.literalRows)} rows over ${fmtSize(v.literalBlobBytes)}. The pair was emitted, so stringliteral.json carries them.` }));
      } else if (v.literalReason) {
        const sc = v.literalScores || {};
        const scores = (sc.stock != null && sc.offsets != null)
          ? ` Scores: {length,dataIndex} ${(sc.stock * 100).toFixed(1)}%, offsets ${(sc.offsets * 100).toFixed(1)}%.`
          : '';
        body.appendChild(h('div', { class: 'icd-inline-note warn',
          text: `String literals left empty: ${v.literalReason}.${scores}` }));
      }
      const rows = (v.sections || [])
        .filter(s => s.verified != null)
        .map(s => [s.name || `e${s.index}`, fmtSize(s.bytes), s.seed ? s.seed.slice(0, 12) + '…' : 'clear', `${Math.round((s.score || 0) * 100)}%`, s.verified ? 'verified' : 'UNVERIFIED']);
      if (rows.length) body.appendChild(dataTable(['section', 'bytes', 'seed', 'score', 'state'], rows));
    }
    if (d.validation && !d.validation.ok) {
      body.appendChild(dataTable(['severity', 'code', 'detail'],
        d.validation.issues.map(i => [i.severity, i.code, i.detail])));
    }
    return body;
  }

  function renderAnalysis(a) {
    S.analysis = a || null;
    const box = S.root ? $('#icd-analysis', S.root) : null;
    const pill = S.root ? $('#icd-verdict', S.root) : null;
    const rerun = S.root ? $('#icd-reanalyse', S.root) : null;
    if (!box) return;
    box.innerHTML = '';

    const res = S.result;
    const d = res && res.decrypt;

    if (!a) {
      if (pill) { pill.textContent = 'NOT RUN'; pill.dataset.state = 'idle'; }
      if (rerun) rerun.disabled = true;
      if (d) {
        box.appendChild(block('Decrypt', d.mode, decryptBlock(d), true));
        box.appendChild(h('div', { class: 'icd-hint', text: 'No dump analysis yet. Re-run once dump.cs exists.' }));
      } else {
        box.appendChild(h('div', { class: 'icd-hint', text: 'No analysis.' }));
      }
      return;
    }
    if (pill) {
      pill.textContent = String(a.verdict || 'unknown').toUpperCase();
      pill.dataset.state = verdictState(a.verdict);
    }
    if (rerun) rerun.disabled = false;

    const top = h('div', { class: `icd-verdict-box ${verdictState(a.verdict)}` },
      h('div', { class: 'icd-verdict-k', text: 'VERDICT' }),
      h('div', { class: 'icd-verdict-v', text: String(a.verdict || 'unknown').toUpperCase() }),
      h('div', { class: 'icd-verdict-s', text: (a.verdictReasons && a.verdictReasons.length) ? `${a.verdictReasons.length} reason(s)` : 'nothing to report' }),
    );
    const reasons = h('div', { class: 'icd-reasons' });
    if (a.verdictReasons && a.verdictReasons.length) {
      for (const r of a.verdictReasons) reasons.appendChild(h('div', { class: 'icd-reason', text: r }));
    } else {
      reasons.appendChild(h('div', { class: 'icd-reason muted', text: 'No structural disagreement, no naming pressure, every address inside an executable segment.' }));
    }
    box.appendChild(h('div', { class: 'icd-analysis-top' }, top, reasons));

    const m = a.metadata || {};
    const metaBody = h('div', { class: 'icd-stack' });
    metaBody.appendChild(kvGrid([
      ['version', m.version],
      ['valid before repair', m.okBefore ? 'yes' : 'no'],
      ['valid after repair', m.okAfter ? 'yes' : 'no'],
      ['size', fmtSize(m.size)],
    ]));
    if (m.counts) metaBody.appendChild(countsGrid(m.counts));
    if (m.issues && m.issues.length) {
      metaBody.appendChild(h('div', { class: 'icd-sub-title', text: `Findings (${m.issues.length})` }));
      metaBody.appendChild(dataTable(['severity', 'code', 'detail'], m.issues.map(i => [i.severity, i.code, i.detail])));
    }
    if (m.repairs && m.repairs.length) {
      metaBody.appendChild(h('div', { class: 'icd-sub-title', text: `Repairs applied (${m.repairs.length})` }));
      metaBody.appendChild(dataTable(['code', 'detail'], m.repairs.map(r => [r.code, r.detail])));
    }
    if (m.uncertain && m.uncertain.length) {
      metaBody.appendChild(h('div', { class: 'icd-sub-title', text: 'Not recovered' }));
      metaBody.appendChild(bulletList(m.uncertain));
    }
    box.appendChild(block('Metadata', m.version ? `v${m.version}` : null, metaBody, true));

    if (d) box.appendChild(block('Decrypt', d.mode, decryptBlock(d), false));

    const c = a.crosscheck;
    if (c) {
      const ccBody = h('div', { class: 'icd-stack' });
      ccBody.appendChild(dataTable(['table', 'metadata', 'dump.cs'], [
        ['types', fmtInt(c.metadata.types), fmtInt(c.dump.types)],
        ['methods', fmtInt(c.metadata.methods), fmtInt(c.dump.methods)],
        ['fields', fmtInt(c.metadata.fields), fmtInt(c.dump.fields)],
        ['images', fmtInt(c.metadata.images), fmtInt(c.images.dump)],
      ]));
      ccBody.appendChild(dataTable(['disagreement', 'count'],
        Object.entries(c.summary).map(([k, v]) => [k, fmtInt(v)])));
      const clean = Object.values(c.summary).every(v => v === 0);
      box.appendChild(block('Cross-check: metadata vs dump.cs', clean ? 'agrees' : 'differs', ccBody, !clean));
    }

    const n = a.naming;
    if (n) {
      const namingBody = h('div', { class: 'icd-stack' });
      namingBody.appendChild(h('div', { class: 'icd-inline-note' },
        h('b', { text: `${String(n.verdict || '').toUpperCase()} · score ${n.score}` }),
        h('span', { text: ' — ' + (n.summary || '') }),
      ));
      namingBody.appendChild(signalRows(n.signals || []));
      if (n.hotNamespaces && n.hotNamespaces.length) {
        namingBody.appendChild(h('div', { class: 'icd-sub-title', text: 'Namespaces carrying machine-shaped names' }));
        namingBody.appendChild(dataTable(['namespace', 'short or mixed-script names'],
          n.hotNamespaces.map(x => [x.namespace, fmtInt(x.shortNames)])));
      }
      box.appendChild(block('Naming', `${n.verdict} · ${n.score}`, namingBody, true));

      if (n.findings && n.findings.length) {
        box.appendChild(block('Flagged names', fmtInt(n.flagged),
          dataTable(['type', 'reason', 'role'],
            n.findings.map(f => [f.original, ((f.suspicion && f.suspicion.reasons) || []).join(', '), f.role || '—'])),
          false));
      }
      if (n.renameMap && n.renameMap.length) {
        box.appendChild(block('Rename map', `${n.renameMap.length} of ${n.renameMapTotal || n.renameMap.length}`,
          h('div', { class: 'icd-stack' },
            h('div', { class: 'icd-inline-note', text: 'Suggestions only. Nothing in dump.cs was changed; rename-map.json and rename-map.md hold the same rows.' }),
            renameTable(n.renameMap),
          ), false));
      } else if (n.verdict === 'clean') {
        box.appendChild(block('Rename map', '0',
          h('div', { class: 'icd-inline-note', text: 'No name crossed the suspicion threshold, so no rename map was produced. That is the correct outcome for a clean assembly.' }),
          false));
      }
      if (n.roles) {
        box.appendChild(block('Roles', Object.keys(n.roles).length, roleBars(n.roles), false));
      }
      if (n.ranked && n.ranked.length) {
        box.appendChild(block('Game types by behaviour weight', n.ranked.length,
          dataTable(['type', 'kind', 'methods', 'fields', 'lifecycle', 'base'],
            n.ranked.map(g => ({
              cells: [g.name, g.kind, fmtInt(g.methods), fmtInt(g.fields), fmtInt(g.lifecycle), g.parent || '—'],
              __typeDefIndex: g.typeDefIndex,
              __label: g.name,
            })), { max: '360px' }),
          false));
      }
    }
  }

  async function runReanalyse() {
    if (!S.result) return;
    const btn = S.root ? $('#icd-reanalyse', S.root) : null;
    if (btn) btn.disabled = true;
    const status = $('#icd-status-text', S.root);
    if (status) status.textContent = 'Re-analysing the dump…';
    try {
      const res = await window.seMenu.il2cpp.analyse({ outDir: S.result.outDir });
      if (!res || res.ok === false) {
        toast({ type: 'error', title: 'Analysis failed', message: (res && res.error) || 'unknown', timeout: 6000 });
        return;
      }
      S.result.analysis = res;
      renderAnalysis(res);
      renderMetrics(S.result);
      renderFlow(S.result);
      const known = new Set(S.result.files.map(f => f.name));
      for (const f of (res.files || [])) {
        if (!known.has(f.name)) S.result.files.push(f);
      }
      renderOutput(S.result.files);
      toast({ type: 'success', title: 'Analysis complete', message: String(res.verdict || '').toUpperCase(), timeout: 2500 });
    } catch (e) {
      toast({ type: 'error', title: 'Analysis failed', message: e.message, timeout: 6000 });
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* --------------------------------------------------------------- search */

  let searchTimer = null;

  function wireSearch() {
    const input = $('#icd-search-input', S.root);
    const kind = $('#icd-search-kind', S.root);
    if (input) {
      input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(runSearch, 220);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(); }
      });
    }
    if (kind) kind.addEventListener('change', () => runSearch());
  }

  async function runSearch() {
    const input = S.root ? $('#icd-search-input', S.root) : null;
    const kindSel = S.root ? $('#icd-search-kind', S.root) : null;
    const meta = S.root ? $('#icd-search-meta', S.root) : null;
    const list = S.root ? $('#icd-search-results', S.root) : null;
    if (!input || !list) return;
    if (!S.result) {
      if (meta) meta.textContent = 'Run a dump first.';
      return;
    }
    const query = input.value.trim();
    const seq = ++S.searchSeq;
    list.innerHTML = '';
    if (!query) {
      if (meta) meta.textContent = 'No query.';
      return;
    }
    if (meta) meta.textContent = 'Searching…';
    try {
      const res = await window.seMenu.il2cpp.search({
        outDir: S.result.outDir,
        query,
        kind: kindSel && kindSel.value ? kindSel.value : undefined,
        limit: 80,
      });
      if (seq !== S.searchSeq) return;               // a newer query already ran
      if (!res || res.ok === false) {
        if (meta) meta.textContent = (res && res.error) || 'search failed';
        return;
      }
      if (meta) meta.textContent = `${res.total} hit${res.total === 1 ? '' : 's'} for "${query}"${res.total >= 80 ? ' (first 80)' : ''}`;
      if (!res.hits.length) {
        list.appendChild(h('div', { class: 'icd-hint', style: 'padding:10px;', text: 'No match. Try a shorter fragment.' }));
        return;
      }
      for (const hit of res.hits) {
        list.appendChild(h('button', {
          class: 'icd-hit',
          dataset: { kind: hit.kind },
          onclick: () => openType(hit),
        },
          h('span', { class: 'icd-hit-kind', text: hit.kind }),
          h('span', { class: 'icd-hit-label', text: hit.label }),
          h('span', { class: 'icd-hit-line', text: 'L' + hit.line }),
        ));
      }
    } catch (e) {
      if (meta) meta.textContent = e.message;
    }
  }

  async function openType(hit) {
    return openTypeByIndex(hit.typeDefIndex, hit.label);
  }

  async function openTypeByIndex(typeDefIndex, label) {
    const box = S.root ? $('#icd-type-detail', S.root) : null;
    if (!box || !S.result) return;
    if (typeDefIndex == null || typeDefIndex < 0) {
      toast({ type: 'info', title: 'No type', message: label ? `${label} is not a type.` : 'This row has no type.', timeout: 3000 });
      return;
    }
    box.innerHTML = '';
    box.appendChild(h('div', { class: 'icd-loading', text: 'Loading type…' }));
    try {
      const res = await window.seMenu.il2cpp.typeDetail({ outDir: S.result.outDir, typeDefIndex });
      box.innerHTML = '';
      if (!res || res.ok === false) {
        box.appendChild(h('div', { class: 'icd-hint', text: (res && res.error) || 'not found' }));
        return;
      }
      const t = res.type;
      const role = res.role || { role: null, confidence: 0, evidence: [] };
      const head = h('div', { class: 'icd-detail-head' },
        h('div', { class: 'icd-detail-title' },
          h('span', { class: 'icd-detail-kind', text: t.kind }),
          h('span', { class: 'icd-detail-name', text: t.fullName }),
        ),
        h('div', { class: 'icd-detail-chips' },
          h('span', { class: 'icd-chip', text: `${t.methodCount} methods` }),
          h('span', { class: 'icd-chip', text: `${t.fieldCount} fields` }),
          h('span', { class: 'icd-chip', text: `${t.propertyCount} properties` }),
          t.eventCount ? h('span', { class: 'icd-chip', text: `${t.eventCount} events` }) : null,
          h('span', { class: 'icd-chip acc', text: `role: ${role.role || 'unclassified'}${role.confidence ? ' · ' + Math.round(role.confidence * 100) + '%' : ''}` }),
        ),
        t.parent ? h('div', { class: 'icd-detail-parent', text: ': ' + t.parent }) : null,
        role.evidence && role.evidence.length ? h('div', { class: 'icd-detail-evidence', text: role.evidence.join(' · ') }) : null,
      );
      box.appendChild(head);

      if (res.fields.length) {
        box.appendChild(h('div', { class: 'icd-sub-title', text: `Fields (${res.fields.length})` }));
        box.appendChild(dataTable(['offset', 'type', 'name'],
          res.fields.map(f => [f.offset >= 0 ? '0x' + f.offset.toString(16) : '—', f.fieldType, f.name])));
      }
      if (res.methods.length) {
        box.appendChild(h('div', { class: 'icd-sub-title', text: `Methods (${res.methods.length})` }));
        box.appendChild(dataTable(['rva', 'signature'],
          res.methods.map(m => [m.rva >= 0 ? '0x' + m.rva.toString(16) : '—', m.signature])));
      }
      if (res.properties.length) {
        box.appendChild(h('div', { class: 'icd-sub-title', text: `Properties (${res.properties.length})` }));
        box.appendChild(dataTable(['signature'], res.properties.map(p => [p.signature])));
      }
      if (res.events.length) {
        box.appendChild(h('div', { class: 'icd-sub-title', text: `Events (${res.events.length})` }));
        box.appendChild(dataTable(['type', 'name'], res.events.map(e => [e.eventType, e.name])));
      }
      if (res.source.length) {
        box.appendChild(h('div', { class: 'icd-sub-title' },
          h('span', { text: `Source · lines ${t.lineStart}–${t.lineEnd}` }),
          h('button', { class: 'btn btn-sm btn-ghost', style: 'margin-left:auto;', onclick: () => copyText(res.source.join('\n'), 'Source copied.') },
            h('span', { html: icon('copy', 11) }), h('span', { text: 'Copy' })),
        ));
        const code = h('div', { class: 'icd-code' });
        for (let i = 0; i < res.source.length; i++) {
          code.appendChild(h('div', { class: 'icd-code-row' },
            h('span', { class: 'icd-code-n', text: String(t.lineStart + i) }),
            h('span', { class: 'icd-code-l', text: res.source[i] || ' ' }),
          ));
        }
        box.appendChild(code);
      }
    } catch (e) {
      box.innerHTML = '';
      box.appendChild(h('div', { class: 'icd-hint', text: e.message }));
    }
  }

  /* --------------------------------------------------------------- lifecycle */

  function mount(container) {
    S.mounted = true;
    buildUI(container);
  }

  function unmount() {
    closeMenu();
    clearTimeout(searchTimer);
    S.mounted = false;
    S.root = null;
  }

  M.il2cppDumper = { mount, unmount, open };

  /* ----------------------------------------------------------------- styles */

  const style = document.createElement('style');
  style.textContent = `
    .icd-page { display: flex; flex-direction: column; gap: var(--gap-section); }

    /* ---- hero ---- */
    .icd-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 2px 2px 6px; flex-wrap: wrap; }
    .icd-hero-main { min-width: 0; }
    .icd-eyebrow { display: flex; align-items: center; gap: 7px; font-family: var(--font-mono); font-size: 0.58rem; letter-spacing: 0.16em; color: var(--text-3); text-transform: uppercase; }
    .icd-eyebrow-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--acc-2); box-shadow: 0 0 10px var(--acc-2); }
    .icd-title { font-size: 1.95rem; font-weight: 700; letter-spacing: -0.035em; line-height: 1.02; margin: 7px 0 6px; }
    .icd-title .accent { background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .icd-lede { margin: 0; max-width: 620px; font-size: 0.74rem; line-height: 1.55; color: var(--text-2); }
    .icd-hero-side { display: flex; flex-direction: column; align-items: flex-end; gap: 7px; }
    .icd-status { font-family: var(--font-mono); font-size: 0.58rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 4px 9px; border-radius: 999px; border: 1px solid var(--stroke-2); color: var(--text-2); background: rgba(255,255,255,0.03); white-space: nowrap; }
    .icd-status[data-state="done"], .icd-status[data-state="ok"] { border-color: rgba(99,180,141,0.42); color: #b7e3cd; background: rgba(99,180,141,0.10); }
    .icd-status[data-state="warn"] { border-color: rgba(207,167,94,0.45); color: #ecd9ae; background: rgba(207,167,94,0.10); }
    .icd-status[data-state="error"], .icd-status[data-state="err"] { border-color: rgba(212,127,127,0.45); color: #efc8c8; background: rgba(212,127,127,0.10); }
    .icd-status[data-state="extracting"], .icd-status[data-state="dumping"] { border-color: var(--acc-line); color: var(--acc-3); background: var(--acc-soft); }
    .icd-status-text { font-family: var(--font-mono); font-size: 0.62rem; color: var(--text-3); max-width: 420px; text-align: right; line-height: 1.5; }

    /* ---- run card ---- */
    .icd-run .icd-run-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(260px, 1fr); gap: 20px; padding: var(--space-card); }
    .icd-source { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .icd-block-head { display: flex; align-items: center; gap: 9px; padding: 11px var(--space-card) 8px; }
    .icd-run .icd-block-head { padding: 0; }
    .icd-block-head-text { min-width: 0; }
    .icd-block-actions { margin-left: auto; display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
    .icd-drop { display: flex; align-items: center; gap: 14px; padding: 18px; border: 1.5px dashed var(--stroke-2); border-radius: var(--r-lg); background: rgba(255,255,255,0.018); transition: border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease); cursor: default; }
    .icd-drop.drag { border-color: var(--acc-2); background: var(--acc-soft); }
    .icd-drop.has-file { border-style: solid; border-color: rgba(99,180,141,0.45); background: rgba(99,180,141,0.06); }
    .icd-drop-icon { display: grid; place-items: center; width: 46px; height: 46px; flex-shrink: 0; border-radius: 12px; border: 1px solid var(--stroke); background: rgba(255,255,255,0.035); color: var(--text-2); }
    .icd-drop.has-file .icd-drop-icon { color: #a7e0c0; border-color: rgba(99,180,141,0.35); }
    .icd-drop-text { min-width: 0; }
    .icd-drop-title { font-size: 0.84rem; font-weight: 620; letter-spacing: -0.01em; }
    .icd-drop-sub { font-size: 0.68rem; color: var(--text-3); margin-top: 2px; }
    .icd-drop-name { margin-left: auto; font-family: var(--font-mono); font-size: 0.66rem; color: var(--text-3); max-width: 38%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icd-drop.has-file .icd-drop-name { color: #a7e0c0; }
    .icd-progress { height: 3px; border-radius: 999px; background: rgba(255,255,255,0.06); overflow: hidden; }
    .icd-progress-bar { height: 100%; width: 0%; border-radius: inherit; background: var(--grad); transition: width var(--t-med) var(--ease); }
    .icd-progress.active .icd-progress-bar { width: 100% !important; animation: icd-indet 1.3s ease-in-out infinite; background-size: 200% 100%; }
    .icd-progress.done .icd-progress-bar { background: linear-gradient(90deg, #63b48d, #8fd4b4); }
    @keyframes icd-indet { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
    .icd-advanced { border: 1px solid var(--stroke); border-radius: var(--r-md); background: rgba(255,255,255,0.014); }
    .icd-advanced > summary { cursor: pointer; padding: 7px 11px; font-size: 0.68rem; color: var(--text-3); list-style: none; display: flex; align-items: center; gap: 6px; }
    .icd-advanced > summary::-webkit-details-marker { display: none; }
    .icd-advanced > summary::before { content: '+'; font-family: var(--font-mono); color: var(--text-3); }
    .icd-advanced[open] > summary::before { content: '−'; }
    .icd-advanced-body { padding: 0 11px 11px; display: flex; flex-direction: column; gap: 7px; }
    .icd-advanced-body .input { font-size: 0.7rem; padding: 6px 9px; }
    .icd-hint { font-size: 0.68rem; color: var(--text-3); line-height: 1.55; }
    .icd-run-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; }

    .icd-flow { border-left: 1px solid var(--stroke); padding-left: 18px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .icd-flow-title { font-size: 0.58rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
    .icd-flow-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
    .icd-flow-step { display: grid; grid-template-columns: 12px 62px minmax(0, 1fr); align-items: center; gap: 8px; padding: 5px 0; font-size: 0.68rem; border-bottom: 1px solid rgba(255,255,255,0.035); }
    .icd-flow-step:last-child { border-bottom: none; }
    .icd-flow-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--stroke-3); justify-self: center; }
    .icd-flow-step[data-state="ok"] .icd-flow-dot { background: var(--ok); box-shadow: 0 0 8px rgba(99,180,141,0.55); }
    .icd-flow-step[data-state="warn"] .icd-flow-dot { background: var(--warn); box-shadow: 0 0 8px rgba(207,167,94,0.5); }
    .icd-flow-step[data-state="err"] .icd-flow-dot { background: var(--err); box-shadow: 0 0 8px rgba(212,127,127,0.5); }
    .icd-flow-step[data-state="skip"] .icd-flow-dot { background: transparent; border: 1px solid var(--stroke-3); }
    .icd-flow-label { color: var(--text-2); font-family: var(--font-mono); font-size: 0.62rem; letter-spacing: 0.04em; }
    .icd-flow-value { color: var(--text-1); font-family: var(--font-mono); font-size: 0.62rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icd-flow-step[data-state="pending"] .icd-flow-value { color: var(--text-3); }
    .icd-flow-note { font-size: 0.62rem; line-height: 1.55; color: var(--text-3); margin-top: auto; border-top: 1px solid var(--stroke); padding-top: 10px; }

    /* ---- metrics ---- */
    .icd-metrics { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
    .icd-metric { border: 1px solid var(--stroke); border-radius: var(--r-md); padding: 10px 12px; background: linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012)); min-width: 0; }
    .icd-metric-label { font-size: 0.55rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-3); }
    .icd-metric-value { font-family: var(--font-mono); font-size: 1.05rem; font-weight: 600; letter-spacing: -0.02em; margin-top: 3px; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; }
    .icd-metric-sub { font-size: 0.6rem; color: var(--text-3); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icd-metric[data-tone="ok"] .icd-metric-value { color: #a7e0c0; }
    .icd-metric[data-tone="warn"] .icd-metric-value { color: #ecd9ae; }
    .icd-metric[data-tone="err"] .icd-metric-value { color: #efc8c8; }

    /* ---- detected ---- */
    .icd-detect-body { padding: 0 var(--space-card) var(--space-card); }
    .icd-detect-grid { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 1px; background: var(--stroke); border: 1px solid var(--stroke); border-radius: var(--r-md); overflow: hidden; }
    .icd-detect-k { background: rgba(255,255,255,0.025); padding: 7px 11px; font-family: var(--font-mono); font-size: 0.64rem; color: var(--text-3); }
    .icd-detect-v { background: rgba(10,12,16,0.55); padding: 7px 11px; font-family: var(--font-mono); font-size: 0.64rem; color: var(--text-1); overflow-wrap: anywhere; }

    /* ---- output ---- */
    .icd-split { display: grid; grid-template-columns: 258px minmax(0, 1fr); border-top: 1px solid var(--stroke); height: 470px; }
    .icd-filelist { border-right: 1px solid var(--stroke); overflow-y: auto; padding: 7px; display: flex; flex-direction: column; gap: 1px; }
    .icd-fileitem { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 8px; cursor: pointer; color: var(--text-1); border: 1px solid transparent; transition: background var(--t-fast), border-color var(--t-fast); outline: none; }
    .icd-fileitem:hover { background: rgba(255,255,255,0.045); }
    .icd-fileitem:focus-visible { border-color: var(--acc-line); }
    .icd-fileitem.active { background: var(--acc-soft); border-color: var(--acc-line); }
    .icd-fileicon { color: var(--text-3); display: grid; place-items: center; flex-shrink: 0; }
    .icd-fileitem.active .icd-fileicon { color: var(--acc-2); }
    .icd-filetext { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 1px; }
    .icd-filename { font-family: var(--font-mono); font-size: 0.66rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icd-filesize { font-family: var(--font-mono); font-size: 0.56rem; color: var(--text-3); }
    .icd-file-dl { opacity: 0; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 6px; border: 1px solid var(--stroke); background: rgba(255,255,255,0.04); color: var(--text-2); cursor: pointer; flex-shrink: 0; transition: opacity var(--t-fast), color var(--t-fast); }
    .icd-fileitem:hover .icd-file-dl, .icd-fileitem:focus-within .icd-file-dl { opacity: 1; }
    .icd-file-dl:hover { color: var(--text-1); border-color: var(--stroke-3); }
    .icd-preview { overflow: auto; min-width: 0; position: relative; background: rgba(6,7,10,0.35); }
    .icd-preview-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 10px; border-bottom: 1px solid var(--stroke); background: rgba(10,12,16,0.7); position: sticky; top: 0; z-index: 3; backdrop-filter: blur(8px); }
    .icd-preview-name { display: flex; align-items: center; gap: 7px; min-width: 0; font-family: var(--font-mono); font-size: 0.66rem; color: var(--text-1); }
    .icd-preview-size { color: var(--text-3); font-size: 0.58rem; }
    .icd-preview-actions { display: flex; gap: 5px; }
    .icd-editor { display: block; width: 100%; height: calc(100% - 38px); min-height: 300px; border: none; background: transparent; color: #d7dce5; font-family: var(--font-mono); font-size: 0.7rem; line-height: 1.55; padding: 12px 14px; resize: none; outline: none; box-sizing: border-box; }
    .icd-outdir { padding: 7px var(--space-card) 9px; border-top: 1px solid var(--stroke); font-family: var(--font-mono); font-size: 0.58rem; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icd-loading { padding: 18px; font-family: var(--font-mono); font-size: 0.68rem; color: var(--text-3); }

    /* ---- empty states ---- */
    .icd-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 6px; padding: 34px 24px; min-height: 240px; }
    .icd-empty-icon { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; border: 1px solid var(--stroke); background: rgba(255,255,255,0.03); color: var(--text-3); margin-bottom: 4px; }
    .icd-empty-title { font-size: 0.78rem; font-weight: 600; }
    .icd-empty-sub { font-size: 0.66rem; color: var(--text-3); max-width: 330px; line-height: 1.55; }
    .icd-empty-actions { display: flex; gap: 7px; margin-top: 8px; }

    /* ---- analysis ---- */
    .icd-analysis { padding: 0 var(--space-card) var(--space-card); display: flex; flex-direction: column; gap: 8px; }
    .icd-analysis-top { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px; align-items: stretch; }
    .icd-verdict-box { border: 1px solid var(--stroke); border-radius: var(--r-md); padding: 10px 12px; display: flex; flex-direction: column; justify-content: center; background: rgba(255,255,255,0.025); }
    .icd-verdict-k { font-size: 0.54rem; letter-spacing: 0.14em; color: var(--text-3); }
    .icd-verdict-v { font-family: var(--font-mono); font-size: 1.15rem; font-weight: 700; letter-spacing: -0.02em; margin-top: 2px; }
    .icd-verdict-s { font-size: 0.58rem; color: var(--text-3); margin-top: 1px; }
    .icd-verdict-box.ok { border-color: rgba(99,180,141,0.35); background: rgba(99,180,141,0.07); }
    .icd-verdict-box.ok .icd-verdict-v { color: #a7e0c0; }
    .icd-verdict-box.warn { border-color: rgba(207,167,94,0.35); background: rgba(207,167,94,0.07); }
    .icd-verdict-box.warn .icd-verdict-v { color: #ecd9ae; }
    .icd-verdict-box.err { border-color: rgba(212,127,127,0.35); background: rgba(212,127,127,0.07); }
    .icd-verdict-box.err .icd-verdict-v { color: #efc8c8; }
    .icd-reasons { display: flex; flex-direction: column; gap: 4px; justify-content: center; }
    .icd-reason { font-size: 0.68rem; color: var(--text-1); padding-left: 12px; position: relative; line-height: 1.5; }
    .icd-reason::before { content: ''; position: absolute; left: 0; top: 6px; width: 4px; height: 4px; border-radius: 50%; background: var(--acc-2); }
    .icd-reason.muted { color: var(--text-3); }
    .icd-reason.muted::before { background: var(--ok); }
    .icd-block { border: 1px solid var(--stroke); border-radius: var(--r-md); background: rgba(255,255,255,0.014); overflow: hidden; }
    .icd-block[open] { background: rgba(255,255,255,0.022); }
    .icd-block-summary { display: flex; align-items: center; gap: 7px; padding: 8px 11px; cursor: pointer; list-style: none; font-size: 0.7rem; color: var(--text-2); }
    .icd-block-summary::-webkit-details-marker { display: none; }
    .icd-block-summary:hover { color: var(--text-1); }
    .icd-block-chevron { display: grid; place-items: center; color: var(--text-3); transition: transform var(--t-fast) var(--ease); }
    .icd-block[open] .icd-block-chevron { transform: rotate(90deg); }
    .icd-block-title { font-weight: 560; }
    .icd-block-badge { margin-left: auto; font-family: var(--font-mono); font-size: 0.56rem; color: var(--text-3); border: 1px solid var(--stroke); border-radius: 999px; padding: 1px 7px; }
    .icd-block-body { padding: 2px 11px 11px; }
    .icd-stack { display: flex; flex-direction: column; gap: 9px; }
    .icd-sub-title { display: flex; align-items: center; gap: 8px; font-size: 0.58rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-3); margin-top: 4px; }
    .icd-inline-note { font-size: 0.66rem; line-height: 1.55; color: var(--text-2); border-left: 2px solid var(--stroke-2); padding-left: 9px; }
    .icd-inline-note.ok { border-color: rgba(99,180,141,0.5); }
    .icd-inline-note.warn { border-color: rgba(207,167,94,0.5); }
    .icd-kv { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 3px 12px; font-family: var(--font-mono); font-size: 0.66rem; }
    .icd-kv-k { color: var(--text-3); }
    .icd-kv-v { color: var(--text-1); overflow-wrap: anywhere; }
    .icd-counts { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 5px; }
    .icd-count { border: 1px solid var(--stroke); border-radius: 7px; padding: 6px 8px; background: rgba(255,255,255,0.02); min-width: 0; }
    .icd-count-v { font-family: var(--font-mono); font-size: 0.78rem; font-weight: 600; font-variant-numeric: tabular-nums; }
    .icd-count-k { font-size: 0.54rem; color: var(--text-3); letter-spacing: 0.04em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icd-table-wrap { overflow: auto; border: 1px solid var(--stroke); border-radius: 8px; }
    .icd-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 0.64rem; }
    .icd-table th { position: sticky; top: 0; text-align: left; font-weight: 500; color: var(--text-3); background: rgba(10,12,16,0.94); padding: 6px 9px; border-bottom: 1px solid var(--stroke-2); white-space: nowrap; z-index: 1; }
    .icd-table td { padding: 5px 9px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: top; color: var(--text-1); overflow-wrap: anywhere; }
    .icd-table tr:last-child td { border-bottom: none; }
    .icd-table tbody tr:hover td { background: rgba(255,255,255,0.022); }
    .icd-row-click { cursor: pointer; }
    .icd-bullets { margin: 0; padding-left: 16px; font-size: 0.68rem; color: var(--text-1); display: flex; flex-direction: column; gap: 3px; }
    .icd-signals { display: flex; flex-direction: column; gap: 6px; }
    .icd-signal { border: 1px solid var(--stroke); border-radius: 8px; padding: 7px 9px; background: rgba(255,255,255,0.016); }
    .icd-signal-head { display: flex; justify-content: space-between; gap: 10px; font-family: var(--font-mono); font-size: 0.63rem; }
    .icd-signal-name { color: var(--text-1); }
    .icd-signal-num { color: var(--text-3); white-space: nowrap; }
    .icd-signal-bar { height: 3px; border-radius: 999px; background: rgba(255,255,255,0.055); margin: 5px 0 4px; overflow: hidden; }
    .icd-signal-bar i { display: block; height: 100%; border-radius: inherit; background: var(--ok); transition: width var(--t-med) var(--ease); }
    .icd-signal[data-tone="mid"] .icd-signal-bar i { background: var(--acc-2); }
    .icd-signal[data-tone="warn"] .icd-signal-bar i { background: var(--warn); }
    .icd-signal[data-tone="err"] .icd-signal-bar i { background: var(--err); }
    .icd-signal-foot { display: flex; justify-content: space-between; gap: 10px; font-family: var(--font-mono); font-size: 0.55rem; color: var(--text-3); }
    .icd-roles { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 5px 14px; }
    .icd-role { min-width: 0; }
    .icd-role-head { display: flex; justify-content: space-between; gap: 8px; font-family: var(--font-mono); font-size: 0.6rem; }
    .icd-role-name { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icd-role-n { color: var(--text-3); }
    .icd-role-bar { height: 2px; border-radius: 999px; background: rgba(255,255,255,0.05); margin-top: 3px; overflow: hidden; }
    .icd-role-bar i { display: block; height: 100%; background: var(--acc-line); }

    /* ---- explorer ---- */
    .icd-searchbar { display: flex; align-items: center; gap: 9px; margin: 0 var(--space-card) 8px; padding: 0 11px; border: 1px solid var(--stroke-2); border-radius: var(--r-md); background: rgba(255,255,255,0.025); transition: border-color var(--t-fast); }
    .icd-searchbar:focus-within { border-color: var(--acc-line); box-shadow: 0 0 0 3px rgba(139,124,246,0.09); }
    .icd-searchbar-icon { color: var(--text-3); display: grid; place-items: center; }
    .icd-searchbar-input { flex: 1; min-width: 0; border: none; background: transparent; color: var(--text-1); font-family: var(--font-mono); font-size: 0.74rem; padding: 9px 0; outline: none; }
    .icd-searchbar-input::placeholder { color: var(--text-3); }
    .icd-searchbar-key { font-family: var(--font-mono); font-size: 0.6rem; color: var(--text-3); border: 1px solid var(--stroke); border-radius: 4px; padding: 1px 5px; }
    .icd-kind { font-size: 0.64rem; padding: 4px 8px; border-radius: 7px; border: 1px solid var(--stroke); background: rgba(255,255,255,0.03); color: var(--text-2); font-family: var(--font-mono); outline: none; }
    .icd-search-meta { padding: 0 var(--space-card) 8px; font-family: var(--font-mono); font-size: 0.6rem; color: var(--text-3); }
    .icd-explorer-split { display: grid; grid-template-columns: 340px minmax(0, 1fr); border-top: 1px solid var(--stroke); height: 560px; }
    .icd-search-results { border-right: 1px solid var(--stroke); overflow-y: auto; padding: 7px; display: flex; flex-direction: column; gap: 1px; }
    .icd-hit { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--text-1); text-align: left; cursor: pointer; font-family: var(--font-mono); font-size: 0.62rem; }
    .icd-hit:hover { background: rgba(255,255,255,0.045); }
    .icd-hit:focus-visible { border-color: var(--acc-line); outline: none; }
    .icd-hit-kind { font-size: 0.5rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); border: 1px solid var(--stroke); border-radius: 4px; padding: 1px 4px; text-align: center; }
    .icd-hit[data-kind="type"] .icd-hit-kind { color: var(--acc-3); border-color: var(--acc-line); }
    .icd-hit[data-kind="method"] .icd-hit-kind { color: #a7e0c0; border-color: rgba(99,180,141,0.35); }
    .icd-hit[data-kind="field"] .icd-hit-kind { color: #ecd9ae; border-color: rgba(207,167,94,0.35); }
    .icd-hit[data-kind="property"] .icd-hit-kind { color: #9ec7e8; border-color: rgba(120,170,210,0.35); }
    .icd-hit-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icd-hit-line { color: var(--text-3); font-size: 0.54rem; }
    .icd-type-detail { overflow-y: auto; padding: 12px 14px; min-width: 0; }
    .icd-detail-head { display: flex; flex-direction: column; gap: 6px; padding-bottom: 9px; border-bottom: 1px solid var(--stroke); margin-bottom: 4px; }
    .icd-detail-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .icd-detail-kind { font-family: var(--font-mono); font-size: 0.54rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--acc-3); border: 1px solid var(--acc-line); background: var(--acc-soft); border-radius: 5px; padding: 2px 6px; }
    .icd-detail-name { font-family: var(--font-mono); font-size: 0.86rem; font-weight: 600; letter-spacing: -0.01em; overflow-wrap: anywhere; }
    .icd-detail-chips { display: flex; gap: 5px; flex-wrap: wrap; }
    .icd-chip { font-family: var(--font-mono); font-size: 0.56rem; color: var(--text-2); border: 1px solid var(--stroke); border-radius: 999px; padding: 2px 7px; background: rgba(255,255,255,0.02); }
    .icd-chip.acc { color: var(--acc-3); border-color: var(--acc-line); background: var(--acc-soft); }
    .icd-detail-parent { font-family: var(--font-mono); font-size: 0.62rem; color: var(--text-3); overflow-wrap: anywhere; }
    .icd-detail-evidence { font-size: 0.6rem; color: var(--text-3); line-height: 1.5; }
    .icd-code { border: 1px solid var(--stroke); border-radius: 8px; background: rgba(6,7,10,0.55); overflow: auto; max-height: 380px; padding: 6px 0; }
    .icd-code-row { display: flex; gap: 10px; font-family: var(--font-mono); font-size: 0.62rem; line-height: 1.55; white-space: pre; }
    .icd-code-row:hover { background: rgba(255,255,255,0.03); }
    .icd-code-n { width: 46px; flex-shrink: 0; text-align: right; color: var(--text-3); user-select: none; }
    .icd-code-l { color: #cfd6e2; }

    /* ---- context menu ---- */
    .icd-menu { position: fixed; z-index: 9999; min-width: 208px; padding: 5px; border-radius: 10px; border: 1px solid var(--stroke-2); background: rgba(14,16,22,0.97); box-shadow: var(--shadow-2); backdrop-filter: blur(14px); animation: icd-menu-in 0.12s var(--ease); }
    @keyframes icd-menu-in { from { opacity: 0; transform: translateY(-3px) scale(0.98); } to { opacity: 1; transform: none; } }
    .icd-menu-item { display: flex; align-items: center; gap: 9px; width: 100%; padding: 7px 9px; border: none; border-radius: 7px; background: transparent; color: var(--text-1); font-size: 0.7rem; text-align: left; cursor: pointer; }
    .icd-menu-item:hover, .icd-menu-item:focus-visible { background: var(--acc-soft); outline: none; }
    .icd-menu-icon { color: var(--text-3); display: grid; place-items: center; width: 15px; }
    .icd-menu-item:hover .icd-menu-icon { color: var(--acc-2); }
    .icd-menu-label { flex: 1; }
    .icd-menu-hint { font-family: var(--font-mono); font-size: 0.54rem; color: var(--text-3); }
    .icd-menu-sep { height: 1px; margin: 4px 6px; background: var(--stroke); }
    .icd-menu-foot { padding: 5px 9px 3px; font-family: var(--font-mono); font-size: 0.54rem; color: var(--text-3); border-top: 1px solid var(--stroke); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* ---- responsive ---- */
    @media (max-width: 1080px) {
      .icd-run .icd-run-grid { grid-template-columns: minmax(0, 1fr); }
      .icd-flow { border-left: none; border-top: 1px solid var(--stroke); padding-left: 0; padding-top: 12px; }
      .icd-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .icd-explorer-split { grid-template-columns: minmax(0, 1fr); height: auto; }
      .icd-search-results { border-right: none; border-bottom: 1px solid var(--stroke); max-height: 260px; }
      .icd-type-detail { max-height: 520px; }
    }
    @media (max-width: 760px) {
      .icd-split { grid-template-columns: minmax(0, 1fr); height: auto; }
      .icd-filelist { border-right: none; border-bottom: 1px solid var(--stroke); max-height: 200px; }
      .icd-preview { min-height: 340px; }
      .icd-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .icd-analysis-top { grid-template-columns: minmax(0, 1fr); }
    }
  `;
  document.head.appendChild(style);

})(window.SEMENU);
