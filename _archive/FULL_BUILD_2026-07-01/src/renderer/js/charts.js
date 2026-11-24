/* ============================================================================
   charts.js — dependency-free canvas charts: LineChart, Gauge, Spark
   DPR aware, resize-observed, smoothly animated.
   ========================================================================== */
(function (P) {
  'use strict';

  const { clamp, lerp } = P.dom;

  function setupCanvas(canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const parent = canvas.parentElement;
    const w = (parent ? parent.clientWidth : canvas.clientWidth) || canvas.clientWidth || 300;
    const h = (parent ? parent.clientHeight : canvas.clientHeight) || canvas.clientHeight || 100;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function gradient(ctx, w, h, color, alpha) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, hexA(color, alpha == null ? 0.26 : alpha));
    g.addColorStop(1, hexA(color, 0));
    return g;
  }

  function hexA(hex, a) {
    if (hex.startsWith('rgba') || hex.startsWith('hsl')) return hex;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  /* ------------------------------------------------------------- line */

  class LineChart {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.opts = Object.assign({
        color: '#22d3ee',
        color2: null,
        series2: null,
        fill: true,
        fillAlpha: 0.2,
        glow: 0,
        lineWidth: 2,
        grid: true,
        gridLines: 3,
        yMin: null,
        yMax: null,
        pad: 0.14,
        points: 120,
        smooth: 0.3,
        lastDot: true,
        unit: '',
      }, opts);
      this.data = [];
      this.data2 = [];
      this.display = [];
      this.display2 = [];
      this.raf = null;
      this.destroyed = false;
      const sized = setupCanvas(canvas);
      this.ctx = sized.ctx;
      this.w = sized.w;
      this.h = sized.h;
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas.parentElement || canvas);
      this.draw();
    }

    resize() {
      const sized = setupCanvas(this.canvas);
      this.ctx = sized.ctx;
      this.w = sized.w;
      this.h = sized.h;
      this.draw();
    }

    push(v, v2) {
      if (v == null || !isFinite(v)) v = 0;
      this.data.push(v);
      if (v2 != null && isFinite(v2)) this.data2.push(v2);
      const max = this.opts.points;
      if (this.data.length > max) this.data.shift();
      if (this.data2.length > max) this.data2.shift();
      if (this.display.length >= max) this.display.shift();
      this.display.push(this.data[this.data.length - 1]);
      if (this.data2.length) {
        if (this.display2.length >= max) this.display2.shift();
        this.display2.push(this.data2[this.data2.length - 1]);
      }
      this.kick();
    }

    setSeries(arr, arr2) {
      this.data = arr.slice(-this.opts.points);
      this.display = this.data.slice();
      this.data2 = arr2 ? arr2.slice(-this.opts.points) : [];
      this.display2 = this.data2.slice();
      this.draw();
    }

    kick() {
      if (this.raf || this.destroyed) return;
      this.raf = requestAnimationFrame(() => this.step());
    }

    step() {
      this.raf = null;
      if (this.destroyed) return;
      let moving = false;
      for (let i = 0; i < this.data.length; i++) {
        const target = this.data[i];
        const cur = this.display[i];
        if (cur == null) { this.display[i] = target; continue; }
        const diff = target - cur;
        if (Math.abs(diff) > 0.001) { this.display[i] = cur + diff * 0.24; moving = true; }
        else this.display[i] = target;
      }
      for (let i = 0; i < this.data2.length; i++) {
        const target = this.data2[i];
        const cur = this.display2[i];
        if (cur == null) { this.display2[i] = target; continue; }
        const diff = target - cur;
        if (Math.abs(diff) > 0.001) { this.display2[i] = cur + diff * 0.24; moving = true; }
        else this.display2[i] = target;
      }
      this.draw();
      if (moving) this.raf = requestAnimationFrame(() => this.step());
    }

    bounds(arr) {
      const o = this.opts;
      let min = o.yMin != null ? o.yMin : Infinity;
      let max = o.yMax != null ? o.yMax : -Infinity;
      if (o.yMin == null || o.yMax == null) {
        for (const v of arr) { if (v < min) min = v; if (v > max) max = v; }
        if (!isFinite(min)) { min = 0; max = 1; }
        if (min === max) { min -= 1; max += 1; }
        const pad = (max - min) * o.pad;
        if (o.yMin == null) min -= pad;
        if (o.yMax == null) max += pad;
      }
      return [min, max];
    }

    draw() {
      const { ctx, w, h } = this;
      if (!ctx || !w || !h) return;
      const o = this.opts;
      ctx.clearRect(0, 0, w, h);
      if (this.display.length < 2) return;

      const [min, max] = this.bounds(this.display);
      const range = max - min || 1;
      const padX = 2;
      const padTop = 8;
      const padBottom = 6;
      const iw = w - padX * 2;
      const ih = h - padTop - padBottom;
      const n = this.display.length;
      const xAt = i => padX + (i / (o.points - 1)) * iw;
      const yAt = v => padTop + ih - ((v - min) / range) * ih;

      if (o.grid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= o.gridLines; i++) {
          const y = padTop + (ih / (o.gridLines + 1)) * i;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }

      const drawSeries = (arr, disp, color, fill, alpha, width, glow) => {
        if (disp.length < 2) return;
        ctx.beginPath();
        const pts = disp.map((v, i) => [xAt(i), yAt(v)]);
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          const [x0, y0] = pts[i - 1];
          const [x1, y1] = pts[i];
          const mx = (x0 + x1) / 2;
          ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
        }
        if (fill) {
          const fillPath = new Path2D();
          fillPath.moveTo(pts[0][0], h);
          for (const [x, y] of pts) fillPath.lineTo(x, y);
          fillPath.lineTo(pts[pts.length - 1][0], h);
          fillPath.closePath();
          ctx.fillStyle = gradient(ctx, w, h, color, alpha);
          ctx.fill(fillPath);
        }
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          const [x0, y0] = pts[i - 1];
          const [x1, y1] = pts[i];
          const mx = (x0 + x1) / 2;
          ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (glow) {
          ctx.shadowColor = hexA(color, 0.55);
          ctx.shadowBlur = glow;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      };

      if (this.display2.length > 1) {
        drawSeries(this.data2, this.display2, o.color2 || '#e879f9', false, 0, 1.5, 0);
      }
      drawSeries(this.data, this.display, o.color, o.fill, o.fillAlpha, o.lineWidth, o.glow);

      if (o.lastDot && this.display.length) {
        const lx = xAt(this.display.length - 1);
        const ly = yAt(this.display[this.display.length - 1]);
        ctx.beginPath();
        ctx.arc(lx, ly, 6, 0, Math.PI * 2);
        ctx.fillStyle = hexA(o.color, 0.22);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(lx, ly, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
    }

    destroy() {
      this.destroyed = true;
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this.ro) this.ro.disconnect();
    }
  }

  /* ------------------------------------------------------------- gauge */

  class Gauge {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.opts = Object.assign({
        min: 0,
        max: 100,
        startAngle: -215,
        endAngle: 35,
        color: '#22d3ee',
        color2: '#e879f9',
        track: 'rgba(255,255,255,0.08)',
        width: 12,
      }, opts);
      this.value = 0;
      this.target = 0;
      this.raf = null;
      this.destroyed = false;
      const sized = setupCanvas(canvas);
      this.ctx = sized.ctx;
      this.w = sized.w;
      this.h = sized.h;
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas.parentElement || canvas);
      this.draw();
    }

    resize() {
      const sized = setupCanvas(this.canvas);
      this.ctx = sized.ctx;
      this.w = sized.w;
      this.h = sized.h;
      this.draw();
    }

    setValue(v, immediate) {
      this.target = clamp(v, this.opts.min, this.opts.max);
      if (immediate) { this.value = this.target; this.draw(); return; }
      this.kick();
    }

    kick() {
      if (this.raf || this.destroyed) return;
      this.raf = requestAnimationFrame(() => this.step());
    }

    step() {
      this.raf = null;
      if (this.destroyed) return;
      const diff = this.target - this.value;
      if (Math.abs(diff) < 0.05) { this.value = this.target; this.draw(); return; }
      this.value += diff * 0.12;
      this.draw();
      this.raf = requestAnimationFrame(() => this.step());
    }

    draw() {
      const { ctx, w, h } = this;
      if (!ctx || !w || !h) return;
      const o = this.opts;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(w, h) / 2 - o.width / 2 - 4;
      const a0 = (o.startAngle * Math.PI) / 180;
      const a1 = (o.endAngle * Math.PI) / 180;
      const frac = clamp((this.value - o.min) / (o.max - o.min || 1), 0, 1);

      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, a1);
      ctx.strokeStyle = o.track;
      ctx.lineWidth = o.width;
      ctx.stroke();

      if (frac > 0.001) {
        const g = ctx.createLinearGradient(cx - r, cy + r, cx + r, cy - r);
        g.addColorStop(0, o.color);
        g.addColorStop(1, o.color2 || o.color);
        ctx.beginPath();
        ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * frac);
        ctx.strokeStyle = g;
        ctx.lineWidth = o.width;
        ctx.shadowColor = hexA(o.color, 0.5);
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;

        const ea = a0 + (a1 - a0) * frac;
        const ex = cx + Math.cos(ea) * r;
        const ey = cy + Math.sin(ea) * r;
        ctx.beginPath();
        ctx.arc(ex, ey, o.width * 0.62, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
    }

    destroy() {
      this.destroyed = true;
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this.ro) this.ro.disconnect();
    }
  }

  /* ------------------------------------------------------------- spark */

  class Spark {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.opts = Object.assign({ color: '#22d3ee', fill: true, lineWidth: 1.5, points: 40 }, opts);
      this.data = [];
      const sized = setupCanvas(canvas);
      this.ctx = sized.ctx;
      this.w = sized.w;
      this.h = sized.h;
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas.parentElement || canvas);
    }

    resize() {
      const sized = setupCanvas(this.canvas);
      this.ctx = sized.ctx;
      this.w = sized.w;
      this.h = sized.h;
      this.draw();
    }

    push(v) {
      this.data.push(v || 0);
      if (this.data.length > this.opts.points) this.data.shift();
      this.draw();
    }

    draw() {
      const { ctx, w, h } = this;
      if (!ctx || !w || !h || this.data.length < 2) return;
      const o = this.opts;
      ctx.clearRect(0, 0, w, h);
      let min = Infinity, max = -Infinity;
      for (const v of this.data) { if (v < min) min = v; if (v > max) max = v; }
      if (min === max) { min -= 1; max += 1; }
      const range = max - min;
      const xAt = i => (i / (o.points - 1)) * w;
      const yAt = v => h - 3 - ((v - min) / range) * (h - 6);
      const pts = this.data.map((v, i) => [xAt(i), yAt(v)]);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], h);
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.lineTo(pts[pts.length - 1][0], h);
      ctx.closePath();
      if (o.fill) { ctx.fillStyle = gradient(ctx, w, h, o.color, 0.22); ctx.fill(); }
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        const mx = (x0 + x1) / 2;
        ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
      }
      ctx.strokeStyle = o.color;
      ctx.lineWidth = o.lineWidth;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    destroy() { if (this.ro) this.ro.disconnect(); }
  }

  P.charts = { LineChart, Gauge, Spark, hexA };
})(window.SEMENU);
