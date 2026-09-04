(function (SZ) {
  'use strict';

  const ID_REF = 3.0;
  const MIN_HITS_COND = 5;
  const MIN_POINTS_FIT = 12;
  const MIN_BUCKET_HITS = 12;
  const PLATEAU_TOL = 1.08;

  function keptSlice(recs) {
    const n = recs.length;
    const discard = Math.floor(n / 3);
    const kept = Math.max(8, n - discard);
    return recs.slice(n - kept);
  }

  function analyze(records, settings, meta) {
    const byCond = {};
    for (const r of records) {
      if (!byCond[r.condId]) byCond[r.condId] = [];
      byCond[r.condId].push(r);
    }
    const condIds = Object.keys(byCond).map(Number).sort((a, b) => a - b);

    const condData = [];
    for (const id of condIds) {
      const recs = byCond[id].slice().sort((a, b) => a.trialIdx - b.trialIdx);
      const kept = keptSlice(recs);
      const hitsRaw = kept.filter(r => r.hit);
      let hits = hitsRaw;
      if (hitsRaw.length >= 5) {
        const mts = hitsRaw.map(r => r.mtMs).slice().sort((a, b) => a - b);
        const p95 = SZ.stats.quantileSorted(mts, 0.95);
        hits = hitsRaw.filter(r => r.mtMs <= p95);
      }
      condData.push({ id, recs, kept, hits, hitsRaw });
    }

    const allHits = [];
    for (const cd of condData) for (const r of cd.hits) allHits.push(r);

    let beta = 0;
    if (allHits.length >= MIN_POINTS_FIT) {
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const r of allHits) {
        const id = r.target.idBits;
        sx += id;
        sy += r.mtMs;
        sxx += id * id;
        sxy += id * r.mtMs;
      }
      const n = allHits.length;
      const denom = n * sxx - sx * sx;
      if (denom > 1e-9) beta = (n * sxy - sx * sy) / denom;
      if (!isFinite(beta) || beta < 0) beta = 0;
    }

    const perCond = [];
    for (const cd of condData) {
      const recs = cd.kept;
      const hits = cd.hits;
      const cond = recs[0].cond || { idx: cd.id, mult: null };
      const sens = recs[0].sens;
      const n = recs.length;
      const hitRate = n ? cd.hitsRaw.length / n : 0;

      let meanMT = null, sdMT = null, meanTp = null, meanSignedErr = null, overshootRate = null, meanSubmov = null, meanId = null, adjMT = null, adjSE = null, meanSwip = null;
      if (hits.length) {
        const mts = hits.map(r => r.mtMs);
        meanMT = SZ.stats.mean(mts);
        sdMT = hits.length > 1 ? SZ.stats.sd(mts) : 0;
        meanTp = SZ.stats.mean(hits.map(r => r.target.idBits / (r.mtMs / 1000)));
        meanSignedErr = SZ.stats.mean(hits.map(r => r.signedErrDeg));
        overshootRate = hits.filter(r => r.signedErrDeg > 0).length / hits.length;
        meanSubmov = SZ.stats.mean(hits.map(r => r.submovements == null ? 1 : r.submovements));
        meanId = SZ.stats.mean(hits.map(r => r.target.idBits));
        const swips = hits.map(r => r.swipiness).filter(v => v != null);
        meanSwip = swips.length ? SZ.stats.mean(swips) : null;
        const adj = hits.map(r => r.mtMs - beta * (r.target.idBits - ID_REF));
        adjMT = SZ.stats.mean(adj);
        const ids = hits.map(r => r.target.idBits);
        const seId = ids.length > 1 ? SZ.stats.sd(ids) / Math.sqrt(ids.length) : 0;
        const seMT = adj.length > 1 ? SZ.stats.sd(adj) / Math.sqrt(adj.length) : (sdMT || 50) / Math.sqrt(adj.length || 1);
        adjSE = Math.sqrt(seMT * seMT + beta * beta * seId * seId);
      }

      perCond.push({
        idx: cd.id,
        mult: cond.mult,
        cm360: sens.cm360,
        gameSens: sens.gameSens,
        n,
        nRaw: byCond[cd.id].length,
        hitRate,
        meanMT,
        sdMT,
        meanTp,
        meanSignedErr,
        overshootRate,
        meanSubmov,
        meanSwip,
        meanId,
        adjMT,
        adjSE,
        used: hits.length >= MIN_HITS_COND && hitRate >= 0.5
      });
    }

    const rng = SZ.math.mulberry32(0x5eed1234);
    const global = fitCurve(perCond, condData, null, rng, beta);
    const buckets = {
      low: fitCurve(perCond, condData, r => r.target.idBits < 2, rng, beta),
      mid: fitCurve(perCond, condData, r => r.target.idBits >= 2 && r.target.idBits < 3.5, rng, beta),
      high: fitCurve(perCond, condData, r => r.target.idBits >= 3.5, rng, beta)
    };
    const plateau = (global && global.plateau) || detectPlateau(perCond);

    const warnings = [];
    for (const c of perCond) {
      if (!c.used) {
        warnings.push({ key: 'condExcluded', vars: { cm: Math.round(c.cm360), hr: Math.round(c.hitRate * 100) } });
      }
    }
    const totalN = condData.reduce((s, cd) => s + cd.kept.length, 0);
    const totalHits = condData.reduce((s, cd) => s + cd.hitsRaw.length, 0);
    const overallRate = totalN ? totalHits / totalN : 0;
    if (totalN > 0 && overallRate < 0.85) {
      warnings.push({ key: 'overallHitRate', vars: { hr: Math.round(overallRate * 100) } });
    }
    if (meta && meta.rawMode && meta.rawMode !== 'raw') {
      warnings.push({ key: 'rawInputWarn', vars: {} });
    }

    const swipAll = perCond.filter(c => c.meanSwip != null).map(c => c.meanSwip);
    const meanSwip = swipAll.length ? SZ.stats.mean(swipAll) : null;
    const flickStyle = meanSwip == null ? null : {
      meanSwip,
      style: meanSwip < 0.7 ? 'swipe' : (meanSwip <= 1.0 ? 'mixed' : 'land')
    };

    return {
      ts: Date.now(),
      settings: {
        game: settings.game, aspect: settings.aspect, customFov: settings.customFov,
        dpi: settings.dpi, sens: settings.sens, yaw: settings.yaw,
        trialsPerCond: settings.trialsPerCond, padWidthCm: settings.padWidthCm, sessionId: settings.sessionId
      },
      anchorCm360: SZ.math.cm360(settings.yaw, settings.sens, settings.dpi),
      rawMode: meta ? meta.rawMode : 'unknown',
      trialsPerCond: settings.trialsPerCond,
      conds: perCond,
      buckets,
      global,
      plateau,
      betaPerBit: beta,
      idRef: ID_REF,
      flickStyle,
      warnings,
      counts: { trials: totalN, hits: totalHits }
    };
  }

  function fitCurve(perCond, condData, bucketFilter, rng, beta) {
    const usable = [];
    for (let i = 0; i < perCond.length; i++) {
      const c = perCond[i];
      if (!c.used) continue;
      let hits = condData[i].hits;
      if (bucketFilter) hits = hits.filter(bucketFilter);
      if (!hits.length) continue;
      usable.push({ c, hits });
    }
    if (usable.length < 4) return { method: 'insufficient', optCm360: null, ci: null, ciWide: null, curveParams: null, n: 0 };
    const totalHits = usable.reduce((s, u) => s + u.hits.length, 0);
    if (totalHits < MIN_BUCKET_HITS) return { method: 'insufficient', optCm360: null, ci: null, ciWide: null, curveParams: null, n: totalHits };

    function metrics() {
      const xs = [], ys = [], ws = [], byIdx = [];
      for (const u of usable) {
        const adj = u.hits.map(r => r.mtMs - beta * (r.target.idBits - ID_REF));
        const m = SZ.stats.mean(adj);
        const seMT = adj.length > 1 ? SZ.stats.sd(adj) / Math.sqrt(adj.length) : 50;
        const ids = u.hits.map(r => r.target.idBits);
        const seId = ids.length > 1 ? SZ.stats.sd(ids) / Math.sqrt(ids.length) : 0;
        const se = Math.sqrt(seMT * seMT + beta * beta * seId * seId);
        xs.push(Math.log2(36 / u.c.cm360));
        ys.push(m);
        ws.push(1 / Math.max(25, se * se));
        byIdx.push({ idx: u.c.idx, y: m, w: 1 / Math.max(25, se * se) });
      }
      return { xs, ys, ws, byIdx };
    }

    const base = metrics();
    const fit = SZ.stats.quadFitW(base.xs, base.ys, base.ws);
    const opt0 = fit ? fit.optimum() : null;

    if (base.xs.length >= 5 && totalHits >= MIN_POINTS_FIT) {
      const opts = [];
      for (let it = 0; it < 400; it++) {
        const m = metrics();
        for (let i = 0; i < m.xs.length; i++) {
          const u = usable[i];
          const sampled = [];
          for (let j = 0; j < u.hits.length; j++) {
            sampled.push(u.hits[Math.floor(rng() * u.hits.length)]);
          }
          const adj = sampled.map(r => r.mtMs - beta * (r.target.idBits - ID_REF));
          const mn = SZ.stats.mean(adj);
          const seMT = adj.length > 1 ? SZ.stats.sd(adj) / Math.sqrt(adj.length) : 50;
          const ids = sampled.map(r => r.target.idBits);
          const seId = ids.length > 1 ? SZ.stats.sd(ids) / Math.sqrt(ids.length) : 0;
          const se = Math.sqrt(seMT * seMT + beta * beta * seId * seId);
          m.ys[i] = mn;
          m.ws[i] = 1 / Math.max(25, se * se);
        }
        const f = SZ.stats.quadFitW(m.xs, m.ys, m.ws);
        const o = f ? f.optimum() : null;
        if (o !== null) opts.push(o);
      }
      const degenerate = opts.length < 200;
      if (!degenerate && opt0 !== null) {
        opts.sort((a, b) => a - b);
        return {
          method: 'quadratic',
          optCm360: SZ.math.cmFromDegPerMm(Math.pow(2, opt0)),
          ci: [SZ.math.cmFromDegPerMm(Math.pow(2, SZ.stats.percentile(opts, 0.25))), SZ.math.cmFromDegPerMm(Math.pow(2, SZ.stats.percentile(opts, 0.75)))],
          ciWide: [SZ.math.cmFromDegPerMm(Math.pow(2, SZ.stats.percentile(opts, 0.05))), SZ.math.cmFromDegPerMm(Math.pow(2, SZ.stats.percentile(opts, 0.95)))],
          curveParams: fit,
          plateau: curvePlateau(fit, opt0, usable.map(u => u.c.cm360), 0.08),
          n: totalHits
        };
      }
    }

    const candidates = perCond.filter(c => c.used && c.adjMT != null);
    if (candidates.length) {
      let best = candidates[0];
      for (const c of candidates) if (c.adjMT < best.adjMT) best = c;
      const sorted = candidates.slice().sort((a, b) => a.cm360 - b.cm360);
      const bi = sorted.indexOf(best);
      const lo = bi > 0 ? sorted[bi - 1].cm360 : best.cm360;
      const hi = bi < sorted.length - 1 ? sorted[bi + 1].cm360 : best.cm360;
      return { method: 'empirical', optCm360: best.cm360, ci: [lo, hi], ciWide: null, curveParams: null, plateau: null, n: totalHits };
    }
    return { method: 'insufficient', optCm360: null, ci: null, ciWide: null, curveParams: null, plateau: null, n: totalHits };
  }

  function inInterval(cm, fit) {
    if (!fit || !fit.ci || fit.ci.length !== 2) return false;
    const lo = Math.min(fit.ci[0], fit.ci[1]);
    const hi = Math.max(fit.ci[0], fit.ci[1]);
    return cm >= lo && cm <= hi;
  }

  function trimBlocks(blocks) {
    if (!blocks || blocks.length < 6) return blocks;
    const sorted = blocks.slice().sort((a, b) => a - b);
    const med = SZ.stats.quantileSorted(sorted, 0.5);
    const abs = blocks.map(v => Math.abs(v - med)).sort((a, b) => a - b);
    const mad = SZ.stats.quantileSorted(abs, 0.5);
    const th = med + 3 * Math.max(mad, med * 0.15);
    const kept = blocks.filter(v => v <= th);
    return kept.length >= Math.min(8, blocks.length - 1) ? kept : blocks;
  }

  function analyzeTrack(results, settings) {
    if (!results || results.length < 3) return null;
    const perCond = [];
    for (const r of results) {
      if (r.rms == null) continue;
      const blocks = trimBlocks(r.blocks);
      const rmsT = Math.sqrt(blocks.reduce((s, v) => s + v * v, 0) / blocks.length);
      const se = blocks.length > 1 ? SZ.stats.sd(blocks) / Math.sqrt(blocks.length) : Math.max(0.05, rmsT * 0.1);
      perCond.push({
        idx: r.condId,
        cm360: r.sens.cm360,
        gameSens: r.sens.gameSens,
        rms: rmsT,
        onTargetPct: r.onTargetPct,
        lagMs: r.lagMs,
        se,
        blocks,
        used: true
      });
    }
    if (perCond.length < 3) return null;

    const rng = SZ.math.mulberry32(0x7eaec04d);    const xs = perCond.map(c => Math.log2(36 / c.cm360));
    const ys = perCond.map(c => c.rms);
    const ws = perCond.map(c => 1 / Math.max(1e-4, c.se * c.se));
    const fit = SZ.stats.quadFitW(xs, ys, ws);
    const opt0 = fit ? fit.optimum() : null;

    let ci = null, ciWide = null, method = 'quadratic';
    if (perCond.length >= 5) {
      const opts = [];
      for (let it = 0; it < 400; it++) {
        const ys2 = [], ws2 = [];
        for (let i = 0; i < perCond.length; i++) {
          const blocks = perCond[i].blocks;
          if (blocks.length < 3) { ys2.push(perCond[i].rms); ws2.push(ws[i]); continue; }
          const pick = [];
          for (let j = 0; j < blocks.length; j++) pick.push(blocks[Math.floor(rng() * blocks.length)]);
          const m = SZ.stats.mean(pick);
          const se = pick.length > 1 ? SZ.stats.sd(pick) / Math.sqrt(pick.length) : perCond[i].se;
          ys2.push(m);
          ws2.push(1 / Math.max(1e-4, se * se));
        }
        const f = SZ.stats.quadFitW(xs, ys2, ws2);
        const o = f ? f.optimum() : null;
        if (o !== null) opts.push(o);
      }
      if (opts.length >= 200 && opt0 !== null) {
        opts.sort((a, b) => a - b);
        ci = [
          SZ.math.cmFromDegPerMm(Math.pow(2, SZ.stats.percentile(opts, 0.25))),
          SZ.math.cmFromDegPerMm(Math.pow(2, SZ.stats.percentile(opts, 0.75)))
        ];
        ciWide = [
          SZ.math.cmFromDegPerMm(Math.pow(2, SZ.stats.percentile(opts, 0.05))),
          SZ.math.cmFromDegPerMm(Math.pow(2, SZ.stats.percentile(opts, 0.95)))
        ];
      } else {
        method = opt0 === null ? 'insufficient' : 'quadratic-narrow';
      }
    }

    let plateau = null;
    const sorted = perCond.slice().sort((a, b) => a.cm360 - b.cm360);
    let best = sorted[0];
    for (const c of sorted) if (c.rms < best.rms) best = c;
    const bi = sorted.indexOf(best);
    let lo = bi, hi = bi;
    while (lo > 0 && sorted[lo - 1].rms <= best.rms * PLATEAU_TOL) lo--;
    while (hi < sorted.length - 1 && sorted[hi + 1].rms <= best.rms * PLATEAU_TOL) hi++;
    if (hi - lo >= 1) {
      plateau = { lo: sorted[lo].cm360, hi: sorted[hi].cm360, bestCm360: best.cm360, conds: sorted.slice(lo, hi + 1).map(c => Math.round(c.cm360)) };
    }

    if (opt0 === null) {
      method = 'empirical';
      const bi2 = perCond.indexOf(best);
      return {
        conds: perCond,
        global: { method, optCm360: best.cm360, ci: null, ciWide: null, curveParams: null },
        plateau,
        reliable: false
      };
    }

    let reliable = false;
    if (method === 'quadratic' && ci && ciWide) {
      const lo = Math.min(ciWide[0], ciWide[1]);
      const hi = Math.max(ciWide[0], ciWide[1]);
      reliable = isFinite(lo) && isFinite(hi) && lo > 0 && hi / lo <= 4;
    }

    const trackPlateau = (method === 'quadratic' ? curvePlateau(fit, opt0, perCond.map(c => c.cm360), 0.08) : null) || plateau;

    return {
      conds: perCond,
      global: {
        method,
        optCm360: SZ.math.cmFromDegPerMm(Math.pow(2, opt0)),
        ci,
        ciWide,
        curveParams: fit
      },
      plateau: trackPlateau,
      reliable
    };
  }

  function curvePlateau(fit, opt0, condCms, tol) {
    if (!fit || fit.a <= 0 || opt0 === null || !condCms || condCms.length < 2) return null;
    const fMin = fit.predict(opt0);
    if (!(fMin > 0)) return null;
    const half = Math.sqrt(tol * fMin / fit.a);
    const xs = condCms.map(cm => Math.log2(36 / cm));
    const xLo = Math.min.apply(null, xs), xHi = Math.max.apply(null, xs);
    const a0 = Math.max(xLo, opt0 - half), a1 = Math.min(xHi, opt0 + half);
    if (!(a1 > a0)) return null;
    const cm1 = SZ.math.cmFromDegPerMm(Math.pow(2, a0));
    const cm2 = SZ.math.cmFromDegPerMm(Math.pow(2, a1));
    return {
      lo: Math.min(cm1, cm2),
      hi: Math.max(cm1, cm2),
      bestCm360: SZ.math.cmFromDegPerMm(Math.pow(2, opt0)),
      conds: condCms.filter(cm => {
        const x = Math.log2(36 / cm);
        return x >= a0 - 1e-9 && x <= a1 + 1e-9;
      }).map(cm => Math.round(cm))
    };
  }

  function detectPlateau(perCond) {
    const usable = perCond.filter(c => c.used && c.adjMT != null).slice().sort((a, b) => a.cm360 - b.cm360);
    if (usable.length < 3) return null;
    let best = usable[0];
    for (const c of usable) if (c.adjMT < best.adjMT) best = c;
    const bi = usable.indexOf(best);
    let lo = bi, hi = bi;
    while (lo > 0 && usable[lo - 1].adjMT <= best.adjMT * PLATEAU_TOL) lo--;
    while (hi < usable.length - 1 && usable[hi + 1].adjMT <= best.adjMT * PLATEAU_TOL) hi++;
    if (hi - lo < 1) return null;
    return {
      lo: usable[lo].cm360,
      hi: usable[hi].cm360,
      bestCm360: best.cm360,
      conds: usable.slice(lo, hi + 1).map(c => Math.round(c.cm360))
    };
  }

  SZ.analysis = { analyze, analyzeTrack, inInterval };
})(typeof window !== 'undefined' ? (window.SZ = window.SZ || {}) : (globalThis.SZ = globalThis.SZ || {}));
