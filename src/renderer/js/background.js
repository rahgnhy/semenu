/* ============================================================================
   background.js — animated liquid-glass background engine.
   Six render styles on a single canvas behind the glass panels:
   liquid · dark waves · atmospheric · particles · aurora · abstract.
   ========================================================================== */
(function (SM) {
  'use strict';

  const M = (SM.modules = SM.modules || {});
  const { clamp, lerp } = SM.dom;

  const STYLES = [
    { id: 'liquid', name: 'Liquid Glass' },
    { id: 'waves', name: 'Dark Waves' },
    { id: 'atmospheric', name: 'Atmospheric' },
    { id: 'particles', name: 'Particles' },
    { id: 'aurora', name: 'Aurora' },
    { id: 'abstract', name: 'Abstract' },
  ];

  /* ---------------------------------------------------- sprite factory */

  const SPRITES = {};

  function makeSprite(key, size, painter) {
    if (SPRITES[key]) return SPRITES[key];
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    painter(ctx, size);
    SPRITES[key] = c;
    return c;
  }

  function blobSprite(key, inner, outer) {
    return makeSprite(key, 512, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, inner);
      g.addColorStop(0.45, outer);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
  }

  function fogSprite(key, tint) {
    return makeSprite(key, 512, (ctx, s) => {
      for (let i = 0; i < 5; i++) {
        const r = s * (0.22 + i * 0.06);
        const ox = Math.cos(i * 1.9) * s * 0.12;
        const oy = Math.sin(i * 2.3) * s * 0.1;
        const g = ctx.createRadialGradient(s / 2 + ox, s / 2 + oy, 0, s / 2 + ox, s / 2 + oy, r);
        g.addColorStop(0, `rgba(${tint},${0.10 + i * 0.02})`);
        g.addColorStop(1, `rgba(${tint},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
      }
    });
  }

  function bandSprite(key, tint) {
    return makeSprite(key, 256, (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, `rgba(${tint},0)`);
      g.addColorStop(0.35, `rgba(${tint},0.55)`);
      g.addColorStop(0.65, `rgba(${tint},0.55)`);
      g.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      // soften the horizontal edges
      const side = ctx.createLinearGradient(0, 0, s, 0);
      side.addColorStop(0, 'rgba(0,0,0,1)');
      side.addColorStop(0.5, 'rgba(0,0,0,0)');
      side.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = side;
      ctx.fillRect(0, 0, s, s);
      ctx.globalCompositeOperation = 'source-over';
    });
  }

  function ringSprite(key, tint) {
    return makeSprite(key, 256, (ctx, s) => {
      ctx.strokeStyle = `rgba(${tint},0.5)`;
      ctx.lineWidth = s * 0.02;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${tint},0.18)`;
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.26, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  function rectSprite(key, tint) {
    return makeSprite(key, 256, (ctx, s) => {
      ctx.strokeStyle = `rgba(${tint},0.45)`;
      ctx.lineWidth = s * 0.016;
      const r = s * 0.2;
      const m = s * 0.24;
      ctx.beginPath();
      ctx.roundRect(m, m, s - m * 2, s - m * 2, r);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${tint},0.16)`;
      ctx.lineWidth = s * 0.04;
      ctx.beginPath();
      ctx.roundRect(m * 1.5, m * 1.5, s - m * 3, s - m * 3, r * 0.8);
      ctx.stroke();
    });
  }

  function sprite(name) {
    switch (name) {
      case 'silver': return blobSprite('b_silver', 'rgba(226,232,240,0.85)', 'rgba(148,163,184,0.28)');
      case 'violet': return blobSprite('b_violet', 'rgba(167,139,250,0.75)', 'rgba(139,124,246,0.22)');
      case 'steel': return blobSprite('b_steel', 'rgba(125,150,178,0.6)', 'rgba(90,110,135,0.18)');
      case 'fogA': return fogSprite('f_a', '190,198,212');
      case 'fogB': return fogSprite('f_b', '150,140,190');
      case 'bandViolet': return bandSprite('bd_v', '150,132,220');
      case 'bandSilver': return bandSprite('bd_s', '200,208,220');
      case 'bandSteel': return bandSprite('bd_t', '140,165,195');
      case 'ring': return ringSprite('rg', '210,216,226');
      case 'rect': return rectSprite('rc', '200,206,216');
      default: return blobSprite('b_default', 'rgba(200,205,215,0.6)', 'rgba(120,130,150,0.2)');
    }
  }

  /* --------------------------------------------------------- style render */

  function drawStyle(ctx, w, h, t, opts) {
    const { style, intensity, quality } = opts;
    ctx.clearRect(0, 0, w, h);
    const k = clamp(intensity == null ? 0.8 : intensity, 0, 1.6);

    switch (style) {
      case 'liquid': {
        ctx.globalCompositeOperation = 'lighter';
        const blobs = [
          ['silver', 0.30, 0.30, 0.95, 0.5],
          ['violet', 0.72, 0.26, 0.80, 0.38],
          ['steel', 0.55, 0.78, 1.00, 0.30],
          ['violet', 0.18, 0.80, 0.62, 0.26],
        ];
        for (let i = 0; i < blobs.length; i++) {
          const [sp, bx, by, sc, al] = blobs[i];
          const x = w * (bx + 0.16 * Math.sin(t * 0.23 + i * 1.7));
          const y = h * (by + 0.14 * Math.cos(t * 0.19 + i * 2.2));
          const s = Math.max(w, h) * sc * (0.75 + 0.2 * Math.sin(t * 0.15 + i));
          ctx.globalAlpha = al * k;
          ctx.drawImage(sprite(sp), x - s / 2, y - s / 2, s, s);
          // tighter, brighter core for a marbled highlight
          const cs = s * 0.48;
          ctx.globalAlpha = Math.min(1, al * 1.25 * k);
          ctx.drawImage(sprite(sp), x - cs / 2, y - cs / 2, cs, cs);
        }
        // drifting specular streaks
        ctx.globalAlpha = 0.09 * k;
        for (let i = 0; i < 2; i++) {
          const sx = w * (0.5 + 0.35 * Math.sin(t * 0.11 + i * 2.4));
          const sy = h * (0.5 + 0.3 * Math.cos(t * 0.09 + i * 1.6));
          const len = Math.max(w, h) * 0.9;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(-0.5 + 0.2 * Math.sin(t * 0.07 + i));
          const g = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
          g.addColorStop(0, 'rgba(255,255,255,0)');
          g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(-len / 2, -h * 0.012, len, h * 0.024);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        break;
      }

      case 'waves': {
        const layers = [
          { base: 0.42, amp: 26, freq: 0.006, speed: 0.32, alpha: 0.16, tint: '190,198,212' },
          { base: 0.60, amp: 34, freq: 0.004, speed: -0.22, alpha: 0.13, tint: '150,140,190' },
          { base: 0.80, amp: 44, freq: 0.008, speed: 0.16, alpha: 0.11, tint: '120,140,168' },
        ];
        for (let l = 0; l < layers.length; l++) {
          const L = layers[l];
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 8) {
            const y = h * L.base
              + Math.sin(x * L.freq + t * L.speed + l * 1.9) * L.amp
              + Math.sin(x * L.freq * 2.3 - t * L.speed * 0.7 + l) * L.amp * 0.35;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          const g = ctx.createLinearGradient(0, h * (L.base - 0.2), 0, h);
          g.addColorStop(0, `rgba(${L.tint},0)`);
          g.addColorStop(0.5, `rgba(${L.tint},${L.alpha * k})`);
          g.addColorStop(1, `rgba(${L.tint},${L.alpha * 0.2 * k})`);
          ctx.fillStyle = g;
          ctx.fill();
        }
        break;
      }

      case 'atmospheric': {
        ctx.globalCompositeOperation = 'lighter';
        const fogs = [
          ['fogA', 0.28, 0.30, 0.9, 0.5, 0.26],
          ['fogB', 0.76, 0.62, 1.1, -0.4, 0.22],
          ['fogA', 0.55, 0.90, 0.7, 0.3, 0.20],
        ];
        for (let i = 0; i < fogs.length; i++) {
          const [sp, bx, by, sc, sp2, al] = fogs[i];
          const x = w * (bx + 0.12 * Math.sin(t * 0.12 + i * 2.1));
          const y = h * (by + 0.10 * Math.cos(t * 0.1 + i * 1.4));
          const s = Math.max(w, h) * sc;
          ctx.globalAlpha = al * k;
          ctx.drawImage(sprite(sp), x - s / 2, y - s / 2, s, s);
        }
        // ambient top-left wash
        const g = ctx.createRadialGradient(w * 0.2, h * 0.1, 0, w * 0.2, h * 0.1, Math.max(w, h) * 0.8);
        g.addColorStop(0, `rgba(200,206,218,${0.09 * k})`);
        g.addColorStop(1, 'rgba(200,206,218,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }

      case 'particles': {
        const count = quality === 'high' ? 110 : quality === 'medium' ? 70 : 36;
        const bokeh = quality === 'low' ? 2 : 5;
        ctx.globalCompositeOperation = 'lighter';
        // large out-of-focus bokeh
        for (let i = 0; i < bokeh; i++) {
          const depth = 0.5 + (i % 3) * 0.2;
          const x = w * ((i * 0.23 + 0.1) + 0.06 * Math.sin(t * 0.1 + i));
          const y = (h * (1.1 - ((t * 0.02 * depth + i * 0.3) % 1.2)));
          const r = (26 + i * 9) * (w / 900);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(210,216,226,${0.09 * k})`);
          g.addColorStop(1, 'rgba(210,216,226,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < count; i++) {
          const seed = i * 12.9898;
          const depth = 0.3 + ((i * 7) % 10) / 12;
          const speed = 0.008 + depth * 0.02;
          const x = w * (((Math.sin(seed) * 0.5 + 0.5) + 0.04 * Math.sin(t * (0.3 + depth * 0.4) + i)) % 1);
          const y = h * (1.05 - ((t * speed + i * 0.137) % 1.15));
          const size = depth * 2.1;
          const tw = 0.45 + 0.55 * Math.sin(t * (1 + depth) + i * 1.7);
          const tint = i % 5 === 0 ? '167,139,250' : '214,220,229';
          ctx.globalAlpha = clamp(depth * 0.7 * tw * k, 0, 1);
          ctx.fillStyle = `rgba(${tint},1)`;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        break;
      }

      case 'aurora': {
        const bands = quality === 'high'
          ? [['bandViolet', 0.18, 0.9, 0.5], ['bandSilver', 0.42, 1.1, 0.4], ['bandSteel', 0.66, 0.95, 0.45], ['bandViolet', 0.88, 1.2, 0.35]]
          : quality === 'medium'
            ? [['bandViolet', 0.22, 1.0, 0.5], ['bandSilver', 0.55, 1.2, 0.4], ['bandSteel', 0.85, 1.0, 0.4]]
            : [['bandViolet', 0.25, 1.0, 0.5], ['bandSilver', 0.7, 1.2, 0.4]];
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < bands.length; i++) {
          const [sp, bx, sc, al] = bands[i];
          const bw = w * 0.22 * sc;
          const x = w * (bx + 0.06 * Math.sin(t * 0.13 + i * 1.4)) - bw / 2;
          const skew = 0.12 * Math.sin(t * 0.09 + i * 2.0);
          ctx.save();
          ctx.transform(1, 0, skew, 1, 0, 0);
          ctx.globalAlpha = al * 0.9 * k;
          ctx.drawImage(sprite(sp), x, -h * 0.08, bw, h * 1.16);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        break;
      }

      case 'abstract':
      default: {
        ctx.globalCompositeOperation = 'lighter';
        const shapes = [
          ['ring', 0.24, 0.32, 0.55, 0.09, 0.9],
          ['rect', 0.74, 0.28, 0.42, 0.07, 1.1],
          ['ring', 0.62, 0.78, 0.70, 0.075, 0.7],
          ['rect', 0.22, 0.80, 0.36, 0.06, 1.3],
          ['ring', 0.86, 0.66, 0.30, 0.055, 1.5],
        ];
        for (let i = 0; i < shapes.length; i++) {
          const [sp, bx, by, sc, al, rot] = shapes[i];
          const s = Math.max(w, h) * sc * 0.6;
          const x = w * (bx + 0.05 * Math.sin(t * 0.1 + i * 1.9));
          const y = h * (by + 0.05 * Math.cos(t * 0.08 + i * 1.3));
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t * 0.08 * (i % 2 ? 1 : -1) * rot);
          ctx.globalAlpha = al * k;
          ctx.drawImage(sprite(sp), -s / 2, -s / 2, s, s);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
    }
  }

  /* ------------------------------------------------------------- engine */

  class BackgroundEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.style = 'liquid';
      this.speed = 1;
      this.intensity = 0.85;
      this.blur = 0;
      this.brightness = 1;
      this.opacity = 1;
      this.quality = 'high';
      this.enabled = true;
      this.running = false;
      this.t = 0;
      this.last = 0;
      this.raf = null;
      this.dpr = 1;
      this.w = 0;
      this.h = 0;
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(canvas);
      this._offVis = SM.dom.bus.on('visibility', hidden => {
        if (hidden) this.stop();
        else if (this.enabled) this.start();
      });
      this.resize();
    }

    resize() {
      const cap = this.quality === 'high' ? 1.25 : this.quality === 'medium' ? 1 : 0.75;
      this.dpr = Math.min(cap, window.devicePixelRatio || 1);
      const w = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 800;
      const h = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 600;
      this.w = w;
      this.h = h;
      this.canvas.width = Math.max(1, Math.round(w * this.dpr));
      this.canvas.height = Math.max(1, Math.round(h * this.dpr));
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    applyCssFilters() {
      const parts = [];
      if (this.blur > 0.05 && this.quality !== 'low') parts.push(`blur(${this.blur.toFixed(1)}px)`);
      if (Math.abs(this.brightness - 1) > 0.01) parts.push(`brightness(${this.brightness.toFixed(2)})`);
      this.canvas.style.filter = parts.length ? parts.join(' ') : '';
      this.canvas.style.opacity = String(clamp(this.opacity, 0, 1));
    }

    setStyle(style) {
      this.style = STYLES.some(s => s.id === style) ? style : 'liquid';
      if (this.enabled) this.drawFrame();
    }

    setSpeed(v) { this.speed = clamp(Number(v) || 1, 0.1, 3); }
    setIntensity(v) { this.intensity = clamp(Number(v) || 0.85, 0, 1.6); this.drawFrame(); }
    setBrightness(v) { this.brightness = clamp(Number(v) || 1, 0.2, 1.4); this.applyCssFilters(); }
    setOpacity(v) { this.opacity = clamp(Number(v) || 1, 0, 1); this.applyCssFilters(); }
    setBlur(v) { this.blur = clamp(Number(v) || 0, 0, 12); this.applyCssFilters(); this.drawFrame(); }

    setQuality(q) {
      this.quality = ['low', 'medium', 'high'].includes(q) ? q : 'high';
      this.resize();
      this.applyCssFilters();
      this.drawFrame();
    }

    setEnabled(on) {
      this.enabled = !!on;
      this.canvas.style.visibility = this.enabled ? '' : 'hidden';
      if (this.enabled) { this.applyCssFilters(); this.start(); }
      else this.stop();
    }

    start() {
      if (this.running || !this.enabled) return;
      this.running = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame(n => this.loop(n));
    }

    stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
    }

    loop(now) {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt * this.speed;
      this.drawFrame();
      this.raf = requestAnimationFrame(n => this.loop(n));
    }

    drawFrame() {
      if (!this.ctx || !this.w) return;
      drawStyle(this.ctx, this.w, this.h, this.t, {
        style: this.style,
        intensity: this.intensity,
        quality: this.quality,
      });
    }

    destroy() {
      this.stop();
      if (this._offVis) this._offVis();
      if (this._ro) this._ro.disconnect();
    }
  }

  /** Static preview used by the Settings tab thumbnails. */
  function renderPreview(canvas, styleId) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 220;
    const h = canvas.clientHeight || 96;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // paint three moments so the thumbnail reads as a living animation
    drawStyle(ctx, w, h, 3.2, { style: styleId, intensity: 0.85, quality: 'medium' });
  }

  M.background = { Engine: BackgroundEngine, STYLES, renderPreview, drawStyle };
})(window.SEMENU);
