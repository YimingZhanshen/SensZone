(function (SZ) {
  'use strict';

  let canvas, ctx;
  let W = 0, H = 0, dpr = 1;
  let cam = { az: 0, el: 0 };
  let fov = { hFov: 90, vFov: 73.739795 };

  const COL = {
    bgTop: '#060b14',
    bgBottom: '#02040a',
    grid: 'rgba(30,58,86,0.55)',
    horizon: 'rgba(46,84,120,0.5)',
    refRing: '#f5f7fa',
    testIdle: '#5a6a7a',
    testActive: '#00e676',
    crosshair: '#00ffcc',
    flashHit: '#00e676',
    flashMiss: '#ff3b5c',
    flashDeny: '#ffb020'
  };

  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    resize();
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bgGrad = null;
  }

  function setViewport(w, h) { W = w; H = h; }
  function setCamera(az, el) { cam.az = az; cam.el = el; updateBasis(); }
  function setFov(f) { fov = f; updateTan(); }
  function getSize() { return { W, H }; }

  const basis = { fx: 0, fy: 0, fz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0 };

  function updateBasis() {
    const a = cam.az * SZ.math.RAD, e = cam.el * SZ.math.RAD;
    const ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
    basis.fx = sa * ce; basis.fy = se; basis.fz = -ca * ce;
    basis.rx = ca; basis.ry = 0; basis.rz = sa;
    basis.ux = -sa * se;
    basis.uy = ce;
    basis.uz = ca * se;
  }

  const PR = { front: false, x: 0, y: 0 };

  let tanHF = 0, tanVF = 0;

  function updateTan() {
    tanHF = Math.tan(fov.hFov / 2 * SZ.math.RAD);
    tanVF = Math.tan(fov.vFov / 2 * SZ.math.RAD);
  }

  updateTan();

  function project(azDeg, elDeg) {
    const a = azDeg * SZ.math.RAD, e = elDeg * SZ.math.RAD;
    const ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
    const dx = sa * ce, dy = se, dz = -ca * ce;
    const df = dx * basis.fx + dy * basis.fy + dz * basis.fz;
    if (df <= 0.02) { PR.front = false; return PR; }
    const dr = dx * basis.rx + dy * basis.ry + dz * basis.rz;
    const du = dx * basis.ux + dy * basis.uy + dz * basis.uz;
    PR.front = true;
    PR.x = (W / 2) * (1 + (dr / df) / tanHF);
    PR.y = (H / 2) * (1 - (du / df) / tanVF);
    return PR;
  }

  function angularRadiusPx(radDeg) {
    return Math.tan(radDeg * SZ.math.RAD) / tanHF * (W / 2);
  }

  let bgGrad = null;

  function drawBackground() {
    if (!bgGrad) {
      bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, COL.bgTop);
      bgGrad.addColorStop(1, COL.bgBottom);
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);
  }

  function drawHorizon() {
    ctx.strokeStyle = COL.horizon;
    ctx.lineWidth = 1;
    ctx.beginPath();
    let started = false;
    for (let az = -100; az <= 100; az += 2) {
      const p = project(az, 0);
      if (!p.front) { started = false; continue; }
      if (!started) { ctx.moveTo(p.x, p.y); started = true; }
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  function drawGrid() {
    ctx.strokeStyle = COL.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = -48; gx <= 48; gx += 6) {
      let started = false;
      for (let gz = -4; gz >= -66; gz -= 3) {
        const p = projectWorldPoint(gx, -1.7, gz);
        if (!p.front) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
    }
    for (let gz = -4; gz >= -66; gz -= 6) {
      let started = false;
      for (let gx = -48; gx <= 48; gx += 3) {
        const p = projectWorldPoint(gx, -1.7, gz);
        if (!p.front) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
  }

  function projectWorldPoint(x, y, z) {
    const df = x * basis.fx + y * basis.fy + z * basis.fz;
    if (df <= 0.02) { PR.front = false; return PR; }
    const dr = x * basis.rx + y * basis.ry + z * basis.rz;
    const du = x * basis.ux + y * basis.uy + z * basis.uz;
    PR.front = true;
    PR.x = (W / 2) * (1 + (dr / df) / tanHF);
    PR.y = (H / 2) * (1 - (du / df) / tanVF);
    return PR;
  }

  const STYLE = {
    ref: { fill: 'rgba(245,247,250,0.18)', ring: '#f5f7fa' },
    idle: { fill: 'rgba(150,170,190,0.32)', ring: '#c2d0dc' },
    live: { fill: 'rgba(0,255,136,0.28)', ring: '#00ff88' },
    track: { fill: 'rgba(0,255,136,0.28)', ring: '#00ff88' }
  };

  function drawTarget(t) {
    if (!t) return;
    const st = STYLE[t.style] || (t.color ? { fill: t.color + '22', ring: t.color } : null);
    if (!st) return;
    const p = project(t.az, t.el);
    if (!p.front) return;
    const r = angularRadiusPx(t.radDeg);
    if (r < 1) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = st.fill;
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.strokeStyle = st.ring;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.5, r * 0.06), 0, Math.PI * 2);
    ctx.fillStyle = st.ring;
    ctx.fill();
  }

  function drawCrosshair() {
    const cx = W / 2, cy = H / 2;
    ctx.strokeStyle = COL.crosshair;
    ctx.fillStyle = COL.crosshair;
    ctx.lineWidth = 1.6;
    const gap = 4, len = 7;
    ctx.beginPath();
    ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy);
    ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFlashes(flashes, now) {
    for (const f of flashes) {
      const age = now - f.t0;
      if (age > 320) continue;
      const p = project(f.az, f.el);
      if (!p.front) continue;
      const prog = age / 320;
      const r0 = angularRadiusPx(f.radDeg);
      const r = r0 * (1 + prog * 1.2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.globalAlpha = 1 - prog;
      ctx.lineWidth = 2.5;
      const kind = f.kind || f.type;
      ctx.strokeStyle = kind === 'hit' ? COL.flashHit : kind === 'deny' ? COL.flashDeny : COL.flashMiss;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawWatermark() {
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#cfe3f5';
    ctx.globalAlpha = 0.4;
    ctx.font = '600 14px "Segoe UI", Arial, sans-serif';
    ctx.fillText('YMZS \u00b7 SensZone', W - 14, H - 32);
    ctx.globalAlpha = 0.26;
    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.fillText('\u00a9 2026 YMZS All Rights Reserved', W - 14, H - 14);
    ctx.restore();
  }

  function drawScene(scene, now) {
    updateBasis();
    drawBackground();
    drawHorizon();
    drawGrid();
    drawWatermark();
    if (scene) {
      drawTarget(scene.ref);
      drawTarget(scene.test);
      drawFlashes(scene.flashes || [], now);
    }
    drawCrosshair();
  }

  SZ.render = { init, resize, setViewport, setCamera, setFov, getSize, project, drawScene, STYLE };
})(typeof window !== 'undefined' ? (window.SZ = window.SZ || {}) : (globalThis.SZ = globalThis.SZ || {}));
