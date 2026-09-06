(function (SZ) {
  'use strict';

  const W = 1200;
  const PAD_X = 80;
  const SITE = 'senszone.yimingzhanshen.cn';

  function fmt(cm, digits) {
    if (cm == null || !isFinite(cm)) return '—';
    return Number(cm).toFixed(digits == null ? 1 : digits);
  }

  function ellipsize(s, maxChars) {
    s = String(s == null ? '' : s);
    if (s.length <= maxChars) return s;
    return s.slice(0, Math.max(0, maxChars - 1)) + '…';
  }

  // 只读 report 已有字段提取中心值（与 ui.js centersOf 相同的口径；不做任何统计重算）
  function centersOfLite(report) {
    const flick =
      report && report.global && report.global.optCm360 != null
        ? report.global.optCm360
        : report && report.plateau && report.plateau.bestCm360 != null
          ? report.plateau.bestCm360
          : null;
    const track =
      report && report.track && report.track.global && report.track.global.optCm360 != null
        ? report.track.global.optCm360
        : report && report.track && report.track.plateau && report.track.plateau.bestCm360 != null
          ? report.track.plateau.bestCm360
          : null;
    return { flick: flick, track: track };
  }

  function dateStr(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return (
      d.getFullYear() +
      '-' +
      p(d.getMonth() + 1) +
      '-' +
      p(d.getDate()) +
      ' ' +
      p(d.getHours()) +
      ':' +
      p(d.getMinutes())
    );
  }

  // 纯函数：输入 report（+ 可选预计算值 pre.combinedCm），输出全部区块坐标与文本内容。
  // pre.combinedCm 由调用方（ui.js 综合滑块口径）传入；缺省时两个中心几何平均（50/50）。
  function layout(report, pre) {
    pre = pre || {};
    const settings = (report && report.settings) || {};
    const dpi = settings.dpi || 800;
    const centers = centersOfLite(report);
    let combined = pre.combinedCm != null ? pre.combinedCm : null;
    if (combined == null && centers.flick != null && centers.track != null) {
      combined = Math.exp((Math.log(centers.flick) + Math.log(centers.track)) / 2);
    }

    const flickPl = report && report.plateau ? report.plateau : null;
    const trackPl = report && report.track ? report.track.plateau : null;
    const bars = [
      {
        key: 'modeFlick',
        lo: flickPl ? flickPl.lo : null,
        hi: flickPl ? flickPl.hi : null,
        center: centers.flick,
      },
      {
        key: 'modeTrack',
        lo: trackPl ? trackPl.lo : null,
        hi: trackPl ? trackPl.hi : null,
        center: centers.track,
      },
    ];

    const nums = [report ? report.anchorCm360 : null];
    bars.forEach((b) => {
      nums.push(b.lo, b.hi, b.center);
    });
    const finite = nums.filter((v) => v != null && isFinite(v));
    let min = Math.min.apply(null, finite);
    let max = Math.max.apply(null, finite);
    if (!isFinite(min) || !isFinite(max)) {
      min = 0;
      max = 100;
    }
    if (max - min < 1) max = min + 1;
    const pad = (max - min) * 0.12;
    const dMin = Math.max(0, min - pad);
    const dMax = max + pad;
    const x0 = PAD_X;
    const x1 = W - PAD_X;
    const mapX = (v) => x0 + ((v - dMin) / (dMax - dMin)) * (x1 - x0);
    bars.forEach((b) => {
      b.loStr = fmt(b.lo);
      b.hiStr = fmt(b.hi);
      b.centerStr = fmt(b.center);
      b.hasRange = b.lo != null && b.hi != null && isFinite(b.lo) && isFinite(b.hi);
      b.xa = b.hasRange ? mapX(b.lo) : null;
      b.xb = b.hasRange ? mapX(b.hi) : null;
      b.xc = b.center != null && isFinite(b.center) ? mapX(b.center) : null;
    });

    let overlap = null;
    if (flickPl && trackPl && flickPl.lo != null && trackPl.lo != null) {
      const lo = Math.max(flickPl.lo, trackPl.lo);
      const hi = Math.min(flickPl.hi, trackPl.hi);
      if (hi > lo)
        overlap = { lo: lo, hi: hi, loStr: fmt(lo), hiStr: fmt(hi), xa: mapX(lo), xb: mapX(hi) };
    }

    // 换算表：对每个已知游戏由 cm/360 反算灵敏度（SZ.math 纯换算，非统计）
    const cmBase =
      combined != null
        ? combined
        : centers.flick != null
          ? centers.flick
          : report
            ? report.anchorCm360
            : null;
    const games = SZ.math && SZ.math.GAMES ? SZ.math.GAMES : {};
    const rows = [];
    Object.keys(games).forEach((id) => {
      if (id === 'custom') return;
      const g = games[id];
      const sens =
        cmBase != null && isFinite(cmBase) ? SZ.math.sensFromCm360(g.yaw, cmBase, dpi) : null;
      rows.push({ id: id, name: g.name, cm: cmBase, cmStr: fmt(cmBase), sensStr: fmt(sens, 2) });
    });

    const warnings = report && report.warnings ? report.warnings : [];
    const counts = report && report.counts ? report.counts : null;

    const convRows = rows.length;
    const height =
      96 + 150 + (overlap ? 34 : 0) + 84 + (convRows ? 34 + convRows * 30 : 0) + 52 + 48 + 20;
    return {
      width: W,
      height: height,
      title: 'SensZone 灵敏域',
      dateStr: dateStr(report ? report.ts : NaN),
      watermark: '© YMZS',
      site: SITE,
      domain: { min: dMin, max: dMax, x0: x0, x1: x1 },
      anchorStr: fmt(report ? report.anchorCm360 : null),
      countsStr: counts ? counts.hits + '/' + counts.trials : '—',
      rawMode: report && report.rawMode ? report.rawMode : '—',
      styleStr:
        report && report.flickStyle && report.flickStyle.style ? report.flickStyle.style : '—',
      bars: bars,
      overlap: overlap,
      combinedStr: fmt(combined),
      convDpi: dpi,
      convRows: rows,
      warnCount: warnings.length,
      warnKeys: warnings.map((w) => w.key),
    };
  }

  function draw(report, records, trackResults, opts) {
    opts = opts || {};
    const L = layout(report, opts);
    const canvas = document.createElement('canvas');
    canvas.width = L.width;
    canvas.height = L.height;
    const ctx = canvas.getContext('2d');

    const BG = '#04070d';
    const FG = '#dbe7f3';
    const MUT = '#8aa0b4';
    const PRIM = '#00ffcc';
    const ACC = '#ff007b';
    const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, L.width, L.height);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = FG;
    ctx.font = '700 34px ' + FONT;
    ctx.fillText(L.title, 48, 62);
    ctx.fillStyle = MUT;
    ctx.font = '16px ' + FONT;
    ctx.fillText(L.dateStr, 48, 88);
    ctx.textAlign = 'right';
    ctx.fillStyle = MUT;
    ctx.fillText(L.watermark, L.width - 48, 46);
    ctx.textAlign = 'left';

    // 区间条：两组 bar + 重叠区
    let y = 150;
    const barH = 26;
    L.bars.forEach((b) => {
      ctx.fillStyle = FG;
      ctx.font = '600 18px ' + FONT;
      ctx.fillText(ellipsize(b.key, 10), 48, y + barH);
      if (b.hasRange) {
        ctx.fillStyle = 'rgba(0,255,204,0.25)';
        ctx.fillRect(b.xa, y, Math.max(2, b.xb - b.xa), barH);
      }
      if (b.xc != null) {
        ctx.fillStyle = PRIM;
        ctx.fillRect(b.xc - 1.5, y - 5, 3, barH + 10);
        ctx.font = '16px ' + FONT;
        ctx.fillText(b.centerStr + ' cm/360', Math.min(b.xc + 8, L.width - 160), y + barH - 6);
      }
      ctx.fillStyle = MUT;
      ctx.font = '14px ' + FONT;
      ctx.textAlign = 'right';
      ctx.fillText(b.loStr + ' – ' + b.hiStr, L.width - 48, y + barH - 4);
      ctx.textAlign = 'left';
      y += barH + 24;
    });
    if (L.overlap) {
      ctx.fillStyle = 'rgba(255,0,123,0.5)';
      ctx.fillRect(L.overlap.xa, y, Math.max(2, L.overlap.xb - L.overlap.xa), 10);
      ctx.fillStyle = ACC;
      ctx.font = '14px ' + FONT;
      ctx.fillText('overlap ' + L.overlap.loStr + ' – ' + L.overlap.hiStr, L.overlap.xa, y + 24);
      y += 34;
    }

    // 综合推荐 + 概要
    y += 10;
    ctx.fillStyle = PRIM;
    ctx.font = '700 40px ' + FONT;
    ctx.fillText(L.combinedStr, 48, y + 34);
    ctx.fillStyle = MUT;
    ctx.font = '15px ' + FONT;
    ctx.fillText('cm/360', 48, y + 56);
    const info =
      'anchor ' + L.anchorStr + ' · ' + L.countsStr + ' · ' + L.rawMode + ' · style ' + L.styleStr;
    ctx.textAlign = 'right';
    ctx.fillText(ellipsize(info, 60), L.width - 48, y + 34);
    ctx.textAlign = 'left';
    y += 84;

    // 换算表
    if (L.convRows.length) {
      ctx.fillStyle = MUT;
      ctx.font = '600 16px ' + FONT;
      ctx.fillText('sens @ ' + L.convDpi + ' DPI', 48, y);
      y += 14;
      L.convRows.forEach((r) => {
        y += 30;
        ctx.fillStyle = FG;
        ctx.font = '16px ' + FONT;
        ctx.fillText(ellipsize(r.name, 22), 48, y);
        ctx.fillStyle = MUT;
        ctx.textAlign = 'right';
        ctx.fillText(r.sensStr + '  (' + r.cmStr + ' cm)', 560, y);
        ctx.textAlign = 'left';
      });
      y += 24;
    }

    // 警告摘要
    ctx.fillStyle = L.warnCount ? '#ffb020' : MUT;
    ctx.font = '15px ' + FONT;
    ctx.fillText(
      L.warnCount ? 'warnings: ' + L.warnCount + ' (' + L.warnKeys.join(', ') + ')' : 'no warnings',
      48,
      y + 20,
    );

    // 页脚
    ctx.fillStyle = MUT;
    ctx.font = '14px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText(L.site, L.width - 48, L.height - 24);
    ctx.textAlign = 'left';
    return canvas;
  }

  SZ.reportImage = { layout: layout, draw: draw, ellipsize: ellipsize, W: W };
})(
  typeof window !== 'undefined'
    ? (window.SZ = window.SZ || {})
    : (globalThis.SZ = globalThis.SZ || {}),
);
