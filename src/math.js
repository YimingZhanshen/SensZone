(function (SZ) {
  'use strict';

  const DEG = 180 / Math.PI;
  const RAD = Math.PI / 180;

  const GAMES = {
    cs2: { name: 'Counter-Strike 2', yaw: 0.022, fovModel: 'vertical-fixed-90', defaultFov: 90 },
    apex: { name: 'Apex Legends', yaw: 0.022, fovModel: 'vertical-fixed-90', defaultFov: 104 },
    valorant: { name: 'Valorant', yaw: 0.07, fovModel: 'horizontal-103', defaultFov: 103 },
    overwatch: { name: 'Overwatch 2', yaw: 0.0066, fovModel: 'horizontal-103', defaultFov: 103 },
    custom: { name: 'Custom', yaw: 0.022, fovModel: 'custom', defaultFov: 90 },
  };

  function cm360(yaw, sens, dpi) {
    return 914.4 / (yaw * sens * dpi);
  }

  function sensFromCm360(yaw, dpi, cm) {
    return 914.4 / (yaw * dpi * cm);
  }

  function degPerMm(cm) {
    return 36 / cm;
  }

  function cmFromDegPerMm(dpm) {
    return 36 / dpm;
  }

  function edpi(dpi, sens) {
    return dpi * sens;
  }

  function gameFov(gameId, aspect, customHFovDeg) {
    let hFov, vFov;
    const game = GAMES[gameId] || GAMES.cs2;
    if (game.fovModel === 'vertical-fixed-90') {
      const baseFov = gameId === 'cs2' ? 90 : 104;
      vFov = 2 * Math.atan(Math.tan((baseFov / 2) * RAD) * 0.75);
      hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    } else if (game.fovModel === 'horizontal-103') {
      vFov = 2 * Math.atan(Math.tan(51.5 * RAD) * (9 / 16));
      hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    } else {
      hFov = (customHFovDeg || 90) * RAD;
      vFov = 2 * Math.atan(Math.tan(hFov / 2) / aspect);
    }
    return { hFov: hFov * DEG, vFov: vFov * DEG };
  }

  function greatCircleDeg(az1, el1, az2, el2) {
    const a1 = az1 * RAD,
      e1 = el1 * RAD,
      a2 = az2 * RAD,
      e2 = el2 * RAD;
    const c = Math.sin(e1) * Math.sin(e2) + Math.cos(e1) * Math.cos(e2) * Math.cos(a1 - a2);
    return Math.acos(Math.min(1, Math.max(-1, c))) * DEG;
  }

  function wrap180(d) {
    let x = d % 360;
    if (x > 180) x -= 360;
    if (x < -180) x += 360;
    return x;
  }

  function indexOfDifficulty(degDist, degWidth) {
    return Math.log2(degDist / degWidth + 1);
  }

  function throughput(idBits, mtSec) {
    return idBits / mtSec;
  }

  function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function signedEndpointError(startAz, startEl, targetAz, targetEl, endAz, endEl) {
    const cosT = Math.cos(targetEl * RAD);
    const us = wrap180(startAz - targetAz) * cosT;
    const vs = startEl - targetEl;
    const uc = wrap180(endAz - targetAz) * cosT;
    const vc = endEl - targetEl;
    const norm = Math.hypot(us, vs);
    if (norm < 1e-6) return 0;
    return -(uc * (us / norm) + vc * (vs / norm));
  }

  SZ.math = {
    GAMES,
    RAD,
    DEG,
    cm360,
    sensFromCm360,
    degPerMm,
    cmFromDegPerMm,
    edpi,
    gameFov,
    greatCircleDeg,
    wrap180,
    indexOfDifficulty,
    throughput,
    clamp,
    mulberry32,
    shuffle,
    signedEndpointError,
  };
})(
  typeof window !== 'undefined'
    ? (window.SZ = window.SZ || {})
    : (globalThis.SZ = globalThis.SZ || {}),
);
