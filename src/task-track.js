(function (SZ) {
  'use strict';

  const TARGET_RAD = 1.5;
  const DURATION_S = 15;
  const DISCARD_S = 2;
  const BLOCK_S = 1;
  const FS = 240;

  function makeSweepAxis(seed, vCruise, apexMin, apexMax, turnMin, turnMax, clampAmp) {
    const rng = SZ.math.mulberry32(seed >>> 0);
    const dt = 4;
    const n = Math.ceil((DURATION_S + 1.5) * 1000 / dt);
    const vals = new Float64Array(n);
    let dir = rng() < 0.5 ? 1 : -1;
    let pos = 0;
    let t = 0;
    let phase = 'cruise';
    let apex = dir * (apexMin + rng() * (apexMax - apexMin));
    let turnDur = (turnMin + rng() * (turnMax - turnMin)) * 1000;
    let turnStart = 0;
    for (let i = 0; i < n; i++) {
      let v;
      if (phase === 'cruise') {
        v = dir * vCruise;
        if ((dir > 0 && pos >= apex) || (dir < 0 && pos <= apex)) {
          phase = 'turn';
          turnStart = t;
        }
      } else {
        const u = Math.min(1, (t - turnStart) / turnDur);
        v = dir * vCruise * Math.cos(Math.PI * u);
        if (u >= 1) {
          dir *= -1;
          apex = dir * (apexMin + rng() * (apexMax - apexMin));
          turnDur = (turnMin + rng() * (turnMax - turnMin)) * 1000;
          phase = 'cruise';
        }
      }
      pos += v * dt / 1000;
      if (pos > clampAmp) pos = clampAmp;
      else if (pos < -clampAmp) pos = -clampAmp;
      vals[i] = pos;
      t += dt;
    }
    return function (timeS) {
      const idx = timeS * 1000 / dt;
      const i0 = Math.min(n - 2, Math.max(0, Math.floor(idx)));
      const f = Math.min(1, Math.max(0, idx - i0));
      return vals[i0] * (1 - f) + vals[i0 + 1] * f;
    };
  }

  function makeTrajectory(seed) {
    const azAxis = makeSweepAxis((seed ^ 0x51ed270b) >>> 0, 26, 20, 28, 0.55, 0.7, 35);
    const elAxis = makeSweepAxis((seed ^ 0x2b0f9e37) >>> 0, 5, 3.5, 4.5, 0.55, 0.7, 6.5);
    return {
      az(t) { return azAxis(t); },
      el(t) { return elAxis(t); }
    };
  }

  function resampleUniform(samples, keys) {
    if (samples.length < 16) return null;
    const t0 = samples[0].t;
    const tEnd = samples[samples.length - 1].t - t0;
    const n = Math.max(2, Math.floor(tEnd * FS / 1000) + 1);
    const out = { n, dt: 1000 / FS, ch: {} };
    for (const k of keys) out.ch[k] = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = i * 1000 / FS;
      while (j < samples.length - 2 && samples[j + 1].t - t0 < t) j++;
      const a = samples[j];
      const b = samples[j + 1];
      const span = b.t - a.t;
      const f = span > 0 ? Math.min(1, Math.max(0, (t - (a.t - t0)) / span)) : 0;
      for (const k of keys) out.ch[k][i] = a[k] + (b[k] - a[k]) * f;
    }
    return out;
  }

  function computeMetrics(samples, targetRad) {
    const uni = resampleUniform(samples, ['taz', 'tel', 'caz', 'cel']);
    if (!uni) return null;
    const n = uni.n;
    const dt = uni.dt / 1000;
    const i0 = Math.floor(DISCARD_S * 1000 / uni.dt);
    const errs = [];
    const blocks = [];
    let blockAcc = [];
    for (let i = i0; i < n; i++) {
      const e = SZ.math.greatCircleDeg(uni.ch.caz[i], uni.ch.cel[i], uni.ch.taz[i], uni.ch.tel[i]);
      errs.push(e);
      blockAcc.push(e);
      if (blockAcc.length >= BLOCK_S * FS) {
        let s = 0;
        for (const v of blockAcc) s += v * v;
        blocks.push(Math.sqrt(s / blockAcc.length));
        blockAcc = [];
      }
    }
    if (blockAcc.length >= BLOCK_S * FS / 2) {
      let s = 0;
      for (const v of blockAcc) s += v * v;
      blocks.push(Math.sqrt(s / blockAcc.length));
    }
    if (errs.length < FS) return null;
    let ss = 0;
    let onTarget = 0;
    for (const e of errs) {
      ss += e * e;
      if (e <= targetRad) onTarget++;
    }
    const rms = Math.sqrt(ss / errs.length);
    const onTargetPct = onTarget / errs.length;

    const lagMs = estimateLag(uni);

    return { rms, onTargetPct, lagMs, blocks, nSamples: errs.length };
  }

  function estimateLag(uni) {
    const n = uni.n;
    const i0 = Math.floor(DISCARD_S * 1000 / uni.dt);
    const dt = uni.dt / 1000;
    const vc = new Float64Array(n);
    const vt = new Float64Array(n);
    for (let i = 1; i < n - 1; i++) {
      vc[i] = (uni.ch.caz[i + 1] - uni.ch.caz[i - 1]) / (2 * dt);
      vt[i] = (uni.ch.taz[i + 1] - uni.ch.taz[i - 1]) / (2 * dt);
    }
    let mc = 0, mt = 0, cnt = 0;
    for (let i = i0; i < n - 1; i++) {
      mc += vc[i];
      mt += vt[i];
      cnt++;
    }
    mc /= cnt;
    mt /= cnt;
    const maxLag = Math.floor(0.25 * FS);
    let bestTau = 0;
    let bestC = -Infinity;
    for (let tau = -maxLag; tau <= maxLag; tau++) {
      let num = 0, dc = 0, dtg = 0, m = 0;
      for (let i = i0; i < n - 1; i++) {
        const j = i + tau;
        if (j < i0 || j >= n - 1) continue;
        const a = vc[i] - mc;
        const b = vt[j] - mt;
        num += a * b;
        dc += a * a;
        dtg += b * b;
        m++;
      }
      if (m < 100 || dc <= 0 || dtg <= 0) continue;
      const c = num / Math.sqrt(dc * dtg);
      if (c > bestC) {
        bestC = c;
        bestTau = tau;
      }
    }
    return -bestTau * 1000 / FS;
  }

  function createTrackTask(hooks) {
    let phase = 'idle';
    let cond = null;
    let kind = 'test';
    let traj = null;
    let durationMs = DURATION_S * 1000;
    let runStart = 0;
    let samples = [];
    let result = null;
    let lastSampleT = -1;

    function startRun(condArg, kindArg, seed, durationS) {
      cond = condArg;
      kind = kindArg || 'test';
      traj = makeTrajectory(seed);
      durationMs = (durationS || DURATION_S) * 1000;
      samples = [];
      result = null;
      lastSampleT = -1;
      runStart = performance.now();
      phase = 'run';
      hooks.onHud({ phase, cond, kind });
    }

    function targetPos(now) {
      const t = (now - runStart) / 1000;
      return { az: traj.az(t), el: traj.el(t), radDeg: TARGET_RAD };
    }

    function finish(now) {
      const m = computeMetrics(samples, TARGET_RAD);
      result = {
        condId: cond.idx,
        cond,
        sens: { dpm: cond.dpm, cm360: cond.cm360, gameSens: cond.gameSens },
        rms: m ? m.rms : null,
        onTargetPct: m ? m.onTargetPct : null,
        lagMs: m ? m.lagMs : null,
        blocks: m ? m.blocks : [],
        nSamples: m ? m.nSamples : 0,
        kind
      };
      phase = 'done';
      hooks.onHud({ phase, cond, kind });
      hooks.onTrackComplete(result, kind);
      hooks.onNeedNextTrack();
    }

    function update(now) {
      if (phase !== 'run') return;
      const t = (now - runStart) / 1000;
      if (t >= durationMs / 1000) {
        finish(now);
        return;
      }
      const cam = hooks.getCamera();
      if (now - lastSampleT >= 2) {
        samples.push({
          t: now - runStart,
          taz: traj.az(t),
          tel: traj.el(t),
          caz: cam.az,
          cel: cam.el
        });
        lastSampleT = now;
      }
      hooks.onProgress((now - runStart) / durationMs);
    }

    function addPauseTime(ms) {
      if (phase === 'run') {
        runStart += ms;
        if (lastSampleT > 0) lastSampleT += ms;
        for (const s of samples) s.t += ms;
      }
    }

    const SCENE = { ref: null, test: null, flashes: [] };
    const TESTOBJ = { az: 0, el: 0, radDeg: TARGET_RAD, style: 'track' };
    const NOPOS = { az: 0, el: 0, radDeg: TARGET_RAD };

    function getScene() {
      SCENE.ref = null;
      SCENE.test = null;
      SCENE.flashes = [];
      if (phase === 'run') {
        const now = performance.now();
        const p = targetPos(now);
        TESTOBJ.az = p.az;
        TESTOBJ.el = p.el;
        SCENE.test = TESTOBJ;
      }
      return SCENE;
    }

    function getTargetPos() {
      if (phase !== 'run') return NOPOS;
      return targetPos(performance.now());
    }

    function isRunning() { return phase === 'run'; }
    function getPhase() { return phase; }
    function reset() { phase = 'idle'; cond = null; samples = []; result = null; }

    return { startRun, update, getScene, getTargetPos, isRunning, getPhase, reset, addPauseTime };
  }

  SZ.taskTrack = { createTrackTask, TARGET_RAD, DURATION_S, DISCARD_S, BLOCK_S, makeTrajectory };
})(typeof window !== 'undefined' ? (window.SZ = window.SZ || {}) : (globalThis.SZ = globalThis.SZ || {}));
