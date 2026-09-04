(function (SZ) {
  'use strict';

  const FS = 240;
  const FC = 7;
  const SEG = { vStart: 8, vEnd: 4, tMin: 80 };

  function biquadLP(fs, fc, q) {
    const w0 = 2 * Math.PI * fc / fs;
    const alpha = Math.sin(w0) / (2 * q);
    const cosw = Math.cos(w0);
    const a0 = 1 + alpha;
    return {
      b0: (1 - cosw) / 2 / a0,
      b1: (1 - cosw) / a0,
      b2: (1 - cosw) / 2 / a0,
      a1: -2 * cosw / a0,
      a2: (1 - alpha) / a0
    };
  }

  function onepoleLP(fs, fc) {
    const g = Math.tan(Math.PI * fc / fs);
    const b = g / (1 + g);
    const a = (1 - g) / (1 + g);
    return { b, a };
  }

  function makeLowpassChain(fs, fc) {
    const s1 = biquadLP(fs, fc, 0.54119610);
    const s2 = biquadLP(fs, fc, 1.30656296);
    const s3 = onepoleLP(fs, fc);
    return [
      function (x) {
        const out = new Float64Array(x.length);
        let x1 = x[0], x2 = x[0], y1 = x[0], y2 = x[0];
        for (let i = 0; i < x.length; i++) {
          const xi = x[i];
          const yi = s1.b0 * xi + s1.b1 * x1 + s1.b2 * x2 - s1.a1 * y1 - s1.a2 * y2;
          out[i] = yi; x2 = x1; x1 = xi; y2 = y1; y1 = yi;
        }
        return out;
      },
      function (x) {
        const out = new Float64Array(x.length);
        let x1 = x[0], x2 = x[0], y1 = x[0], y2 = x[0];
        for (let i = 0; i < x.length; i++) {
          const xi = x[i];
          const yi = s2.b0 * xi + s2.b1 * x1 + s2.b2 * x2 - s2.a1 * y1 - s2.a2 * y2;
          out[i] = yi; x2 = x1; x1 = xi; y2 = y1; y1 = yi;
        }
        return out;
      },
      function (x) {
        const out = new Float64Array(x.length);
        let y1 = x[0];
        for (let i = 0; i < x.length; i++) {
          const prev = i > 0 ? x[i - 1] : x[0];
          y1 = s3.b * (x[i] + prev) + s3.a * y1;
          out[i] = y1;
        }
        return out;
      }
    ];
  }

  function applyChain(x, chain) {
    let cur = x;
    for (const stage of chain) cur = stage(cur);
    return cur;
  }

  function filtfilt(x, chain) {
    const n = x.length;
    const pad = 32;
    const buf = new Float64Array(n + 2 * pad);
    for (let i = 0; i < pad; i++) { buf[i] = x[0]; buf[n + pad + i] = x[n - 1]; }
    for (let i = 0; i < n; i++) buf[pad + i] = x[i];
    const fwd = applyChain(buf, chain);
    const rev = new Float64Array(fwd.length);
    for (let i = 0; i < fwd.length; i++) rev[i] = fwd[fwd.length - 1 - i];
    const bwd = applyChain(rev, chain);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = bwd[bwd.length - 1 - pad - i];
    return out;
  }

  function resampleUniform(samples, fs) {
    if (!samples || samples.length < 8) return null;
    const t0 = samples[0].t;
    const rel = samples.map(s => ({ t: s.t - t0, az: s.az, el: s.el }));
    const dt = 1000 / fs;
    const tEnd = rel[rel.length - 1].t;
    if (tEnd <= 0) return null;
    const n = Math.max(4, Math.floor(tEnd / dt) + 1);
    const out = {
      t: new Float64Array(n),
      az: new Float64Array(n),
      el: new Float64Array(n)
    };
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      while (j < rel.length - 2 && rel[j + 1].t < t) j++;
      const a = rel[j], b = rel[j + 1];
      const span = b.t - a.t;
      const f = span > 0 ? SZ.math.clamp((t - a.t) / span, 0, 1) : 0;
      out.t[i] = t;
      out.az[i] = a.az + (b.az - a.az) * f;
      out.el[i] = a.el + (b.el - a.el) * f;
    }
    return out;
  }

  function velocitySeries(az, el, dtMs) {
    const n = az.length;
    const v = new Float64Array(n);
    const dt = dtMs / 1000;
    for (let i = 1; i < n - 1; i++) {
      v[i] = Math.hypot(az[i + 1] - az[i - 1], el[i + 1] - el[i - 1]) / (2 * dt);
    }
    v[0] = v[1];
    v[n - 1] = v[n - 2];
    return v;
  }

  function segmentSubmovements(t, v, opts) {
    const o = opts || SEG;
    const starts = [];
    const ends = [];
    let inMove = false;
    let tStart = 0;
    for (let i = 0; i < t.length; i++) {
      if (inMove) {
        if (v[i] < o.vEnd && (t[i] - tStart) > o.tMin) {
          ends.push(t[i]);
          inMove = false;
        }
      } else if (v[i] > o.vStart) {
        starts.push(t[i]);
        tStart = t[i];
        inMove = true;
      }
    }
    if (inMove) ends.push(t[t.length - 1]);
    const segs = [];
    for (let i = 0; i < starts.length; i++) {
      const end = i < ends.length ? ends[i] : t[t.length - 1];
      let peak = 0;
      let peakT = starts[i];
      for (let k = 0; k < t.length; k++) {
        if (t[k] >= starts[i] && t[k] <= end && v[k] > peak) {
          peak = v[k];
          peakT = t[k];
        }
      }
      segs.push({ start: starts[i], end, peak, peakT });
    }
    return segs;
  }

  function summarizeTrialTrace(trace) {
    if (!trace || trace.length < 8) return null;
    const uni = resampleUniform(trace, FS);
    if (!uni || uni.t.length < 24) return null;
    const chain = makeLowpassChain(FS, FC);
    const fAz = filtfilt(uni.az, chain);
    const fEl = filtfilt(uni.el, chain);
    const v = velocitySeries(fAz, fEl, 1000 / FS);
    const segs = segmentSubmovements(uni.t, v, SEG);
    return {
      count: segs.length,
      firstPeakVel: segs.length ? segs[0].peak : 0,
      firstPeakT: segs.length ? segs[0].peakT : 0,
      peakVel: v.length ? Math.max.apply(null, Array.from(v)) : 0
    };
  }

  SZ.kinematics = {
    FS, FC, SEG,
    makeLowpassChain, filtfilt, resampleUniform,
    velocitySeries, segmentSubmovements, summarizeTrialTrace
  };
})(typeof window !== 'undefined' ? (window.SZ = window.SZ || {}) : (globalThis.SZ = globalThis.SZ || {}));
