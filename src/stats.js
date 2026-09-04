(function (SZ) {
  'use strict';

  function mean(arr) {
    if (!arr.length) return NaN;
    let s = 0;
    for (const v of arr) s += v;
    return s / arr.length;
  }

  function sd(arr) {
    const n = arr.length;
    if (n < 2) return 0;
    const m = mean(arr);
    let s = 0;
    for (const v of arr) s += (v - m) * (v - m);
    return Math.sqrt(s / (n - 1));
  }

  function quantileSorted(sorted, p) {
    if (!sorted.length) return NaN;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  function solve3(A, b) {
    const m = [
      [A[0][0], A[0][1], A[0][2], b[0]],
      [A[1][0], A[1][1], A[1][2], b[1]],
      [A[2][0], A[2][1], A[2][2], b[2]]
    ];
    for (let col = 0; col < 3; col++) {
      let piv = col;
      for (let r = col + 1; r < 3; r++) {
        if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
      }
      if (Math.abs(m[piv][col]) < 1e-12) return null;
      if (piv !== col) { const tmp = m[piv]; m[piv] = m[col]; m[col] = tmp; }
      for (let r = 0; r < 3; r++) {
        if (r === col) continue;
        const f = m[r][col] / m[col][col];
        for (let c = col; c < 4; c++) m[r][c] -= f * m[col][c];
      }
    }
    return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  }

  function quadFit(xs, ys) {
    return quadFitW(xs, ys, null);
  }

  function quadFitW(xs, ys, ws) {
    const n = xs.length;
    if (n < 3) return null;
    const mx = mean(xs);
    const w = ws || xs.map(() => 1);
    let S0 = 0, S1 = 0, S2 = 0, S3 = 0, S4 = 0, T0 = 0, T1 = 0, T2 = 0;
    for (let i = 0; i < n; i++) {
      const u = xs[i] - mx;
      const uu = u * u;
      const wi = w[i];
      S0 += wi; S1 += wi * u; S2 += wi * uu; S3 += wi * uu * u; S4 += wi * uu * uu;
      T0 += wi * ys[i]; T1 += wi * u * ys[i]; T2 += wi * uu * ys[i];
    }
    const sol = solve3(
      [[S0, S1, S2], [S1, S2, S3], [S2, S3, S4]],
      [T0, T1, T2]
    );
    if (!sol) return null;
    const [c, b, a] = sol;
    if (!isFinite(a) || !isFinite(b) || !isFinite(c)) return null;
    return {
      a, b, c, mx,
      predict(x) { const u = x - mx; return a * u * u + b * u + c; },
      optimum() { return a > 0 ? mx - b / (2 * a) : null; }
    };
  }

  function percentile(sortedArr, p) {
    return quantileSorted(sortedArr, p);
  }

  function rank(arr) {
    const idx = arr.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const ranks = new Array(arr.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const r = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[idx[k][1]] = r;
      i = j + 1;
    }
    return ranks;
  }

  function spearman(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 3) return null;
    const rx = rank(xs.slice(0, n));
    const ry = rank(ys.slice(0, n));
    const mx = mean(rx), my = mean(ry);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      num += (rx[i] - mx) * (ry[i] - my);
      dx += (rx[i] - mx) ** 2;
      dy += (ry[i] - my) ** 2;
    }
    if (dx <= 0 || dy <= 0) return null;
    return num / Math.sqrt(dx * dy);
  }

  function bootstrapOptimum(points, iters, rng) {
    const byCond = new Map();
    for (const p of points) {
      if (!byCond.has(p.cond)) byCond.set(p.cond, []);
      byCond.get(p.cond).push(p);
    }
    const conds = Array.from(byCond.keys());
    for (const c of conds) {
      if (byCond.get(c).length < 3) return { opt: null, degenerate: true, n: points.length };
    }
    const opts = [];
    let bad = 0;
    for (let it = 0; it < iters; it++) {
      const xs = [], ys = [];
      for (const c of conds) {
        const pool = byCond.get(c);
        let s = 0;
        for (let k = 0; k < pool.length; k++) {
          s += pool[Math.floor(rng() * pool.length)].y;
        }
        xs.push(pool[0].x);
        ys.push(s / pool.length);
      }
      const fit = quadFit(xs, ys);
      const opt = fit ? fit.optimum() : null;
      if (opt === null) bad++;
      else opts.push(opt);
    }
    if (opts.length < iters * 0.5) return { opt: null, degenerate: true, n: points.length };
    opts.sort((a, b) => a - b);
    return {
      opt: mean(opts),
      ci: [quantileSorted(opts, 0.25), quantileSorted(opts, 0.75)],
      ciWide: [quantileSorted(opts, 0.1), quantileSorted(opts, 0.9)],
      degenerate: false,
      n: points.length
    };
  }

  SZ.stats = {
    mean, sd, quantileSorted, percentile, quadFit, quadFitW, spearman, bootstrapOptimum, rank
  };
})(typeof window !== 'undefined' ? (window.SZ = window.SZ || {}) : (globalThis.SZ = globalThis.SZ || {}));
