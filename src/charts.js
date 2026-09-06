(function (SZ) {
  'use strict';

  const BUCKET_COLORS = { low: '#ff9f43', mid: '#00e676', high: '#4fc3f7', global: '#f5f7fa' };

  function log2Cm(cm) {
    return Math.log2(36 / cm);
  }

  function setupAxes(ctx, box, xDomain, yDomain) {
    const padL = 56,
      padR = 16,
      padT = 18,
      padB = 34;
    const plot = {
      x: box.x + padL,
      y: box.y + padT,
      w: box.w - padL - padR,
      h: box.h - padT - padB,
    };
    const mapX = (cm) =>
      plot.x +
      ((log2Cm(cm) - log2Cm(xDomain[0])) / (log2Cm(xDomain[1]) - log2Cm(xDomain[0]))) * plot.w;
    const mapY = (v) => plot.y + plot.h - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * plot.h;
    return { plot, mapX, mapY };
  }

  function drawFrame(ctx, plot, xTicks, yTicks, mapX, mapY, labels) {
    ctx.strokeStyle = 'rgba(120,140,160,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#8aa0b4';
    ctx.textAlign = 'center';
    for (const cm of xTicks) {
      const x = mapX(cm);
      if (x < plot.x || x > plot.x + plot.w) continue;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.strokeStyle = 'rgba(120,140,160,0.15)';
      ctx.stroke();
      ctx.fillText(String(cm), x, plot.y + plot.h + 14);
    }
    ctx.textAlign = 'right';
    for (const v of yTicks) {
      const y = mapY(v);
      if (y < plot.y || y > plot.y + plot.h) continue;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.strokeStyle = 'rgba(120,140,160,0.15)';
      ctx.stroke();
      ctx.fillText(String(Math.round(v)), plot.x - 6, y + 3);
    }
    if (labels) {
      ctx.textAlign = 'center';
      ctx.fillText(labels.x, plot.x + plot.w / 2, plot.y + plot.h + 28);
      ctx.save();
      ctx.translate(14, plot.y + plot.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(labels.y, 0, 0);
      ctx.restore();
    }
  }

  function drawMtChart(canvas, report) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth,
      cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const used = report.conds.filter((c) => c.used && (c.adjMT != null || c.meanMT != null));
    if (!used.length) return;
    const mtOf = (c) => (c.adjMT != null ? c.adjMT : c.meanMT);
    const xDomain = [8, 160];
    const mts = used.map(mtOf);
    const yDomain = [
      Math.min(250, Math.min.apply(null, mts) * 0.7),
      Math.max.apply(null, mts) * 1.35,
    ];

    const box = { x: 0, y: 0, w: cssW, h: cssH };
    const { plot, mapX, mapY } = setupAxes(ctx, box, xDomain, yDomain);
    drawFrame(
      ctx,
      plot,
      [10, 15, 20, 30, 45, 60, 80, 120],
      niceTicks(yDomain[0], yDomain[1], 5),
      mapX,
      mapY,
      { x: 'cm/360', y: 'MT* (ms, ID=' + (report.idRef != null ? report.idRef : 3) + ')' },
    );

    const paperL = mapX(20),
      paperR = mapX(80);
    ctx.fillStyle = 'rgba(255,214,10,0.10)';
    ctx.fillRect(paperL, plot.y, Math.max(0, paperR - paperL), plot.h);

    for (const name of ['low', 'mid', 'high']) {
      const fit = report.buckets[name];
      if (!fit || fit.method !== 'quadratic' || !fit.curveParams) continue;
      const cp = fit.curveParams;
      const predict = (x) => cp.a * (x - cp.mx) ** 2 + cp.b * (x - cp.mx) + cp.c;
      ctx.beginPath();
      let started = false;
      for (let cm = xDomain[0]; cm <= xDomain[1]; cm *= 1.05) {
        const v = predict(log2Cm(cm));
        if (v < yDomain[0] || v > yDomain[1]) {
          started = false;
          continue;
        }
        const x = mapX(cm),
          y = mapY(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = BUCKET_COLORS[name];
      ctx.lineWidth = 2;
      ctx.stroke();
      if (fit.ci) {
        const l = mapX(fit.ci[0]),
          r = mapX(fit.ci[1]);
        ctx.fillStyle = BUCKET_COLORS[name] + '1c';
        ctx.fillRect(Math.min(l, r), plot.y, Math.abs(r - l), plot.h);
      }
    }

    ctx.fillStyle = BUCKET_COLORS.global;
    for (const c of used) {
      const x = mapX(c.cm360),
        y = mapY(mtOf(c));
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      const se =
        c.adjSE != null
          ? c.adjSE
          : c.sdMT != null
            ? c.sdMT / Math.sqrt(Math.max(1, c.n * c.hitRate))
            : null;
      if (se != null) {
        ctx.beginPath();
        ctx.moveTo(x, mapY(mtOf(c) - se));
        ctx.lineTo(x, mapY(mtOf(c) + se));
        ctx.strokeStyle = 'rgba(245,247,250,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    const ax = mapX(report.anchorCm360);
    if (ax >= plot.x && ax <= plot.x + plot.w) {
      ctx.beginPath();
      ctx.moveTo(ax, plot.y);
      ctx.lineTo(ax, plot.y + plot.h);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#ff007b';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    let lx = plot.x + 8;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    for (const name of ['low', 'mid', 'high']) {
      ctx.fillStyle = BUCKET_COLORS[name];
      ctx.fillText(report.bucketLabel[name], lx, plot.y + 12);
      lx += ctx.measureText(report.bucketLabel[name]).width + 14;
    }
  }

  function drawDiagChart(canvas, report) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth,
      cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const used = report.conds.filter((c) => c.meanSignedErr != null);
    if (!used.length) return;
    const half = { x: 0, y: 0, w: cssW / 2 - 4, h: cssH };
    const half2 = { x: cssW / 2 + 4, y: 0, w: cssW / 2 - 4, h: cssH };

    drawErrPanel(ctx, half, used);
    drawSubPanel(ctx, half2, used);
  }

  function drawErrPanel(ctx, box, conds) {
    const padL = 46,
      padR = 10,
      padT = 22,
      padB = 30;
    const plot = {
      x: box.x + padL,
      y: box.y + padT,
      w: box.w - padL - padR,
      h: box.h - padT - padB,
    };
    const maxAbs = Math.max(
      0.5,
      Math.max.apply(
        null,
        conds.map((c) => Math.abs(c.meanSignedErr)),
      ) * 1.3,
    );
    const mapY = (v) => plot.y + plot.h / 2 - (v / maxAbs) * (plot.h / 2);
    ctx.strokeStyle = 'rgba(120,140,160,0.35)';
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    ctx.beginPath();
    ctx.moveTo(plot.x, mapY(0));
    ctx.lineTo(plot.x + plot.w, mapY(0));
    ctx.strokeStyle = 'rgba(200,220,240,0.5)';
    ctx.stroke();
    const bw = (plot.w / conds.length) * 0.5;
    conds.forEach((c, i) => {
      const cx = plot.x + ((i + 0.5) / conds.length) * plot.w;
      const y0 = mapY(0),
        y1 = mapY(c.meanSignedErr);
      ctx.fillStyle = c.meanSignedErr > 0 ? 'rgba(255,59,92,0.75)' : 'rgba(79,195,247,0.75)';
      ctx.fillRect(cx - bw / 2, Math.min(y0, y1), bw, Math.abs(y1 - y0));
      ctx.fillStyle = '#8aa0b4';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(c.cm360.toFixed(0), cx, plot.y + plot.h + 12);
    });
    ctx.fillStyle = '#8aa0b4';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('signed err (deg) + = overshoot', plot.x + plot.w / 2, 12);
  }

  function drawSubPanel(ctx, box, conds) {
    const usable = conds.filter((c) => c.meanSubmov != null);
    const padL = 46,
      padR = 10,
      padT = 22,
      padB = 30;
    const plot = {
      x: box.x + padL,
      y: box.y + padT,
      w: box.w - padL - padR,
      h: box.h - padT - padB,
    };
    ctx.strokeStyle = 'rgba(120,140,160,0.35)';
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    if (!usable.length) {
      ctx.fillStyle = '#8aa0b4';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('no submovement data', box.x + box.w / 2, box.y + box.h / 2);
      return;
    }
    const ys = usable.map((c) => c.meanSubmov);
    const yMin = Math.min.apply(null, ys) - 0.2;
    const yMax = Math.max.apply(null, ys) + 0.2;
    const xs = usable.map((c) => Math.log2(36 / c.cm360));
    const xMin = Math.min.apply(null, xs) - 0.3,
      xMax = Math.max.apply(null, xs) + 0.3;
    const mapX = (x) => plot.x + ((x - xMin) / (xMax - xMin)) * plot.w;
    const mapY = (v) => plot.y + plot.h - ((v - yMin) / (yMax - yMin)) * plot.h;
    ctx.beginPath();
    usable.forEach((c, i) => {
      const x = mapX(xs[i]),
        y = mapY(c.meanSubmov);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#b388ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    usable.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(mapX(xs[i]), mapY(c.meanSubmov), 3, 0, Math.PI * 2);
      ctx.fillStyle = '#b388ff';
      ctx.fill();
      ctx.fillStyle = '#8aa0b4';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(c.cm360.toFixed(0), mapX(xs[i]), plot.y + plot.h + 12);
    });
    ctx.fillStyle = '#8aa0b4';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('mean submovements vs sensitivity', plot.x + plot.w / 2, 12);
  }

  function drawTrackChart(canvas, report) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth,
      cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const tr = report.track;
    if (!tr || !tr.conds || !tr.conds.length) return;
    const used = tr.conds.filter((c) => c.rms != null);
    if (!used.length) return;

    drawRmsPanel(ctx, { x: 0, y: 0, w: cssW / 2 - 8, h: cssH }, used, tr, report);
    drawLagPanel(ctx, { x: cssW / 2 + 8, y: 0, w: cssW / 2 - 8, h: cssH }, used);
  }

  function drawRmsPanel(ctx, box, used, tr, report) {
    const xDomain = [8, 160];
    const ys = used.map((c) => c.rms);
    const yDomain = [0, Math.max.apply(null, ys) * 1.4];

    const { plot, mapX, mapY } = setupAxes(ctx, box, xDomain, yDomain);
    drawFrame(ctx, plot, [10, 20, 45, 80, 150], niceTicks(yDomain[0], yDomain[1], 4), mapX, mapY, {
      x: 'cm/360',
      y: 'RMS err (\u00b0)',
    });

    const fit = tr.global && tr.global.curveParams;
    if (fit && tr.global.method.indexOf('quadratic') === 0) {
      const cp = fit;
      const predict = (x) => cp.a * (x - cp.mx) ** 2 + cp.b * (x - cp.mx) + cp.c;
      ctx.beginPath();
      let started = false;
      for (let cm = xDomain[0]; cm <= xDomain[1]; cm *= 1.05) {
        const v = predict(log2Cm(cm));
        if (v < yDomain[0] || v > yDomain[1]) {
          started = false;
          continue;
        }
        const x = mapX(cm),
          y = mapY(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#b388ff';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (tr.global.ci) {
        const l = mapX(tr.global.ci[0]),
          r = mapX(tr.global.ci[1]);
        ctx.fillStyle = '#b388ff1c';
        ctx.fillRect(Math.min(l, r), plot.y, Math.abs(r - l), plot.h);
      }
    }
    if (tr.plateau) {
      const l = mapX(tr.plateau.lo),
        r = mapX(tr.plateau.hi);
      ctx.fillStyle = 'rgba(179,136,255,0.10)';
      ctx.fillRect(Math.min(l, r), plot.y, Math.abs(r - l), plot.h);
    }

    ctx.fillStyle = '#b388ff';
    for (const c of used) {
      const x = mapX(c.cm360),
        y = mapY(c.rms);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (c.se != null) {
        ctx.beginPath();
        ctx.moveTo(x, mapY(c.rms - c.se));
        ctx.lineTo(x, mapY(c.rms + c.se));
        ctx.strokeStyle = 'rgba(245,247,250,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    const ax = mapX(report.anchorCm360);
    if (ax >= plot.x && ax <= plot.x + plot.w) {
      ctx.beginPath();
      ctx.moveTo(ax, plot.y);
      ctx.lineTo(ax, plot.y + plot.h);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#ff007b';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawLagPanel(ctx, box, used) {
    const usable = used.filter((c) => c.lagMs != null);
    const padL = 44,
      padR = 10,
      padT = 26,
      padB = 34;
    const plot = {
      x: box.x + padL,
      y: box.y + padT,
      w: box.w - padL - padR,
      h: box.h - padT - padB,
    };
    ctx.strokeStyle = 'rgba(120,140,160,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    if (!usable.length) {
      ctx.fillStyle = '#8aa0b4';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('no lag data', box.x + box.w / 2, box.y + box.h / 2);
      return;
    }
    const sorted = usable.slice().sort((a, b) => a.cm360 - b.cm360);
    const lags = sorted.map((c) => c.lagMs);
    const yMax = Math.max.apply(null, lags) * 1.3;
    const yMin = Math.min(0, Math.min.apply(null, lags));
    const mapY = (v) => plot.y + plot.h - ((v - yMin) / (yMax - yMin)) * plot.h;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#8aa0b4';
    ctx.textAlign = 'right';
    for (const v of niceTicks(yMin, yMax, 4)) {
      const y = mapY(v);
      if (y < plot.y || y > plot.y + plot.h) continue;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.strokeStyle = 'rgba(120,140,160,0.15)';
      ctx.stroke();
      ctx.fillText(String(Math.round(v)), plot.x - 5, y + 3);
    }
    ctx.beginPath();
    ctx.moveTo(plot.x, mapY(0));
    ctx.lineTo(plot.x + plot.w, mapY(0));
    ctx.strokeStyle = 'rgba(200,220,240,0.5)';
    ctx.stroke();
    const xs = sorted.map((c, i) => plot.x + ((i + 0.5) / sorted.length) * plot.w);
    ctx.beginPath();
    sorted.forEach((c, i) => {
      if (i === 0) ctx.moveTo(xs[i], mapY(c.lagMs));
      else ctx.lineTo(xs[i], mapY(c.lagMs));
    });
    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 2;
    ctx.stroke();
    sorted.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(xs[i], mapY(c.lagMs), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#4fc3f7';
      ctx.fill();
      ctx.fillStyle = '#8aa0b4';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(c.cm360.toFixed(0), xs[i], plot.y + plot.h + 12);
    });
    ctx.fillStyle = '#8aa0b4';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('aim lag (ms)', plot.x + plot.w / 2, 14);
  }

  function niceTicks(lo, hi, n) {
    const span = hi - lo;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const candidates = [1, 2, 2.5, 5, 10];
    let step = mag;
    for (const c of candidates) {
      if (c * mag >= step0) {
        step = c * mag;
        break;
      }
    }
    const ticks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    return ticks;
  }

  // ===== 历史趋势 =====

  const TREND_COLORS = { flick: '#00ffcc', track: '#4fc3f7', combined: '#ff9f43' };

  function centerOf(entry) {
    const r = entry && entry.report;
    if (!r) return null;
    const flick =
      r.global && r.global.optCm360 != null
        ? r.global.optCm360
        : r.plateau
          ? r.plateau.bestCm360
          : null;
    const track =
      r.track && r.track.global && r.track.global.optCm360 != null
        ? r.track.global.optCm360
        : r.track && r.track.plateau && r.track.plateau.bestCm360 != null
          ? r.track.plateau.bestCm360
          : null;
    let combined = null;
    if (flick != null && track != null)
      combined = Math.exp((Math.log(flick) + Math.log(track)) / 2);
    else combined = flick != null ? flick : track;
    return { flick: flick, track: track, combined: combined };
  }

  // 纯函数：输入 sz.history.v1 数组与绘图区 box，输出各点像素坐标与值域。
  // 只保留至少有一个任务中心的条目；少于 2 条有效数据返回 null（空态）。
  function historyTrendSeries(history, box) {
    const pts = [];
    (history || []).forEach((h) => {
      const c = centerOf(h);
      if (c && (c.flick != null || c.track != null) && h.ts != null) {
        pts.push({ ts: h.ts, flick: c.flick, track: c.track, combined: c.combined });
      }
    });
    if (pts.length < 2) return null;
    pts.sort((a, b) => a.ts - b.ts);
    let lo = Infinity;
    let hi = -Infinity;
    pts.forEach((p) => {
      [p.flick, p.track, p.combined].forEach((v) => {
        if (v != null && isFinite(v)) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      });
    });
    if (!isFinite(lo) || !isFinite(hi)) return null;
    const span = Math.max(1, hi - lo);
    const x0 = box.x + 10;
    const x1 = box.x + box.w - 10;
    const mapX = (ts) =>
      x0 + ((ts - pts[0].ts) / Math.max(1, pts[pts.length - 1].ts - pts[0].ts)) * (x1 - x0);
    const mapY = (v) => box.y + box.h - 8 - ((v - lo) / span) * (box.h - 16);
    pts.forEach((p) => {
      p.x = mapX(p.ts);
      p.yFlick = p.flick != null ? mapY(p.flick) : null;
      p.yTrack = p.track != null ? mapY(p.track) : null;
      p.yCombined = p.combined != null ? mapY(p.combined) : null;
    });
    return { pts: pts, vMin: lo, vMax: hi };
  }

  function drawHistoryTrend(canvas, history) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const s = historyTrendSeries(history, { x: 0, y: 0, w: cssW, h: cssH });
    if (!s) return false;

    const keys = ['flick', 'track', 'combined'];
    keys.forEach((k) => {
      ctx.strokeStyle = TREND_COLORS[k];
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      s.pts.forEach((p) => {
        const y = k === 'flick' ? p.yFlick : k === 'track' ? p.yTrack : p.yCombined;
        if (y == null) return;
        if (!started) {
          ctx.moveTo(p.x, y);
          started = true;
        } else ctx.lineTo(p.x, y);
      });
      if (started) {
        ctx.stroke();
        ctx.fillStyle = TREND_COLORS[k];
        s.pts.forEach((p) => {
          const y = k === 'flick' ? p.yFlick : k === 'track' ? p.yTrack : p.yCombined;
          if (y == null) return;
          ctx.fillRect(p.x - 2, y - 2, 4, 4);
        });
      }
    });

    // 图例（文案走 i18n）
    const t = SZ.i18n ? SZ.i18n.t : (k) => k;
    ctx.font = '11px monospace';
    let lx = 14;
    keys.forEach((k) => {
      ctx.fillStyle = TREND_COLORS[k];
      ctx.fillRect(lx, cssH - 12, 8, 3);
      ctx.fillStyle = '#8aa0b4';
      const label = t(k === 'flick' ? 'modeFlick' : k === 'track' ? 'modeTrack' : 'combinedTitle');
      ctx.fillText(label, lx + 12, cssH - 7);
      lx += 12 + ctx.measureText(label).width + 14;
    });
    return true;
  }

  SZ.charts = {
    drawMtChart,
    drawTrackChart,
    drawDiagChart,
    niceTicks,
    BUCKET_COLORS,
    historyTrendSeries,
    drawHistoryTrend,
    TREND_COLORS,
  };
})(
  typeof window !== 'undefined'
    ? (window.SZ = window.SZ || {})
    : (globalThis.SZ = globalThis.SZ || {}),
);
