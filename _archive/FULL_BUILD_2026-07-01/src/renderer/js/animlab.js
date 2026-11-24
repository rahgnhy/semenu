/* ============================================================================
   animlab.js — Animation Lab: live preview stage, loader gallery, motion
   demos and an animated chart. Speed/intensity are user-controlled.
   ========================================================================== */
(function (P) {
  'use strict';

  const M = (P.modules = P.modules || {});
  const { h, $, $$, bus, icon, attachRipple, clamp } = P.dom;

  let refs = null;
  let chart = null;
  let chartTimer = null;
  let chartValue = 42;
  let unsubVis = null;

  const LOADERS = [
    ['loader-ring', 'Ring'],
    ['loader-dual', 'Dual ring'],
    ['loader-dots', 'Bouncing dots'],
    ['loader-bars', 'Equalizer'],
    ['loader-orbit', 'Orbit'],
    ['loader-ripple', 'Ripple'],
    ['loader-blur', 'Blur se-menu'],
    ['loader-gradient', 'Gradient bar'],
  ];

  const TYPES = ['se-menu', 'bounce', 'spin', 'swing', 'jelly', 'morph', 'wave', 'orbit'];

  function applyShape() {
    if (!refs) return;
    refs.obj.className = `anim-obj ${refs.shape.value} anim-type-${refs.type.value}`;
  }

  function applySpeed() {
    if (!refs) return;
    const v = parseFloat(refs.speed.value);
    refs.stage.style.setProperty('--anim-speed', String(v));
    refs.speedVal.textContent = `${v.toFixed(2)}×`;
  }

  function applyIntensity() {
    if (!refs) return;
    const v = parseFloat(refs.intensity.value);
    refs.stage.style.setProperty('--anim-intensity', String(v));
    refs.intensityVal.textContent = `${v.toFixed(2)}×`;
  }

  function play() {
    if (!refs) return;
    refs.stage.classList.add('anim-playing');
    refs.badge.textContent = 'Playing';
    refs.badge.className = 'badge ok';
    refs.play.innerHTML = `${icon('pause', 15)} Pause`;
    bus.emit('log', { level: 'info', message: `animation playing: ${refs.type.value}` });
  }

  function stop() {
    if (!refs) return;
    refs.stage.classList.remove('anim-playing');
    refs.badge.textContent = 'Stopped';
    refs.badge.className = 'badge';
    refs.play.innerHTML = `${icon('play', 15)} Play`;
  }

  function pushChart() {
    if (!chart) return;
    chartValue += (Math.random() - 0.5) * 16;
    chartValue = clamp(chartValue, 8, 92);
    chart.push(chartValue);
  }

  M.animlab = {
    init(root) {
      refs = {
        stage: $('#anim-stage', root),
        obj: $('#anim-obj', root),
        type: $('#anim-type', root),
        shape: $('#anim-shape', root),
        speed: $('#anim-speed', root),
        speedVal: $('#anim-speed-val', root),
        intensity: $('#anim-intensity', root),
        intensityVal: $('#anim-intensity-val', root),
        play: $('#anim-play', root),
        stopBtn: $('#anim-stop', root),
        badge: $('#anim-state-badge', root),
        gallery: $('#loader-gallery', root),
        tilt: $('#demo-tilt', root),
        glow: $('#demo-glow', root),
        magnetic: $('#ab-magnetic', root),
        chartCanvas: $('#anim-chart', root),
      };

      // stage controls
      refs.type.addEventListener('change', () => { applyShape(); if (refs.stage.classList.contains('anim-playing')) { refs.stage.classList.remove('anim-playing'); void refs.stage.offsetWidth; refs.stage.classList.add('anim-playing'); } });
      refs.shape.addEventListener('change', applyShape);
      refs.speed.addEventListener('input', applySpeed);
      refs.intensity.addEventListener('input', applyIntensity);
      refs.play.addEventListener('click', () => (refs.stage.classList.contains('anim-playing') ? stop() : play()));
      refs.stopBtn.addEventListener('click', stop);
      applySpeed();
      applyIntensity();
      applyShape();

      // loader gallery
      clearGallery();
      for (const [cls, label] of LOADERS) {
        refs.gallery.appendChild(h('div', { class: 'pg-cell', style: 'display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:9px;padding:10px 4px' },
          h('div', { style: 'height:42px;display:grid;place-items:center' }, h('div', { class: cls })),
          h('span', { class: 'mono', style: 'font-size:.62rem;color:var(--text-3)', text: label }),
        ));
      }

      // 3D tilt demo
      refs.tilt.addEventListener('pointermove', e => {
        const r = refs.tilt.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        refs.tilt.style.transform = `perspective(520px) rotateX(${(-y * 14).toFixed(2)}deg) rotateY(${(x * 14).toFixed(2)}deg) translateY(-3px)`;
      });
      refs.tilt.addEventListener('pointerleave', () => { refs.tilt.style.transform = ''; });

      // glow border demo
      refs.glow.addEventListener('pointermove', e => {
        const r = refs.glow.getBoundingClientRect();
        refs.glow.style.background = `radial-gradient(220px circle at ${(e.clientX - r.left)}px ${(e.clientY - r.top)}px, rgba(129,140,248,0.18), transparent 65%)`;
      });
      refs.glow.addEventListener('pointerleave', () => { refs.glow.style.background = ''; });

      // magnetic button
      refs.magnetic.addEventListener('pointermove', e => {
        const r = refs.magnetic.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.22;
        const y = (e.clientY - r.top - r.height / 2) * 0.3;
        refs.magnetic.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      });
      refs.magnetic.addEventListener('pointerleave', () => { refs.magnetic.style.transform = ''; refs.magnetic.style.transition = 'transform .35s cubic-bezier(.34,1.56,.64,1)'; setTimeout(() => { refs.magnetic.style.transition = ''; }, 350); });

      attachRipple($('#ab-ripple', root));
      attachRipple($('#ab-shine', root));

      // animated chart preview
      chart = new P.charts.LineChart(refs.chartCanvas, { color: '#818cf8', points: 120, yMin: 0, yMax: 100, glow: 10, fillAlpha: 0.2 });
      chartTimer = setInterval(pushChart, 420);
      unsubVis = bus.on('visibility', hidden => {
        if (hidden) { clearInterval(chartTimer); chartTimer = null; }
        else if (!chartTimer) chartTimer = setInterval(pushChart, 420);
      });

      bus.emit('log', { level: 'info', message: 'animation lab initialized' });
    },

    destroy() {
      if (chartTimer) clearInterval(chartTimer);
      chartTimer = null;
      if (unsubVis) unsubVis();
      if (chart) chart.destroy();
      chart = null;
      refs = null;
    },

    state() {
      return { playing: !!(refs && refs.stage && refs.stage.classList.contains('anim-playing')) };
    },
  };

  function clearGallery() {
    if (refs && refs.gallery) refs.gallery.innerHTML = '';
  }
})(window.SEMENU);
