(function (SZ) {
  'use strict';

  const MULTS = [0.3, 0.4444, 0.6667, 1.0, 1.5, 2.25];
  const WIDTHS = [9.15, 4.59, 2.29, 1.15, 0.57];
  const BANDS = [
    { azMin: 7, azMax: 9, elMax: 1.0 },
    { azMin: 9, azMax: 11.7, elMax: 1.3 },
    { azMin: 11.7, azMax: 15, elMax: 1.7 },
    { azMin: 15, azMax: 19.4, elMax: 2.2 },
    { azMin: 19.4, azMax: 25, elMax: 2.8 }
  ];
  const WARMUP_TRIALS = 10;
  const TRACK_WARMUP_S = 5;
  const COUNTDOWN_MS = 3000;

  function buildConditions(settings) {
    const anchorCm = SZ.math.cm360(settings.yaw, settings.sens, settings.dpi);
    const anchorDpm = SZ.math.degPerMm(anchorCm);
    return MULTS.map((m, i) => {
      const dpm = SZ.math.clamp(anchorDpm * m, 0.2, 12);
      const cm = SZ.math.cmFromDegPerMm(dpm);
      return {
        idx: i,
        mult: m,
        dpm,
        cm360: cm,
        gameSens: SZ.math.sensFromCm360(settings.yaw, settings.dpi, cm),
        seed: (settings.sessionId + i * 7919) >>> 0
      };
    });
  }

  const ROW_W = [0.10, 0.18, 0.30, 0.26, 0.16];

  function makeTrialSpec(cond, trialIdx) {
    const rng = SZ.math.mulberry32((cond.seed ^ Math.imul(trialIdx + 1, 2246822519)) >>> 0);
    const r1 = rng();
    let acc = 0;
    let row = 4;
    for (let i = 0; i < 5; i++) {
      acc += ROW_W[i];
      if (r1 < acc) { row = i; break; }
    }
    const col = Math.floor(rng() * 5);
    const band = BANDS[row];
    const w = WIDTHS[col];
    const azMag = band.azMin + (band.azMax - band.azMin) * rng();
    const az = (rng() < 0.5 ? -1 : 1) * azMag;
    const el = band.elMax * rng();
    const D = SZ.math.greatCircleDeg(0, 0, az, el);
    return {
      condId: cond.idx,
      cond,
      trialIdx,
      az,
      el,
      radDeg: w / 2,
      widthDeg: w,
      idBits: SZ.math.indexOfDifficulty(D, w)
    };
  }

  function createSession(settings, hooks) {
    const conds = buildConditions(settings);
    const mode = settings.taskMode === 'both' || settings.taskMode === 'track' ? settings.taskMode : 'flick';
    const hasFlick = mode !== 'track';
    const hasTrack = mode !== 'flick';
    const order = SZ.math.shuffle(conds.map(c => c.idx), SZ.math.mulberry32(settings.sessionId >>> 0));

    let records = [];
    let trackResults = [];
    let completed = [];
    let trackDone = false;
    let state = 'idle';
    let phase = 'flick';
    let pos = -1;
    let trackPos = -1;
    let trialPos = 0;
    let countdownEnd = 0;
    let pending = null;
    let currentCond = null;
    let pausedRemaining = 0;
    let warmup = false;

    function persist() {
      try {
        localStorage.setItem('sz.session.v1', JSON.stringify({
          v: 2,
          sessionId: settings.sessionId,
          settings: SZ.session.exportSettings(settings),
          order,
          completed,
          records,
          trackResults,
          trackDone
        }));
      } catch (_) {}
    }

    function start() {
      pos = -1;
      trackPos = -1;
      records = [];
      trackResults = [];
      completed = [];
      trackDone = false;
      beginFlickOrTrack();
    }

    function beginFlickOrTrack() {
      if (hasFlick) {
        phase = 'flick';
        nextCondition();
      } else {
        phase = 'track';
        startTrackWarmup();
      }
    }

    function resume(saved) {
      records = saved.records || [];
      trackResults = saved.trackResults || [];
      completed = saved.completed || [];
      trackDone = !!saved.trackDone;
      order.splice(0, order.length, ...(saved.order || order));
      if (hasFlick && completed.length < order.length) {
        phase = 'flick';
        pos = -1;
        for (let i = 0; i < order.length; i++) {
          if (!completed.includes(order[i])) { pos = i - 1; break; }
        }
        nextCondition();
        return;
      }
      if (hasTrack && !trackDone) {
        phase = 'track';
        startTrackWarmup();
        return;
      }
      finishSession();
    }

    function nextCondition() {
      pos++;
      if (pos >= order.length || !hasFlick) {
        if (hasTrack && !trackDone) {
          phase = 'track';
          startTrackWarmup();
        } else {
          finishSession();
        }
        return;
      }
      currentCond = conds[order[pos]];
      trialPos = 0;
      state = 'countdown';
      pending = 'flick';
      countdownEnd = performance.now() + COUNTDOWN_MS;
      hooks.onCountdown(currentCond, COUNTDOWN_MS / 1000);
    }

    function startTrackWarmup() {
      phase = 'track';
      warmup = true;
      currentCond = conds.find(c => c.mult === 1.0);
      state = 'testing';
      hooks.onConditionBegin(currentCond, true, 'track');
      hooks.startTrackRun(currentCond, 'warmup', (settings.sessionId ^ 0x9e3779b9) >>> 0, TRACK_WARMUP_S);
    }

    function beginConditionTrials() {
      state = 'testing';
      trialPos = 0;
      warmup = false;
      hooks.onConditionBegin(currentCond, false, 'flick');
      requestNextTrial();
    }

    function beginTrackRun() {
      state = 'testing';
      warmup = false;
      hooks.onConditionBegin(currentCond, false, 'track');
      hooks.startTrackRun(currentCond, 'test', settings.sessionId >>> 0, SZ.taskTrack.DURATION_S);
    }

    function startWarmup() {
      if (hasFlick) {
        phase = 'flick';
        warmup = true;
        currentCond = conds.find(c => c.mult === 1.0);
        state = 'testing';
        hooks.onConditionBegin(currentCond, true, 'flick');
        requestNextTrial();
      } else {
        startTrackWarmup();
      }
    }

    function requestNextTrial() {
      if (phase !== 'flick' || state !== 'testing') return;
      const total = warmup ? WARMUP_TRIALS : settings.trialsPerCond;
      if (trialPos >= total) {
        endCondition();
        return;
      }
      const spec = makeTrialSpec(currentCond, trialPos);
      spec.sens = {
        dpm: currentCond.dpm,
        cm360: currentCond.cm360,
        gameSens: currentCond.gameSens
      };
      trialPos++;
      hooks.onTrialStart(spec, trialPos, total);
      hooks.startTrial(spec, warmup ? 'warmup' : 'test');
    }

    function requestNextTrack() {
      if (phase !== 'track' || state !== 'testing') return;
      if (warmup) {
        trackPos = -1;
        advanceTrack();
        return;
      }
      advanceTrack();
    }

    function advanceTrack() {
      trackPos++;
      if (trackPos >= order.length) {
        trackDone = true;
        persist();
        finishSession();
        return;
      }
      currentCond = conds[order[trackPos]];
      state = 'countdown';
      pending = 'track';
      countdownEnd = performance.now() + COUNTDOWN_MS;
      hooks.onCountdown(currentCond, COUNTDOWN_MS / 1000);
    }

    function endCondition() {
      if (warmup) {
        warmup = false;
        state = 'idle';
        nextCondition();
      } else {
        completed.push(currentCond.idx);
        persist();
        nextCondition();
      }
    }

    function onTrialComplete(record, kind) {
      if (kind !== 'warmup') records.push(record);
    }

    function onTrackComplete(result, kind) {
      if (kind !== 'warmup') trackResults.push(result);
    }

    function update(now) {
      if (state === 'countdown') {
        const remain = (countdownEnd - now) / 1000;
        hooks.onCountdown(currentCond, Math.max(0, remain));
        if (now >= countdownEnd) {
          hooks.onCountdownEnd();
          if (pending === 'track') beginTrackRun();
          else beginConditionTrials();
        }
      }
    }

    function pause() {
      if (state === 'countdown') {
        pausedRemaining = (countdownEnd - performance.now()) / 1000;
      }
    }

    function resumeSession() {
      if (state === 'countdown') {
        countdownEnd = performance.now() + Math.max(800, pausedRemaining * 1000);
      }
    }

    function abort() {
      state = 'idle';
      try { localStorage.removeItem('sz.session.v1'); } catch (_) {}
    }

    function finishSession() {
      state = 'finished';
      try { localStorage.removeItem('sz.session.v1'); } catch (_) {}
      hooks.onSessionComplete(records.slice(), trackResults.slice());
    }

    function getState() { return state; }
    function getPhase() { return phase; }
    function getCurrentCond() { return currentCond; }
    function getProgress() {
      return {
        condPos: pos + 1,
        condTotal: order.length,
        condIdx: currentCond ? currentCond.idx : null,
        trialPos,
        trialsTotal: warmup ? WARMUP_TRIALS : settings.trialsPerCond,
        warmup,
        phase
      };
    }

    return {
      start, startWarmup, resume, update, pause, resumeSession, abort,
      onTrialComplete, onTrackComplete, persist, getState, getPhase, getCurrentCond, getProgress,
      requestNextTrial, requestNextTrack, order, conds
    };
  }

  function exportSettings(s) {
    return {
      game: s.game, aspect: s.aspect, customFov: s.customFov,
      dpi: s.dpi, sens: s.sens, yaw: s.yaw,
      trialsPerCond: s.trialsPerCond, padWidthCm: s.padWidthCm,
      taskMode: s.taskMode || 'flick',
      sessionId: s.sessionId
    };
  }

  SZ.session = { createSession, buildConditions, makeTrialSpec, exportSettings, MULTS, WIDTHS, BANDS, ROW_W, WARMUP_TRIALS, COUNTDOWN_MS };
})(typeof window !== 'undefined' ? (window.SZ = window.SZ || {}) : (globalThis.SZ = globalThis.SZ || {}));
