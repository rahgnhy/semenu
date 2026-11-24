/* ============================================================================
   playground.js — Component Playground: a live collection of every control
   style in the design system. All of them respond to interaction.
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, $$, clear, toast, bus, icon, attachRipple, fmtInt } = P.dom;

  let refs = null;
  let interactions = 0;

  function interact(name) {
    interactions++;
    if (refs && refs.badge) refs.badge.textContent = `${interactions} interaction${interactions === 1 ? '' : 's'}`;
    bus.emit('log', { level: 'debug', message: `playground: ${name}` });
  }

  function section(title) {
    return h('div', { class: 'pg-section' }, h('div', { class: 'pg-title', text: title }));
  }

  function cell(label, node) {
    return h('div', { class: 'pg-cell' },
      label ? h('span', { class: 'pg-label', text: label }) : null,
      node);
  }

  function wireSlider(input, valueEl, suffix) {
    const update = () => {
      const min = parseFloat(input.min || '0');
      const max = parseFloat(input.max || '100');
      const v = parseFloat(input.value);
      input.style.setProperty('--val', `${((v - min) / (max - min)) * 100}%`);
      if (valueEl) valueEl.textContent = `${v}${suffix || ''}`;
    };
    input.addEventListener('input', () => { update(); interact(`slider ${input.id || ''} → ${input.value}`); });
    update();
  }

  function toggle(initial, onChange) {
    const el = h('button', { class: 'toggle' + (initial ? ' on' : ''), role: 'switch', 'aria-checked': String(!!initial) });
    el.addEventListener('click', () => {
      const on = el.classList.toggle('on');
      el.setAttribute('aria-checked', String(on));
      interact(`toggle → ${on ? 'on' : 'off'}`);
      if (onChange) onChange(on);
    });
    return el;
  }

  /* --------------------------------------------------------- form controls */

  function buildFormControls() {
    const wrap = h('div', { class: 'pg-grid cols-3' });

    const text = h('input', { class: 'input', placeholder: 'Type something…', id: 'pg-text' });
    text.addEventListener('input', () => interact(`text input: ${text.value.slice(0, 24)}`));

    const searchWrap = h('div', { class: 'search-bar' },
      h('span', { class: 'input-icon', html: icon('search', 16) }),
      h('input', { class: 'input', placeholder: 'Search components…', id: 'pg-search' }),
      h('button', { class: 'clear-btn', html: icon('x', 12), 'data-tip': 'Clear search' }),
    );
    const searchInput = searchWrap.querySelector('input');
    const clearBtn = searchWrap.querySelector('.clear-btn');
    searchInput.addEventListener('input', () => {
      searchWrap.classList.toggle('has-value', !!searchInput.value);
      interact(`search: ${searchInput.value.slice(0, 24)}`);
    });
    clearBtn.addEventListener('click', () => { searchInput.value = ''; searchWrap.classList.remove('has-value'); searchInput.focus(); });

    const number = h('input', { class: 'input mono', type: 'number', value: '42', min: '0', max: '100', id: 'pg-number' });
    number.addEventListener('input', () => interact(`number → ${number.value}`));

    const select = h('select', { class: 'select', id: 'pg-select' },
      h('option', { value: 'breathe' }, 'Breathe'),
      h('option', { value: 'orbit' }, 'Orbit'),
      h('option', { value: 'morph' }, 'Morph'),
      h('option', { value: 'wave' }, 'Wave'),
    );
    select.addEventListener('change', () => interact(`select → ${select.value}`));

    const textarea = h('textarea', { class: 'textarea', placeholder: 'Multi-line input…', id: 'pg-textarea' });
    textarea.addEventListener('input', () => interact(`textarea: ${textarea.value.length} chars`));

    const color = h('div', { class: 'color-field' },
      h('input', { type: 'color', value: '#22d3ee', id: 'pg-color', 'data-tip': 'Pick a color' }),
      h('span', { class: 'mono', style: 'font-size:.74rem;color:var(--text-3)', id: 'pg-color-value', text: '#22d3ee' }),
    );
    color.querySelector('input').addEventListener('input', e => {
      color.querySelector('#pg-color-value').textContent = e.target.value;
      interact(`color → ${e.target.value}`);
    });

    const withIcon = h('div', { class: 'input-wrap' },
      h('span', { class: 'input-icon', html: icon('key', 16) }),
      h('input', { class: 'input', type: 'password', placeholder: 'Secret value', id: 'pg-password' }),
      h('button', { class: 'btn btn-sm input-action', id: 'pg-reveal', html: icon('eye', 14), 'data-tip': 'Show / hide' }),
    );
    withIcon.querySelector('#pg-reveal').addEventListener('click', () => {
      const input = withIcon.querySelector('input');
      input.type = input.type === 'password' ? 'text' : 'password';
      interact(`password visibility → ${input.type}`);
    });

    const disabled = h('input', { class: 'input', placeholder: 'Disabled input', disabled: 'true' });

    wrap.append(
      cell('Text input', text),
      cell('Search bar', searchWrap),
      cell('Number input', number),
      cell('Dropdown', select),
      cell('Textarea', textarea),
      cell('Color picker', color),
      cell('Input with icon + action', withIcon),
      cell('Disabled', disabled),
      cell('Read-only', h('input', { class: 'input', value: 'read-only value', readonly: 'true' })),
    );
    return wrap;
  }

  /* -------------------------------------------------------------- sliders */

  function buildSliders() {
    const wrap = h('div', { class: 'pg-grid cols-3' });

    const s1 = h('div', { class: 'slider' }, h('input', { type: 'range', min: '0', max: '100', value: '45', id: 'pg-slider-1' }), h('span', { class: 'slider-value', id: 'pg-slider-1-val', text: '45' }));
    const s2 = h('div', { class: 'slider' }, h('input', { type: 'range', min: '0', max: '100', value: '72', id: 'pg-slider-2' }), h('span', { class: 'slider-value', id: 'pg-slider-2-val', text: '72' }));
    const s3 = h('div', { class: 'slider' }, h('input', { type: 'range', min: '0', max: '100', value: '18', id: 'pg-slider-3' }), h('span', { class: 'slider-value', id: 'pg-slider-3-val', text: '18' }));

    const vertical = h('div', { class: 'row', style: 'gap:22px;justify-content:center,align-items:flex-start' });
    for (let i = 0; i < 3; i++) {
      const vs = h('div', { class: 'slider vertical' }, h('input', { type: 'range', min: '0', max: '100', value: String(30 + i * 20), id: `pg-vslider-${i}` }), h('span', { class: 'slider-value', id: `pg-vslider-${i}-val`, text: String(30 + i * 20) }));
      vertical.appendChild(cell('', vs));
    }

    const dual = h('div', { class: 'dual-range', style: 'margin-top:16px' },
      h('input', { type: 'range', min: '0', max: '100', value: '25', id: 'pg-dual-min', 'data-tip': 'Lower bound' }),
      h('input', { type: 'range', min: '0', max: '100', value: '75', id: 'pg-dual-max', 'data-tip': 'Upper bound' }),
      h('div', { class: 'dual-fill' }),
    );
    const dualLabel = h('div', { class: 'row between center', style: 'margin-top:6px' },
      h('span', { class: 'mono', style: 'font-size:.72rem;color:var(--text-3)', id: 'pg-dual-label', text: '25 – 75' }),
      h('span', { class: 'badge', text: 'range selector' }),
    );

    wrap.append(
      cell('Slider — default', s1),
      cell('Slider — with value', s2),
      cell('Slider — low value', s3),
      cell('Vertical sliders', vertical),
      h('div', { class: 'pg-cell', style: 'grid-column: span 2' }, h('span', { class: 'pg-label', text: 'Dual range selector' }), dual, dualLabel),
    );

    [s1, s2, s3].forEach(root => {
      const input = root.querySelector('input');
      const val = root.querySelector('.slider-value');
      wireSlider(input, val, '');
    });
    $$('.slider.vertical', wrap).forEach(root => {
      const input = root.querySelector('input');
      const val = root.querySelector('.slider-value');
      wireSlider(input, val, '');
    });

    const minEl = dual.querySelector('#pg-dual-min');
    const maxEl = dual.querySelector('#pg-dual-max');
    const fill = dual.querySelector('.dual-fill');
    const label = dualLabel.querySelector('#pg-dual-label');
    const updateDual = () => {
      let min = parseInt(minEl.value, 10);
      let max = parseInt(maxEl.value, 10);
      if (min > max) [min, max] = [max, min];
      fill.style.left = `${min}%`;
      fill.style.width = `${max - min}%`;
      label.textContent = `${min} – ${max}`;
      wireSlider(minEl);
      wireSlider(maxEl);
    };
    [minEl, maxEl].forEach(el => el.addEventListener('input', () => { updateDual(); interact('dual range adjusted'); }));
    updateDual();

    return wrap;
  }

  /* ------------------------------------------------------------ selection */

  function buildSelection() {
    const wrap = h('div', { class: 'pg-grid cols-4' });

    const toggles = h('div', { class: 'col', style: 'gap:12px;align-items:flex-start' },
      h('div', { class: 'row center', style: 'gap:10px' }, toggle(true), h('span', { class: 'muted', style: 'font-size:.76rem' }, 'On')),
      h('div', { class: 'row center', style: 'gap:10px' }, toggle(false), h('span', { class: 'muted', style: 'font-size:.76rem' }, 'Off')),
      h('div', { class: 'row center', style: 'gap:10px' }, (() => { const t = toggle(true); t.style.transform = 'scale(.86)'; return t; })(), h('span', { class: 'muted', style: 'font-size:.76rem' }, 'Small')),
      h('div', { class: 'row center', style: 'gap:10px' }, (() => { const t = toggle(false); t.classList.add('sm'); return t; })(), h('span', { class: 'muted', style: 'font-size:.76rem' }, 'Small off')),
    );

    const checks = h('div', { class: 'col', style: 'gap:11px;align-items:flex-start' },
      checkbox('Checked by default', true),
      checkbox('Unchecked option', false),
      h('label', { class: 'checkbox', style: 'opacity:.5' }, h('input', { type: 'checkbox', disabled: 'true' }), h('span', { class: 'box', html: icon('check', 12) }), 'Disabled'),
    );

    const radios = h('div', { class: 'col', style: 'gap:11px;align-items:flex-start' },
      radio('Stable channel', 'channel', true),
      radio('Beta channel', 'channel', false),
      radio('Nightly channel', 'channel', false),
    );

    const segmented = h('div', { class: 'col', style: 'gap:10px;align-items:flex-start' },
      h('div', { class: 'segmented', id: 'pg-segmented' },
        h('button', { class: 'active', 'data-seg': 'day', html: `${icon('sun', 13)} Day` }),
        h('button', { class: '', 'data-seg': 'week', html: `${icon('calendar', 13)} Week` }),
        h('button', { class: '', 'data-seg': 'month', html: `${icon('layers', 13)} Month` }),
      ),
      h('span', { class: 'mono', style: 'font-size:.7rem;color:var(--text-3)', id: 'pg-segmented-val', text: 'day' }),
    );

    wrap.append(
      cell('Toggle switches', toggles),
      cell('Checkboxes', checks),
      cell('Radio buttons', radios),
      cell('Segmented control', segmented),
    );

    segmented.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        segmented.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $('#pg-segmented-val').textContent = btn.dataset.seg;
        interact(`segmented → ${btn.dataset.seg}`);
      });
    });

    return wrap;
  }

  function checkbox(label, initial) {
    const el = h('label', { class: 'checkbox' },
      h('input', { type: 'checkbox', ...(initial ? { checked: 'true' } : {}) }),
      h('span', { class: 'box', html: icon('check', 12) }),
      label);
    el.querySelector('input').addEventListener('change', e => interact(`checkbox "${label}" → ${e.target.checked}`));
    return el;
  }

  function radio(label, name, initial) {
    const el = h('label', { class: 'radio' },
      h('input', { type: 'radio', name, ...(initial ? { checked: 'true' } : {}) }),
      h('span', { class: 'box' }),
      label);
    el.querySelector('input').addEventListener('change', e => { if (e.target.checked) interact(`radio "${label}" selected`); });
    return el;
  }

  /* -------------------------------------------------------------- buttons */

  function buildButtons() {
    const wrap = h('div', { class: 'pg-grid cols-3' });

    const variants = h('div', { class: 'col', style: 'gap:9px;align-items:flex-start' },
      h('div', { class: 'row wrap', style: 'gap:8px' },
        h('button', { class: 'btn btn-primary', onClick: () => interact('primary button') }, 'Primary'),
        h('button', { class: 'btn', onClick: () => interact('default button') }, 'Default'),
        h('button', { class: 'btn btn-ghost', onClick: () => interact('ghost button') }, 'Ghost'),
      ),
      h('div', { class: 'row wrap', style: 'gap:8px' },
        h('button', { class: 'btn btn-outline', onClick: () => interact('outline button') }, 'Outline'),
        h('button', { class: 'btn btn-danger', onClick: () => interact('danger button') }, 'Danger'),
        h('button', { class: 'btn btn-ok', onClick: () => interact('success button') }, 'Success'),
      ),
      h('div', { class: 'row wrap', style: 'gap:8px' },
        h('button', { class: 'btn btn-gradient-border', onClick: () => interact('gradient border button') }, 'Gradient'),
        h('button', { class: 'btn btn-primary', disabled: 'true' }, 'Disabled'),
      ),
    );

    const iconBtns = h('div', { class: 'row wrap', style: 'gap:8px' },
      iconBtn('play', 'Play'),
      iconBtn('pause', 'Pause'),
      iconBtn('copy', 'Copy'),
      iconBtn('trash', 'Delete'),
      iconBtn('settings', 'Settings'),
      iconBtn('zap', 'Boost', true),
    );

    const sizes = h('div', { class: 'col', style: 'gap:9px;align-items:flex-start' },
      h('div', { class: 'row wrap', style: 'gap:8px;align-items:center' },
        h('button', { class: 'btn btn-sm', onClick: () => interact('small button') }, 'Small'),
        h('button', { class: 'btn', onClick: () => interact('medium button') }, 'Medium'),
        h('button', { class: 'btn', style: 'padding:12px 22px;font-size:.92rem', onClick: () => interact('large button') }, 'Large'),
      ),
      h('button', { class: 'btn btn-primary btn-block', onClick: () => interact('block button') }, 'Full-width button'),
      h('button', { class: 'btn btn-primary', id: 'pg-loading-btn', onClick: e => {
          const btn = e.currentTarget;
          btn.classList.add('btn-loading');
          btn.innerHTML = '<span class="btn-spinner"></span>';
          setTimeout(() => {
            btn.classList.remove('btn-loading');
            btn.textContent = 'Saved';
            interact('loading button → saved');
            setTimeout(() => { btn.textContent = 'Click to load'; }, 1600);
          }, 1400);
        } }, 'Click to load'),
    );

    wrap.append(
      cell('Variants', variants),
      cell('Icon buttons', iconBtns),
      cell('Sizes & states', sizes),
    );
    return wrap;
  }

  function iconBtn(ic, label, primary) {
    return h('button', {
      class: 'btn btn-icon' + (primary ? ' btn-primary' : ''),
      'data-tip': label,
      html: icon(ic, 15),
      onClick: () => interact(`icon button ${label}`),
    });
  }

  /* ------------------------------------------------------------- feedback */

  function buildFeedback() {
    const wrap = h('div', { class: 'pg-grid cols-3' });

    const progress = h('div', { class: 'col', style: 'gap:12px' },
      h('div', { class: 'col', style: 'gap:5px' }, h('span', { class: 'pg-label', text: 'Determinate — 64%' }), h('div', { class: 'progress' }, h('div', { class: 'fill', style: { width: '64%' } }))),
      h('div', { class: 'col', style: 'gap:5px' }, h('span', { class: 'pg-label', text: 'Animated shimmer' }), h('div', { class: 'progress lg' }, h('div', { class: 'fill', id: 'pg-progress-anim', style: { width: '30%' } }))),
      h('div', { class: 'col', style: 'gap:5px' }, h('span', { class: 'pg-label', text: 'Indeterminate' }), h('div', { class: 'progress indeterminate' }, h('div', { class: 'fill' }))),
      h('div', { class: 'row center', style: 'gap:8px' },
        h('button', { class: 'btn btn-sm', onClick: () => {
            const fill = $('#pg-progress-anim');
            fill.style.width = '0%';
            requestAnimationFrame(() => { fill.style.width = `${20 + Math.random() * 80}%`; });
            interact('progress animated');
          } }, 'Randomize'),
        h('span', { class: 'mono muted', style: 'font-size:.68rem' }, 'click to advance'),
      ),
    );

    const badges = h('div', { class: 'col', style: 'gap:10px;align-items:flex-start' },
      h('div', { class: 'row wrap', style: 'gap:7px' },
        h('span', { class: 'badge ok' }, 'Stable'),
        h('span', { class: 'badge warn' }, 'Beta'),
        h('span', { class: 'badge err' }, 'Failed'),
        h('span', { class: 'badge acc' }, 'Premium'),
        h('span', { class: 'badge' }, 'Default'),
      ),
      h('div', { class: 'row wrap', style: 'gap:7px' },
        h('span', { class: 'badge ok' }, h('span', { class: 'dot' }), 'Running'),
        h('span', { class: 'badge warn' }, h('span', { class: 'dot' }), 'Degraded'),
        h('span', { class: 'badge err' }, h('span', { class: 'dot' }), 'Offline'),
      ),
    );

    const skeletons = h('div', { class: 'col', style: 'gap:9px' },
      h('div', { class: 'row center', style: 'gap:11px' },
        h('div', { class: 'skeleton', style: 'width:44px;height:44px;border-radius:12px' }),
        h('div', { class: 'col grow', style: 'gap:7px' },
          h('div', { class: 'skeleton', style: 'width:62%;height:11px' }),
          h('div', { class: 'skeleton', style: 'width:40%;height:9px' }),
        ),
      ),
      h('div', { class: 'skeleton', style: 'width:100%;height:52px' }),
      h('span', { class: 'muted', style: 'font-size:.68rem' }, 'Skeleton loading placeholder'),
    );

    const notify = h('div', { class: 'col', style: 'gap:8px;align-items:flex-start' },
      h('div', { class: 'row wrap', style: 'gap:7px' },
        h('button', { class: 'btn btn-sm', onClick: () => { toast({ type: 'info', title: 'Information', message: 'Something worth knowing.' }); interact('toast info'); } }, 'Info'),
        h('button', { class: 'btn btn-sm btn-ok', onClick: () => { toast({ type: 'success', title: 'Success', message: 'The operation completed.' }); interact('toast success'); } }, 'Success'),
        h('button', { class: 'btn btn-sm', onClick: () => { toast({ type: 'warn', title: 'Warning', message: 'Proceed with care.' }); interact('toast warn'); } }, 'Warn'),
        h('button', { class: 'btn btn-sm btn-danger', onClick: () => { toast({ type: 'error', title: 'Error', message: 'Something went wrong.' }); interact('toast error'); } }, 'Error'),
      ),
      h('button', { class: 'btn btn-sm btn-ghost', onClick: () => { P.dom.notify('Native notification', 'Sent through the operating system.'); interact('native notification'); } }, 'Native OS notification'),
    );

    const tooltips = h('div', { class: 'col', style: 'gap:10px;align-items:flex-start' },
      h('div', { class: 'row wrap', style: 'gap:8px' },
        h('button', { class: 'btn btn-sm', 'data-tip': 'Tooltip above the element', 'data-tip-pos': 'top', onClick: () => interact('tooltip top') }, 'Top'),
        h('button', { class: 'btn btn-sm', 'data-tip': 'Tooltip below the element', 'data-tip-pos': 'bottom', onClick: () => interact('tooltip bottom') }, 'Bottom'),
        h('button', { class: 'btn btn-sm', 'data-tip': 'Tooltip on the left side', 'data-tip-pos': 'left', onClick: () => interact('tooltip left') }, 'Left'),
        h('button', { class: 'btn btn-sm', 'data-tip': 'Tooltip on the right side', 'data-tip-pos': 'right', onClick: () => interact('tooltip right') }, 'Right'),
      ),
      h('span', { class: 'muted', style: 'font-size:.7rem' }, 'Hover any button to see a positioned tooltip.'),
    );

    wrap.append(
      cell('Progress bars', progress),
      cell('Badges & status', badges),
      cell('Skeletons', skeletons),
      cell('Notifications', notify),
      cell('Tooltips', tooltips),
      cell('Spinners', h('div', { class: 'row center', style: 'gap:22px;padding:8px 0' },
        h('div', { class: 'loader-ring' }),
        h('div', { class: 'loader-dual' }),
        h('div', { class: 'loader-dots' }, h('span'), h('span'), h('span')),
      )),
    );
    return wrap;
  }

  /* ------------------------------------------------------------ navigation */

  function buildNavigation() {
    const wrap = h('div', { class: 'pg-grid cols-3' });

    // mini tabs
    const panes = {
      one: h('div', { class: 'muted', style: 'font-size:.78rem' }, 'First pane — rendered on demand.'),
      two: h('div', { class: 'muted', style: 'font-size:.78rem' }, 'Second pane — the tab state is fully interactive.'),
      three: h('div', { class: 'muted', style: 'font-size:.78rem' }, 'Third pane — add as many as you need.'),
    };
    const miniSeg = h('div', { class: 'segmented', id: 'pg-minitabs' },
      h('button', { class: 'active', 'data-pane': 'one' }, 'One'),
      h('button', { 'data-pane': 'two' }, 'Two'),
      h('button', { 'data-pane': 'three' }, 'Three'),
    );
    const miniBody = h('div', { id: 'pg-minitab-body' }, panes.one);
    const miniTabs = h('div', { class: 'col', style: 'gap:9px' }, miniSeg, miniBody);
    miniSeg.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        miniSeg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        clear(miniBody);
        miniBody.appendChild(panes[btn.dataset.pane]);
        interact(`mini tabs → ${btn.dataset.pane}`);
      });
    });

    // accordion
    const accordion = h('div', { class: 'accordion', id: 'pg-accordion' });
    [['What is SE-MENU?', 'A testing console: network probes, system telemetry, timers, animation previews and developer diagnostics in one glass surface.'],
     ['Are the measurements real?', 'Yes. Ping, throughput, DNS, traceroute, CPU, memory and disk data are read from the operating system — nothing is simulated.'],
     ['How do I add my own tab?', 'Call SE-MENU.app.registerTab({ id, title, icon, mount }) from any module. The sidebar and routing are handled for you.']]
      .forEach(([q, a], i) => {
        const item = h('div', { class: 'acc-item' },
          h('button', { class: 'acc-head', onClick: () => { item.classList.toggle('open'); interact(`accordion "${q}" ${item.classList.contains('open') ? 'opened' : 'closed'}`); } },
            h('span', { html: icon('chevron-right', 15), class: 'chev' }),
            q,
          ),
          h('div', { class: 'acc-body' }, h('div', { class: 'acc-body-inner', text: a })),
        );
        accordion.appendChild(item);
      });

    // stepper + pagination
    const stepper = h('div', { class: 'col', style: 'gap:10px;align-items:flex-start' },
      h('div', { class: 'stepper' },
        h('button', { html: icon('minus', 14), 'data-tip': 'Decrease', onClick: () => step(-1) }),
        h('div', { class: 'step-val', id: 'pg-stepper-val', text: '3' }),
        h('button', { html: icon('chevron-right', 14), 'data-tip': 'Increase', onClick: () => step(1) }),
      ),
      h('div', { class: 'pagination', id: 'pg-pagination' },
        h('button', { 'data-tip': 'Previous page', onClick: () => page(currentPage - 1) }, '‹'),
        h('button', { class: 'active', 'data-page': '1', onClick: () => page(1) }, '1'),
        h('button', { 'data-page': '2', onClick: () => page(2) }, '2'),
        h('button', { 'data-page': '3', onClick: () => page(3) }, '3'),
        h('button', { 'data-page': '4', onClick: () => page(4) }, '4'),
        h('button', { 'data-tip': 'Next page', onClick: () => page(currentPage + 1) }, '›'),
      ),
      h('span', { class: 'mono muted', style: 'font-size:.68rem', id: 'pg-page-label', text: 'Page 1 of 4' }),
    );
    let stepVal = 3;
    function step(delta) {
      stepVal = Math.max(0, Math.min(99, stepVal + delta));
      $('#pg-stepper-val').textContent = String(stepVal);
      interact(`stepper → ${stepVal}`);
    }
    let currentPage = 1;
    function page(n) {
      currentPage = Math.max(1, Math.min(4, n));
      $$('#pg-pagination button[data-page]').forEach(b => b.classList.toggle('active', parseInt(b.dataset.page, 10) === currentPage));
      $('#pg-page-label').textContent = `Page ${currentPage} of 4`;
      interact(`pagination → page ${currentPage}`);
    }

    // timeline + rating
    const timeline = h('div', { class: 'timeline' },
      h('div', { class: 'tl-item' }, h('div', { class: 'tl-title', text: 'Component mounted' }), h('div', { class: 'tl-sub', text: 'on demand · state ready' })),
      h('div', { class: 'tl-item' }, h('div', { class: 'tl-title', text: 'Interaction recorded' }), h('div', { class: 'tl-sub', text: `${interactions} so far` })),
      h('div', { class: 'tl-item' }, h('div', { class: 'tl-title', text: 'Live preview' }), h('div', { class: 'tl-sub', text: 'every control responds' })),
    );

    const rating = h('div', { class: 'col', style: 'gap:8px;align-items:flex-start' },
      h('div', { class: 'rating', id: 'pg-rating' },
        [1, 2, 3, 4, 5].map(n => h('button', { 'data-star': n, html: icon('star', 22), 'data-tip': `${n} star${n > 1 ? 's' : ''}`, onClick: () => rate(n) })),
      ),
      h('span', { class: 'mono muted', style: 'font-size:.68rem', id: 'pg-rating-label', text: 'Not rated yet' }),
    );
    let ratingVal = 0;
    function rate(n) {
      ratingVal = n;
      $$('#pg-rating button').forEach(b => b.classList.toggle('lit', parseInt(b.dataset.star, 10) <= n));
      $('#pg-rating-label').textContent = `${n} / 5`;
      interact(`rating → ${n} stars`);
    }

    wrap.append(
      cell('Tabs (mini)', miniTabs),
      cell('Accordion / collapsible', accordion),
      cell('Stepper & pagination', stepper),
      cell('Timeline', timeline),
      cell('Rating', rating),
      cell('Interactive cards', buildInteractiveCards()),
    );
    return wrap;
  }

  function buildInteractiveCards() {
    const cards = h('div', { class: 'pg-grid cols-3', style: 'gap:10px' });
    const mk = (ic, title, sub) => h('div', { class: 'interactive-card', onClick: () => interact(`card "${title}"`) },
      h('div', { class: 'ic-icon', html: icon(ic, 18) }),
      h('div', { class: 'ic-title', text: title }),
      h('div', { class: 'ic-sub', text: sub }),
    );
    cards.append(
      mk('mouse', 'Hover lift', 'Cursor-aware elevation'),
      mk('bell', 'Click me', 'Increments an interaction counter'),
      mk('sparkles', 'Animated', 'Transitions on every state'),
    );
    return cards;
  }

  /* ---------------------------------------------------------- data display */

  function buildDataDisplay() {
    const wrap = h('div', { class: 'pg-grid cols-3' });

    const stats = h('div', { class: 'stat-row', style: 'grid-template-columns: repeat(3, 1fr);gap:9px' },
      statTile('Uptime', '99.98%', '+0.02%'),
      statTile('Requests', '1.2M', '+12.4%'),
      statTile('Errors', '0.02%', '-0.01%'),
    );

    // sortable table
    const rows = [
      { name: 'ping-01', region: 'fra', latency: 18, status: 'ok' },
      { name: 'ping-02', region: 'iad', latency: 42, status: 'ok' },
      { name: 'ping-03', region: 'sin', latency: 87, status: 'warn' },
      { name: 'ping-04', region: 'syd', latency: 121, status: 'err' },
      { name: 'ping-05', region: 'gru', latency: 64, status: 'ok' },
    ];
    let sortKey = 'latency';
    let sortDir = 1;
    const table = h('table', { class: 'table', style: 'table-layout:fixed' },
      h('thead', {}, h('tr', {},
        h('th', { text: 'Node', style: 'cursor:pointer', onClick: () => sort('name') }),
        h('th', { text: 'Region', style: 'cursor:pointer', onClick: () => sort('region') }),
        h('th', { text: 'Latency', style: 'cursor:pointer;text-align:right', onClick: () => sort('latency') }),
        h('th', { text: 'Status', style: 'cursor:pointer', onClick: () => sort('status') }),
      )),
      h('tbody', { id: 'pg-table-body' }),
    );
    const renderRows = () => {
      const body = table.querySelector('#pg-table-body');
      clear(body);
      const sorted = rows.slice().sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * sortDir;
      });
      for (const r of sorted) {
        const badge = r.status === 'ok' ? 'ok' : r.status === 'warn' ? 'warn' : 'err';
        body.appendChild(h('tr', {},
          h('td', { text: r.name }),
          h('td', { text: r.region }),
          h('td', { class: 'num', text: `${r.latency} ms` }),
          h('td', {}, h('span', { class: `badge ${badge}`, text: r.status })),
        ));
      }
    };
    function sort(key) {
      if (sortKey === key) sortDir *= -1;
      else { sortKey = key; sortDir = 1; }
      renderRows();
      interact(`table sorted by ${key} ${sortDir > 0 ? 'asc' : 'desc'}`);
    }
    renderRows();

    const kv = h('div', { class: 'subpanel' },
      h('div', { class: 'subpanel-title', text: 'Key / value' }),
      h('dl', { class: 'kv' },
        h('dt', { text: 'Session id' }), h('dd', { text: P.dom.uid() }),
        h('dt', { text: 'DPR' }), h('dd', { text: String(window.devicePixelRatio || 1) }),
        h('dt', { text: 'Viewport' }), h('dd', { text: `${window.innerWidth}×${window.innerHeight}` }),
        h('dt', { text: 'Cores' }), h('dd', { text: String(navigator.hardwareConcurrency || '—') }),
      ),
    );

    wrap.append(
      cell('Stat tiles', stats),
      cell('Sortable table', table),
      cell('Metadata', kv),
    );
    return wrap;
  }

  function statTile(label, value, delta) {
    const up = delta && delta.startsWith('+');
    const down = delta && delta.startsWith('-');
    return h('div', { class: 'stat' },
      h('div', { class: 'stat-label', text: label }),
      h('div', { class: 'stat-value', text: value }),
      h('div', { class: `stat-delta ${up ? 'up' : down ? 'down' : 'neutral'}`, text: delta || '—' }),
    );
  }

  /* --------------------------------------------------------------- init */

  M.playground = {
    init(root) {
      refs = { body: $('#playground-body', root), badge: $('#pg-badge', root) };
      const body = refs.body;
      body.innerHTML = '';

      body.appendChild(section('Form controls'));
      body.appendChild(buildFormControls());

      body.appendChild(section('Sliders & ranges'));
      body.appendChild(buildSliders());

      body.appendChild(section('Selection controls'));
      body.appendChild(buildSelection());

      body.appendChild(section('Buttons'));
      body.appendChild(buildButtons());

      body.appendChild(section('Feedback & status'));
      body.appendChild(buildFeedback());

      body.appendChild(section('Navigation & disclosure'));
      body.appendChild(buildNavigation());

      body.appendChild(section('Data display'));
      body.appendChild(buildDataDisplay());

      attachRipple($('#pg-loading-btn', body));
      bus.emit('log', { level: 'info', message: 'component playground initialized' });
    },

    destroy() {
      refs = null;
    },
  };
})(window.SEMENU);
