(function (SZ) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let els = {};

  let audioCtx = null;
  function initAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (_) {
      audioCtx = null;
    }
  }
  function beep(freq, dur, vol) {
    if (!audioCtx) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur / 1000);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + dur / 1000);
    } catch (_) {}
  }

  function cacheEls() {
    els = {
      scene: $('scene'),
      hud: $('hud'),
      hudCond: $('hud-cond'),
      hudTrial: $('hud-trial'),
      hudHint: $('hud-hint'),
      hudBar: $('hud-bar'),
      feedback: $('feedback'),
      countdown: $('countdown'),
      cdTitle: $('cd-title'),
      cdNum: $('cd-num'),
      cdSub: $('cd-sub'),
      pause: $('pause'),
      menu: $('menu'),
      report: $('report'),
      inGame: $('in-game'),
      inAspect: $('in-aspect'),
      inFov: $('in-fov'),
      rowCustomFov: $('row-custom-fov'),
      rowCustomYaw: $('row-custom-yaw'),
      inYaw: $('in-yaw'),
      inDpi: $('in-dpi'),
      inSens: $('in-sens'),
      inTrials: $('in-trials'),
      inPad: $('in-pad'),
      inLang: $('in-lang'),
      inTaskMode: $('in-task-mode'),
      inFullscreen: $('in-fullscreen'),
      preview: $('preview'),
      rawStatus: $('raw-status'),
      estimate: $('estimate'),
      btnStart: $('btn-start'),
      resumeRow: $('resume-row'),
      btnResumeSession: $('btn-resume-session'),
      btnDiscard: $('btn-discard'),
      historyList: $('history-list'),
      fovNote: $('fov-note'),
    };
  }

  function readSettings() {
    const game = els.inGame.value;
    const aspectVal = els.inAspect.value;
    return {
      game,
      aspect: aspectVal === '16:9' ? 16 / 9 : 4 / 3,
      customFov: parseFloat(els.inFov.value) || 90,
      dpi: parseFloat(els.inDpi.value) || 800,
      sens: parseFloat(els.inSens.value) || 1,
      yaw: validYaw(els.inYaw.value, game),
      trialsPerCond: parseInt(els.inTrials.value, 10) || 24,
      taskMode: els.inTaskMode.value || 'both',
      padWidthCm: parseFloat(els.inPad.value) || null,
      lang: els.inLang.value,
      fullscreen: els.inFullscreen.checked,
      sessionId: Date.now(),
    };
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(
        'sz.settings.v1',
        JSON.stringify({
          game: s.game,
          aspect: els.inAspect.value,
          customFov: s.customFov,
          customYaw: parseFloat(els.inYaw.value) || 0.022,
          dpi: s.dpi,
          sens: s.sens,
          trialsPerCond: s.trialsPerCond,
          taskMode: s.taskMode,
          padWidthCm: s.padWidthCm,
          lang: s.lang,
          fullscreen: s.fullscreen,
        }),
      );
    } catch (_) {}
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem('sz.settings.v1');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.game && SZ.math.GAMES[s.game]) els.inGame.value = s.game;
      if (s.aspect) els.inAspect.value = s.aspect;
      if (s.customFov) els.inFov.value = s.customFov;
      if (s.customYaw) els.inYaw.value = s.customYaw;
      if (s.dpi) els.inDpi.value = s.dpi;
      if (s.sens) els.inSens.value = s.sens;
      if (s.trialsPerCond) els.inTrials.value = s.trialsPerCond === 40 ? 24 : s.trialsPerCond;
      if (s.taskMode) els.inTaskMode.value = s.taskMode;
      if (s.padWidthCm) els.inPad.value = s.padWidthCm;
      if (s.lang) els.inLang.value = s.lang;
      els.inFullscreen.checked = !!s.fullscreen;
    } catch (_) {}
  }

  function fmt(n, d) {
    return Number(n).toFixed(d == null ? 2 : d);
  }

  function validYaw(raw, game) {
    if (game !== 'custom') return SZ.math.GAMES[game].yaw;
    const y = parseFloat(raw);
    if (!isFinite(y) || y < 0.0001 || y > 1) return 0.022;
    return y;
  }

  function updatePreview() {
    const s = readSettings();
    const cm = SZ.math.cm360(s.yaw, s.sens, s.dpi);
    // cm/360 反算一致性校验：由 cm/360 反推灵敏度应还原原值（数值边缘情况防护）
    const sensBack = SZ.math.sensFromCm360(s.yaw, cm, s.dpi);
    const yawOk = isFinite(cm) && Math.abs(sensBack - s.sens) <= Math.abs(s.sens) * 1e-6 + 1e-9;
    const fov = SZ.math.gameFov(s.game, s.aspect, s.customFov);
    let secs = SZ.session.WARMUP_TRIALS * 2.2;
    if (s.taskMode !== 'track') secs += SZ.session.MULTS.length * s.trialsPerCond * 2.2;
    if (s.taskMode !== 'flick') secs += SZ.session.MULTS.length * (3 + SZ.taskTrack.DURATION_S) + 5;
    const mins = Math.round(secs / 60);
    els.preview.textContent =
      SZ.i18n.t('preview') +
      ': ' +
      fmt(cm, 1) +
      ' cm/360 · ' +
      fmt(SZ.math.degPerMm(cm), 3) +
      ' \u00b0/mm · eDPI ' +
      fmt(SZ.math.edpi(s.dpi, s.sens), 0) +
      ' · hFOV ' +
      fmt(fov.hFov, 1) +
      '\u00b0 / vFOV ' +
      fmt(fov.vFov, 1) +
      '\u00b0';
    els.estimate.textContent = SZ.i18n.t('minutes', { m: mins });
    const gm = SZ.math.GAMES[s.game];
    const fovBasis =
      gm.fovModel === 'vertical-fixed-90'
        ? (s.game === 'cs2' ? '90\u00b0' : '104\u00b0') +
          ' (4:3 basis) \u2192 vFOV ' +
          fmt(fov.vFov, 1) +
          '\u00b0'
        : gm.fovModel === 'horizontal-103'
          ? '103\u00b0 @16:9 \u2192 vFOV ' + fmt(fov.vFov, 1) + '\u00b0'
          : fmt(s.customFov, 1) + '\u00b0 \u2192 vFOV ' + fmt(fov.vFov, 1) + '\u00b0';
    els.fovNote.textContent =
      'FOV: ' +
      fovBasis +
      ' \u00b7 hFOV ' +
      fmt(fov.hFov, 1) +
      '\u00b0' +
      (yawOk ? '' : ' \u00b7 ' + SZ.i18n.t('yawInvalid'));
  }

  function setRawStatus(mode) {
    const label = SZ.i18n.t('rawSupported') + ': ';
    if (mode === 'raw') els.rawStatus.textContent = label + SZ.i18n.t('rawYes');
    else if (mode === 'adjusted') els.rawStatus.textContent = label + SZ.i18n.t('rawNo');
    else els.rawStatus.textContent = label + SZ.i18n.t('rawUnknown');
    els.rawStatus.className = mode === 'raw' ? 'raw-ok' : 'raw-warn';
  }

  function applyLang() {
    SZ.i18n.setLang(els.inLang.value);
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = SZ.i18n.t(el.getAttribute('data-i18n'));
    });
    document.title = SZ.i18n.t('appTitle');
    const asp = els.inAspect;
    asp.options[0].textContent = SZ.i18n.t('aspect43');
    asp.options[1].textContent = SZ.i18n.t('aspect169');
    updatePreview();
    renderHistory();
  }

  function showMenu() {
    els.menu.classList.remove('hidden');
    els.report.classList.add('hidden');
    els.hud.classList.add('hidden');
    els.pause.classList.add('hidden');
    els.countdown.classList.add('hidden');
  }

  function showTesting() {
    els.menu.classList.add('hidden');
    els.report.classList.add('hidden');
    els.hud.classList.remove('hidden');
  }

  function showPause() {
    els.pause.classList.remove('hidden');
  }

  function hidePause() {
    els.pause.classList.add('hidden');
  }

  let lastCdInt = null;
  function countdown(cond, sec) {
    els.countdown.classList.remove('hidden');
    const s = Math.ceil(sec);
    if (s !== lastCdInt) {
      lastCdInt = s;
      els.cdNum.textContent = s > 0 ? String(s) : '';
      els.cdTitle.textContent = SZ.i18n.t('countdownNext') + ': ' + fmt(cond.cm360, 1) + ' cm/360';
      els.cdSub.textContent = SZ.i18n.t('countdownHint');
    }
  }

  function hideCountdown() {
    els.countdown.classList.add('hidden');
    lastCdInt = null;
  }

  function setCondition(cond, warmup, kind) {
    if (warmup) {
      els.hudCond.textContent =
        kind === 'track' ? SZ.i18n.t('hudWarmupTrack') : SZ.i18n.t('hudWarmup');
    } else if (kind === 'track') {
      els.hudCond.textContent =
        SZ.i18n.t('trackCond') + ' ' + (cond.idx + 1) + ' / ' + SZ.session.MULTS.length;
    } else {
      els.hudCond.textContent =
        SZ.i18n.t('hudCond') + ' ' + (cond.idx + 1) + ' / ' + SZ.session.MULTS.length;
    }
    els.hudHint.textContent = kind === 'track' ? SZ.i18n.t('trackHint') : SZ.i18n.t('alignHint');
  }

  function setTrial(i, total) {
    els.hudTrial.textContent = SZ.i18n.t('hudTrial') + ' ' + i + ' / ' + total;
    els.hudBar.style.width = '0%';
    lastPct = 0;
  }

  let lastPct = -1;
  function setProgress(frac) {
    const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
    if (pct === lastPct) return;
    lastPct = pct;
    els.hudBar.style.width = pct + '%';
  }

  let fbTimer = null;
  function feedback(kind, mt) {
    const t = SZ.i18n.t;
    if (kind === 'hit') {
      els.feedback.textContent = '\u2713 ' + t('feedbackHit') + ' ' + Math.round(mt) + ' ms';
      beep(880, 70, 0.05);
    } else if (kind === 'skip') {
      els.feedback.textContent = '\u21bb ' + t('feedbackSkip');
    } else if (kind === 'idle') {
      els.feedback.textContent = '\u2717 ' + t('feedbackIdle');
      beep(220, 120, 0.05);
    } else {
      els.feedback.textContent = '\u2717 ' + t('feedbackMiss');
      beep(220, 120, 0.05);
    }
    els.feedback.className = 'show ' + kind;
    clearTimeout(fbTimer);
    fbTimer = setTimeout(() => {
      els.feedback.className = '';
    }, 700);
  }

  // 历史行数值：优先甩枪中心，仅跟枪会话回退跟枪中心（entry = {ts, report}）
  function historyRowValue(entry) {
    const c = centersOf(entry && entry.report);
    return c.flickCm != null ? c.flickCm : c.trackCm;
  }

  function renderHistory() {
    let hist = [];
    try {
      hist = JSON.parse(localStorage.getItem('sz.history.v1') || '[]');
    } catch (_) {}
    const trendCanvas = $('trend-chart');
    const trendEmpty = $('trend-empty');
    let drewTrend = false;
    if (trendCanvas && typeof SZ.charts.drawHistoryTrend === 'function') {
      try {
        drewTrend = SZ.charts.drawHistoryTrend(trendCanvas, hist);
      } catch (_) {
        drewTrend = false;
      }
    }
    if (trendCanvas) trendCanvas.classList.toggle('hidden', !drewTrend);
    if (trendEmpty) {
      trendEmpty.textContent = SZ.i18n.t('trendEmpty');
      trendEmpty.classList.toggle('hidden', drewTrend || !hist.length);
    }
    if (!hist.length) {
      els.historyList.innerHTML = '<div class="muted">' + SZ.i18n.t('historyEmpty') + '</div>';
      return;
    }
    // 历史行数值：优先甩枪中心，仅跟枪会话回退跟枪中心
    const valueOf = historyRowValue;
    const latest = valueOf(hist[0]);
    els.historyList.innerHTML = '';
    hist.slice(0, 10).forEach((h) => {
      const div = document.createElement('div');
      div.className = 'hist-item';
      const d = new Date(h.ts);
      const val = valueOf(h);
      let deltaTxt = '';
      if (val != null && latest != null && hist.length > 1) {
        const pct = ((val - latest) / latest) * 100;
        deltaTxt = ' · ' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
      }
      div.textContent =
        d.toLocaleString() +
        ' — ' +
        (val != null
          ? fmt(val, 1) +
            ' cm/360 (' +
            fmt(h.report && h.report.global && h.report.global.ci ? h.report.global.ci[0] : 0, 0) +
            '–' +
            fmt(h.report && h.report.global && h.report.global.ci ? h.report.global.ci[1] : 0, 0) +
            ')' +
            deltaTxt
          : SZ.i18n.t('insufficient'));
      div.onclick = () => showReport(h.report, null);
      els.historyList.appendChild(div);
    });
  }

  function table(rowsHtml, headers) {
    return (
      '<table><thead><tr>' +
      headers.map((h) => '<th>' + h + '</th>').join('') +
      '</tr></thead><tbody>' +
      rowsHtml +
      '</tbody></table>'
    );
  }

  function centersOf(report) {
    if (!report) return { flickCm: null, trackCm: null };
    const flickCm =
      report.global && report.global.optCm360 != null
        ? report.global.optCm360
        : report.plateau
          ? report.plateau.bestCm360
          : null;
    const trackCm =
      report.track && report.track.global && report.track.global.optCm360 != null
        ? report.track.global.optCm360
        : report.track && report.track.plateau
          ? report.track.plateau.bestCm360
          : null;
    return { flickCm, trackCm };
  }

  function combinedCm360(report, flickPct) {
    const { flickCm, trackCm } = centersOf(report);
    if (flickCm == null && trackCm == null) return null;
    if (flickCm == null) return trackCm;
    if (trackCm == null) return flickCm;
    const w = flickPct / 100;
    return Math.exp(w * Math.log(flickCm) + (1 - w) * Math.log(trackCm));
  }

  function showReport(report, records, trackResults) {
    const t = SZ.i18n.t;
    report.bucketLabel = {
      low: t('bucketLow'),
      mid: t('bucketMid'),
      high: t('bucketHigh'),
    };
    const g = report.global;
    const gCenter = g && g.optCm360 != null ? g.optCm360 : null;
    const hasFlickData = report.conds && report.conds.length > 0;
    let html = '<h2>' + t('reportTitle') + '</h2>';
    html +=
      '<div class="muted">' +
      new Date(report.ts).toLocaleString() +
      ' · ' +
      t('game') +
      ': ' +
      SZ.math.GAMES[report.settings.game].name +
      ' · DPI ' +
      report.settings.dpi +
      ' · ' +
      t('anchor') +
      ' ' +
      fmt(report.anchorCm360, 1) +
      ' cm/360 · ' +
      (report.rawMode === 'raw' ? 'raw input \u2713' : 'raw input ?') +
      '</div>';

    const p = report.plateau;
    const tp = report.track && report.track.plateau;
    if (p && tp) {
      const ovLo = Math.max(p.lo, tp.lo),
        ovHi = Math.min(p.hi, tp.hi);
      const anchorInP = report.anchorCm360 >= p.lo * 0.95 && report.anchorCm360 <= p.hi * 1.05;
      const anchorInT = report.anchorCm360 >= tp.lo * 0.95 && report.anchorCm360 <= tp.hi * 1.05;
      html +=
        '<div class="card main-card"><div class="card-title">' +
        t('dualOverview') +
        '</div>' +
        '<div class="dual-row">' +
        '<div><div class="muted">' +
        t('flickPlateau') +
        '</div><div class="mid">' +
        fmt(p.lo, 1) +
        ' \u2013 ' +
        fmt(p.hi, 1) +
        '</div>' +
        '<div class="badge ' +
        (anchorInP ? 'ok' : 'warn') +
        '">' +
        t(anchorInP ? 'plateauIn' : 'plateauOut') +
        '</div></div>' +
        '<div><div class="muted">' +
        t('trackPlateau') +
        '</div><div class="mid">' +
        fmt(tp.lo, 1) +
        ' \u2013 ' +
        fmt(tp.hi, 1) +
        '</div>' +
        '<div class="badge ' +
        (anchorInT ? 'ok' : 'warn') +
        '">' +
        t(anchorInT ? 'plateauIn' : 'plateauOut') +
        '</div></div>' +
        '</div>' +
        (ovHi >= ovLo
          ? '<div class="muted">' +
            t('overlap') +
            ' <b>' +
            fmt(ovLo, 1) +
            ' \u2013 ' +
            fmt(ovHi, 1) +
            '</b> cm/360</div>'
          : '<div class="muted">' + t('noOverlap') + '</div>') +
        '<div class="muted">' +
        t('paperBand') +
        '</div></div>';
    } else if (p) {
      const anchorIn = report.anchorCm360 >= p.lo * 0.95 && report.anchorCm360 <= p.hi * 1.05;
      html +=
        '<div class="card main-card"><div class="card-title">' +
        t('globalOpt') +
        '</div>' +
        '<div class="big">' +
        fmt(p.lo, 1) +
        ' \u2013 ' +
        fmt(p.hi, 1) +
        ' cm/360</div>' +
        '<div class="muted">' +
        t('plateauFlat') +
        '</div>' +
        '<div class="muted">' +
        t('optCenter') +
        ' <b>' +
        fmt(p.bestCm360, 1) +
        '</b> cm/360' +
        (g && g.ci
          ? ' · ' +
            t('confidence') +
            ' [' +
            fmt(Math.min(g.ci[0], g.ci[1]), 1) +
            '\u2013' +
            fmt(Math.max(g.ci[0], g.ci[1]), 1) +
            ']'
          : '') +
        (g && g.method === 'empirical' ? ' · ' + t('noFit') : '') +
        '</div>' +
        '<div class="badge ' +
        (anchorIn ? 'ok' : 'warn') +
        '">' +
        t('currentSetup') +
        ' ' +
        fmt(report.anchorCm360, 1) +
        ' cm/360 — ' +
        t(anchorIn ? 'plateauIn' : 'plateauOut') +
        '</div>' +
        '<div class="muted">' +
        t('paperBand') +
        '</div></div>';
    } else if (gCenter != null && hasFlickData) {
      const inR = SZ.analysis.inInterval(report.anchorCm360, g);
      html +=
        '<div class="card main-card"><div class="card-title">' +
        t('globalOpt') +
        '</div>' +
        '<div class="big">' +
        fmt(g.ci ? g.ci[0] : gCenter, 1) +
        ' \u2013 ' +
        fmt(g.ci ? g.ci[1] : gCenter, 1) +
        ' cm/360</div>' +
        '<div class="muted">' +
        t('optCenter') +
        ' <b>' +
        fmt(gCenter, 1) +
        '</b> cm/360 · ' +
        t('confidence') +
        (g.method === 'empirical' ? ' · ' + t('noFit') : '') +
        '</div>' +
        '<div class="badge ' +
        (inR ? 'ok' : 'warn') +
        '">' +
        t('currentSetup') +
        ' ' +
        fmt(report.anchorCm360, 1) +
        ' cm/360 — ' +
        t(inR ? 'inRange' : 'outRange') +
        '</div>' +
        '<div class="muted">' +
        t('paperBand') +
        '</div></div>';
    } else if (report.track && report.track.global && report.track.global.optCm360 != null) {
      const tg = report.track.global;
      const tpIn =
        report.track.plateau &&
        report.anchorCm360 >= report.track.plateau.lo * 0.95 &&
        report.anchorCm360 <= report.track.plateau.hi * 1.05;
      const inR =
        tpIn != null
          ? tpIn
          : report.anchorCm360 >= Math.min(tg.optCm360, tg.ci ? tg.ci[0] : tg.optCm360) &&
            report.anchorCm360 <= Math.max(tg.optCm360, tg.ci ? tg.ci[1] : tg.optCm360);
      html +=
        '<div class="card main-card"><div class="card-title">' +
        t('trackGlobalOpt') +
        '</div>' +
        '<div class="big">' +
        fmt(tg.ci ? tg.ci[0] : tg.optCm360, 1) +
        ' \u2013 ' +
        fmt(tg.ci ? tg.ci[1] : tg.optCm360, 1) +
        ' cm/360</div>' +
        '<div class="muted">' +
        t('optCenter') +
        ' <b>' +
        fmt(tg.optCm360, 1) +
        '</b> cm/360' +
        (tg.ci ? ' · ' + t('confidence') : '') +
        (tg.method === 'empirical' ? ' · ' + t('noFit') : '') +
        '</div>' +
        '<div class="badge ' +
        (inR ? 'ok' : 'warn') +
        '">' +
        t('currentSetup') +
        ' ' +
        fmt(report.anchorCm360, 1) +
        ' cm/360 — ' +
        t(inR ? 'inRange' : 'outRange') +
        '</div>' +
        '<div class="muted">' +
        t('paperBand') +
        '</div></div>';
    } else {
      html +=
        '<div class="card"><div class="card-title">' +
        t('globalOpt') +
        '</div><div class="muted">' +
        t('insufficient') +
        '</div></div>';
    }

    if (hasFlickData) {
      html += '<div class="bucket-row">';
      for (const name of ['low', 'mid', 'high']) {
        const f = report.buckets[name];
        html += '<div class="card"><div class="card-title">' + report.bucketLabel[name] + '</div>';
        if (f && f.optCm360 != null) {
          html +=
            '<div class="mid">' +
            fmt(f.ci ? f.ci[0] : f.optCm360, 1) +
            ' \u2013 ' +
            fmt(f.ci ? f.ci[1] : f.optCm360, 1) +
            ' cm/360</div>';
          if (report.settings.yaw) {
            const sCm = f.optCm360;
            const gs = SZ.math.sensFromCm360(report.settings.yaw, report.settings.dpi, sCm);
            html +=
              '<div class="muted">' +
              SZ.math.GAMES[report.settings.game].name +
              ' \u2248 <b>' +
              gs.toFixed(3) +
              '</b></div>';
          }
        } else {
          html += '<div class="muted">' + t('insufficient') + '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }

    const trackUsable = !!(report.track && report.track.reliable);
    if (report.track && hasFlickData && trackUsable) {
      html +=
        '<div class="card"><div class="card-title">' +
        t('combinedTitle') +
        '</div>' +
        '<div class="slider-row"><span>' +
        t('flickWeight') +
        '</span>' +
        '<input id="weight-slider" type="range" min="0" max="100" value="50" step="5">' +
        '<span>' +
        t('trackWeight') +
        '</span></div>' +
        '<div id="combined-out" class="big"></div>' +
        '<div id="combined-conv"></div>' +
        '<div class="muted accent">' +
        t('roleNote') +
        '</div>' +
        (report.plateau &&
        report.anchorCm360 >= report.plateau.lo * 0.95 &&
        report.anchorCm360 <= report.plateau.hi * 1.05
          ? '<div class="muted accent">' + t('combinedAnchorNote') + '</div>'
          : '') +
        '<div class="muted">' +
        t('combinedNote') +
        '</div></div>';
    } else if (report.track && hasFlickData && !trackUsable) {
      html +=
        '<div class="card"><div class="card-title">' +
        t('combinedTitle') +
        '</div>' +
        '<div class="muted">' +
        t('trackUnreliable') +
        '</div></div>';
    } else if (report.track && report.track.global && report.track.global.optCm360 != null) {
      const tcm = report.track.global.optCm360;
      const rows = [];
      for (const gid of ['cs2', 'valorant', 'overwatch', 'apex']) {
        const gm = SZ.math.GAMES[gid];
        const gs = SZ.math.sensFromCm360(gm.yaw, report.settings.dpi, tcm);
        rows.push(
          '<tr><td>' +
            gm.name +
            '</td><td><b>' +
            gs.toFixed(gm.yaw < 0.01 ? 3 : 4) +
            '</b></td><td>' +
            fmt(SZ.math.edpi(report.settings.dpi, gs), 0) +
            '</td></tr>',
        );
      }
      html +=
        '<div class="card"><div class="card-title">' +
        t('conversions') +
        '</div>' +
        table(rows.join(''), [t('gameCol'), t('sensCol'), t('edpiCol')]) +
        '</div>';
    } else if (!report.track && gCenter != null) {
      const rows = [];
      for (const gid of ['cs2', 'valorant', 'overwatch', 'apex']) {
        const gm = SZ.math.GAMES[gid];
        const gs = SZ.math.sensFromCm360(gm.yaw, report.settings.dpi, gCenter);
        rows.push(
          '<tr><td>' +
            gm.name +
            '</td><td><b>' +
            gs.toFixed(gm.yaw < 0.01 ? 3 : 4) +
            '</b></td><td>' +
            fmt(SZ.math.edpi(report.settings.dpi, gs), 0) +
            '</td></tr>',
        );
      }
      html +=
        '<div class="card"><div class="card-title">' +
        t('conversions') +
        '</div>' +
        table(rows.join(''), [t('gameCol'), t('sensCol'), t('edpiCol')]) +
        '</div>';
    }

    if (hasFlickData) {
      html +=
        '<div class="card"><div class="card-title">' +
        t('chartMt') +
        '</div><canvas id="chart-mt" class="chart"></canvas></div>';
    }
    if (report.track) {
      html +=
        '<div class="card"><div class="card-title">' +
        t('chartTrack') +
        '</div><canvas id="chart-track" class="chart"></canvas></div>';
    }
    if (hasFlickData) {
      html +=
        '<div class="card"><div class="card-title">' +
        t('chartDiag') +
        '</div><canvas id="chart-diag" class="chart"></canvas></div>';
    }

    if (hasFlickData) {
      const rows = report.conds.map(
        (c) =>
          '<tr><td>' +
          fmt(c.cm360, 1) +
          '</td><td>' +
          (c.hitRate * 100).toFixed(0) +
          '%</td><td>' +
          (c.adjMT != null ? Math.round(c.adjMT) : c.meanMT != null ? Math.round(c.meanMT) : '-') +
          '</td><td>' +
          (c.sdMT != null ? Math.round(c.sdMT) : '-') +
          '</td><td>' +
          (c.meanTp != null ? c.meanTp.toFixed(2) : '-') +
          '</td><td>' +
          (c.meanSubmov != null ? c.meanSubmov.toFixed(2) : '-') +
          '</td><td>' +
          (c.meanSwip != null ? c.meanSwip.toFixed(2) : '-') +
          '</td><td>' +
          (c.overshootRate != null ? (c.overshootRate * 100).toFixed(0) + '%' : '-') +
          '</td><td>' +
          (c.used ? '' : t('lowConfidence')) +
          '</td></tr>',
      );
      let styleLine = '';
      if (report.flickStyle) {
        const s = report.flickStyle;
        const label =
          s.style === 'swipe'
            ? t('styleSwipe')
            : s.style === 'land'
              ? t('styleLand')
              : t('styleMixed');
        styleLine =
          '<div class="muted accent">' +
          t('flickStyle') +
          ': <b>' +
          label +
          '</b> (swipiness ' +
          s.meanSwip.toFixed(2) +
          ')</div>';
      }
      html +=
        '<div class="card"><div class="card-title">' +
        t('discardedNote') +
        '</div>' +
        table(rows.join(''), [
          'cm/360',
          t('hitRateShort'),
          t('adjMtShort') + ' ms*',
          t('sdShort') + ' ms',
          t('tpShort'),
          t('subShort'),
          t('swipShort'),
          t('overShort'),
          '',
        ]) +
        '<div class="muted">* ' +
        t('adjNote') +
        '</div>' +
        styleLine +
        '<div class="muted">' +
        t('swipNote') +
        '</div></div>';

      const hasPhases = report.conds.some((c) => c.meanVerify != null);
      if (hasPhases) {
        const prows = report.conds.map(
          (c) =>
            '<tr><td>' +
            fmt(c.cm360, 1) +
            '</td><td>' +
            (c.adjMT != null ? Math.round(c.adjMT) : '-') +
            '</td><td>' +
            (c.meanVerify != null ? Math.round(c.meanVerify) : '-') +
            '</td><td>' +
            (c.meanPause != null ? Math.round(c.meanPause) : '-') +
            '</td></tr>',
        );
        html +=
          '<div class="card"><div class="card-title">' +
          t('phaseTitle') +
          '</div>' +
          table(prows.join(''), [
            'cm/360',
            t('adjMtShort') + ' ms*',
            t('verifyShort') + ' ms',
            t('pauseShort') + ' ms',
          ]) +
          '<div class="muted">' +
          t('phaseNote') +
          '</div></div>';
      }
    }

    if (report.track) {
      const trows = report.track.conds.map(
        (c) =>
          '<tr><td>' +
          fmt(c.cm360, 1) +
          '</td><td>' +
          (c.rms != null ? c.rms.toFixed(2) + '\u00b0' : '-') +
          '</td><td>' +
          (c.onTargetPct != null ? (c.onTargetPct * 100).toFixed(0) + '%' : '-') +
          '</td><td>' +
          (c.lagMs != null ? Math.round(c.lagMs) + ' ms' : '-') +
          '</td></tr>',
      );
      const lags = report.track.conds.map((c) => c.lagMs).filter((v) => v != null);
      let lagLine = '';
      if (lags.length) {
        const meanLag = lags.reduce((s, v) => s + v, 0) / lags.length;
        lagLine =
          '<div class="muted accent">' +
          t('trackLagSummary', { lag: Math.round(meanLag) }) +
          '</div>';
      }
      html +=
        '<div class="card"><div class="card-title">' +
        t('trackDetail') +
        '</div>' +
        table(trows.join(''), ['cm/360', t('trackRms'), t('trackOnTarget'), t('trackLag')]) +
        lagLine +
        '<div class="muted">' +
        t('trackLagNote') +
        '</div></div>';
    }

    if (report.warnings.length) {
      html +=
        '<div class="card warn-card"><div class="card-title">' +
        t('warnings') +
        '</div><ul>' +
        report.warnings.map((w) => '<li>' + SZ.i18n.t(w.key, w.vars) + '</li>').join('') +
        '</ul></div>';
    }

    if (report.settings.padWidthCm) {
      const half = gCenter != null ? gCenter / 2 : report.anchorCm360 / 2;
      const pct = (half / report.settings.padWidthCm) * 100;
      html +=
        '<div class="card"><div class="card-title">' +
        t('constraint') +
        '</div><div class="muted">' +
        (pct <= 45
          ? t('constraintOk', { d: fmt(half, 1), p: fmt(pct, 0) })
          : t('constraintBad', { d: fmt(half, 1), p: fmt(pct, 0) })) +
        '</div></div>';
    } else {
      html +=
        '<div class="card"><div class="card-title">' +
        t('constraint') +
        '</div><div class="muted">' +
        t('constraintSkip') +
        '</div></div>';
    }

    html +=
      '<div class="card"><div class="card-title">' +
      t('methodNote') +
      '</div><div class="muted">' +
      t('methodText') +
      '</div>' +
      '<div class="muted accent">' +
      t('dataUseNote') +
      '</div></div>';

    html +=
      '<div class="btn-row"><button id="btn-retry" class="primary">' +
      t('retryBtn') +
      '</button>' +
      '<button id="btn-back">' +
      t('backMenu') +
      '</button>' +
      (records ? '<button id="btn-export">' + t('exportBtn') + '</button>' : '') +
      (records ? '<button id="btn-export-png">' + t('exportPngBtn') + '</button>' : '') +
      '</div>';

    els.report.innerHTML = html;
    els.menu.classList.add('hidden');
    els.hud.classList.add('hidden');
    els.report.classList.remove('hidden');

    const mtCanvas = $('chart-mt');
    const diagCanvas = $('chart-diag');
    const trackCanvas = $('chart-track');
    if (mtCanvas) SZ.charts.drawMtChart(mtCanvas, report);
    if (diagCanvas) SZ.charts.drawDiagChart(diagCanvas, report);
    if (trackCanvas) SZ.charts.drawTrackChart(trackCanvas, report);

    const retry = $('btn-retry');
    if (retry)
      retry.onclick = () => {
        showMenu();
      };
    const back = $('btn-back');
    if (back)
      back.onclick = () => {
        showMenu();
      };
    const exp = $('btn-export');
    if (exp)
      exp.onclick = () => {
        const blob = new Blob(
          [JSON.stringify({ report, records, trackResults: trackResults || [] }, null, 2)],
          { type: 'application/json' },
        );
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'senszone-report-' + report.ts + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      };
    const expPng = $('btn-export-png');
    if (expPng)
      expPng.onclick = () => {
        try {
          const slider = $('weight-slider');
          const pre = slider
            ? { combinedCm: combinedCm360(report, Number(slider.value)) }
            : { combinedCm: combinedCm360(report, 50) };
          const canvas = SZ.reportImage.draw(report, records, trackResults, pre);
          canvas.toBlob((blob) => {
            if (!blob) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'senszone-report-' + report.ts + '.png';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          }, 'image/png');
        } catch (e) {
          /* 导出失败静默 */
        }
      };

    if (report.track && hasFlickData && trackUsable) {
      try {
        const slider = $('weight-slider');
        const out = $('combined-out');
        const conv = $('combined-conv');
        const renderCombined = () => {
          const cm = combinedCm360(report, 100 - parseInt(slider.value, 10));
          if (cm == null) {
            out.textContent = t('insufficient');
            conv.innerHTML = '';
            return;
          }
          out.textContent = fmt(cm, 1) + ' cm/360';
          let rows = '';
          for (const gid of ['cs2', 'valorant', 'overwatch', 'apex']) {
            const gm = SZ.math.GAMES[gid];
            const gs = SZ.math.sensFromCm360(gm.yaw, report.settings.dpi, cm);
            rows +=
              '<tr><td>' +
              gm.name +
              '</td><td><b>' +
              gs.toFixed(gm.yaw < 0.01 ? 3 : 4) +
              '</b></td><td>' +
              fmt(SZ.math.edpi(report.settings.dpi, gs), 0) +
              '</td></tr>';
          }
          conv.innerHTML = table(rows, [t('gameCol'), t('sensCol'), t('edpiCol')]);
        };
        slider.addEventListener('input', renderCombined);
        renderCombined();
      } catch (_) {}
    }
  }

  function bindCommon(onChanged) {
    [
      els.inGame,
      els.inAspect,
      els.inDpi,
      els.inSens,
      els.inTrials,
      els.inPad,
      els.inLang,
      els.inFov,
      els.inTaskMode,
    ].forEach((el) => {
      el.addEventListener('change', () => {
        const isCustom = els.inGame.value === 'custom';
        els.rowCustomFov.classList.toggle('hidden', !isCustom);
        els.rowCustomYaw.classList.toggle('hidden', !isCustom);
        saveSettings(readSettings());
        applyLang();
        if (onChanged) onChanged();
      });
    });
    els.inFullscreen.addEventListener('change', () => saveSettings(readSettings()));
  }

  SZ.ui = {
    cacheEls,
    readSettings,
    saveSettings,
    loadSettings,
    updatePreview,
    applyLang,
    showMenu,
    showTesting,
    showPause,
    hidePause,
    countdown,
    hideCountdown,
    setCondition,
    setTrial,
    setProgress,
    feedback,
    setRawStatus,
    showReport,
    renderHistory,
    bindCommon,
    initAudio,
    centersOf,
    combinedCm360,
    historyRowValue,
  };
})(
  typeof window !== 'undefined'
    ? (window.SZ = window.SZ || {})
    : (globalThis.SZ = globalThis.SZ || {}),
);
