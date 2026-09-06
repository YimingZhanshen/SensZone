(function (SZ) {
  'use strict';

  const canvas = document.getElementById('scene');
  SZ.render.init(canvas);
  SZ.input.init(canvas);
  SZ.ui.cacheEls();
  SZ.ui.loadSettings();

  let cam = { az: 0, el: 0 };
  let currentK = 0.0176;
  let session = null;
  let paused = false;
  let pauseStart = 0;

  let task = SZ.taskFlick.createFlickTask({
    getCamera: () => cam,
    resetCamera: () => {
      cam.az = 0;
      cam.el = 0;
    },
    onHud: () => {},
    onFeedback: (kind, mt) => SZ.ui.feedback(kind, mt),
    onTrialComplete: (record, kind) => {
      if (session) session.onTrialComplete(record, kind);
    },
    onNeedNextTrial: () => {
      if (session) session.requestNextTrial();
    },
    onTrialAborted: () => {
      if (session) session.requestNextTrial();
    },
    onTrialStart: () => {},
  });

  let trackTask = SZ.taskTrack.createTrackTask({
    getCamera: () => cam,
    onHud: () => {},
    onProgress: (frac) => SZ.ui.setProgress(1 - frac),
    onTrackComplete: (result, kind) => {
      if (session) session.onTrackComplete(result, kind);
    },
    onNeedNextTrack: () => {
      if (session) session.requestNextTrack();
    },
  });

  window.addEventListener('resize', () => SZ.render.resize());

  SZ.input.on('move', (m) => {
    if (!SZ.input.isLocked()) return;
    cam.az += m.dx * currentK;
    cam.el = SZ.math.clamp(cam.el - m.dy * currentK, -85, 85);
  });

  SZ.input.on('click', () => task.onClick());

  SZ.input.on('lockLost', () => {
    if (!session) return;
    const st = session.getState();
    if (st === 'finished' || st === 'idle') return;
    paused = true;
    pauseStart = performance.now();
    session.pause();
    SZ.ui.showPause();
  });

  function applyConditionK(cond) {
    currentK = cond.gameSens * SZ.math.GAMES[gameOf()].yaw;
  }

  function gameOf() {
    return session ? session.settings.game : 'cs2';
  }

  let idleTick = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!session) {
      idleTick++;
      if (idleTick % 10 !== 0) return;
    }
    if (!paused) {
      if (session) session.update(now);
      task.update(now);
      trackTask.update(now);
    }
    const trackActive = trackTask.getPhase() !== 'idle';
    const scene = trackActive ? trackTask.getScene() : task.getScene();
    if (!trackActive) SZ.ui.setProgress(task.getFlightProgress(now));
    SZ.render.setCamera(cam.az, cam.el);
    SZ.render.drawScene(scene, now);
  }
  requestAnimationFrame(frame);

  async function beginWithSession(saved) {
    const settings = saved ? saved.settings : SZ.ui.readSettings();
    if (!saved) SZ.ui.saveSettings(settings);
    SZ.ui.showTesting();
    if (settings.fullscreen && !document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
      } catch (_) {}
    }
    const mode = await SZ.input.lock();
    SZ.ui.setRawStatus(mode);
    SZ.ui.initAudio();
    const hooks = {
      onCountdown: (cond, sec) => SZ.ui.countdown(cond, sec),
      onCountdownEnd: () => SZ.ui.hideCountdown(),
      onConditionBegin: (cond, warmup, kind) => {
        applyConditionK(cond);
        if (kind !== 'track') {
          cam.az = 0;
          cam.el = 0;
        }
        SZ.ui.setCondition(cond, warmup, kind);
      },
      onTrialStart: (spec, i, total) => SZ.ui.setTrial(i, total),
      startTrial: (spec, kind) => task.startTrial(spec, kind),
      startTrackRun: (cond, kind, seed, durationS) =>
        trackTask.startRun(cond, kind, seed, durationS),
      onTrialComplete: (record, kind) => {
        if (session) session.onTrialComplete(record, kind);
      },
      onNeedNextTrial: () => {
        if (session) session.requestNextTrial();
      },
      onFeedback: (kind, mt) => SZ.ui.feedback(kind, mt),
      onHud: () => {},
      onSessionComplete: (records, trackResults) => finishSession(records, trackResults, settings),
    };
    session = SZ.session.createSession(settings, hooks);
    session.settings = settings;
    if (saved) session.resume(saved);
    else session.startWarmup();
  }

  function finishSession(records, trackResults, settings) {
    paused = false;
    session = null;
    task.reset();
    trackTask.reset();
    SZ.input.unlock();
    const report = SZ.analysis.analyze(records, settings, { rawMode: SZ.input.getRawMode() });
    report.track = SZ.analysis.analyzeTrack(trackResults, settings);
    saveHistory(report);
    SZ.ui.showReport(report, records, trackResults);
  }

  function saveHistory(report) {
    try {
      const hist = JSON.parse(localStorage.getItem('sz.history.v1') || '[]');
      hist.unshift({ ts: report.ts, report });
      localStorage.setItem('sz.history.v1', JSON.stringify(hist.slice(0, 20)));
    } catch (_) {}
  }

  document.getElementById('btn-start').addEventListener('click', async () => {
    if (session) return;
    beginWithSession(null);
  });

  document.getElementById('btn-resume').addEventListener('click', async () => {
    SZ.ui.hidePause();
    const mode = await SZ.input.lock();
    SZ.ui.setRawStatus(mode);
    if (SZ.input.isLocked() && session) {
      const delta = performance.now() - pauseStart;
      task.addPauseTime(delta);
      trackTask.addPauseTime(delta);
      paused = false;
      session.resumeSession();
    } else {
      SZ.ui.showPause();
    }
  });

  document.getElementById('btn-abort').addEventListener('click', () => {
    if (session) session.abort();
    session = null;
    paused = false;
    task.reset();
    trackTask.reset();
    SZ.input.unlock();
    SZ.ui.hidePause();
    SZ.ui.showMenu();
  });

  function checkResume() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('sz.session.v1') || 'null');
    } catch (_) {}
    const row = document.getElementById('resume-row');
    if (saved && saved.settings && saved.settings.sessionId) {
      const mode = saved.settings.taskMode || 'flick';
      const flickLeft = mode !== 'track' && saved.completed && saved.completed.length < 6;
      const trackLeft = mode !== 'flick' && !saved.trackDone;
      if (flickLeft || trackLeft) {
        row.classList.remove('hidden');
        document.getElementById('btn-resume-session').onclick = () => {
          row.classList.add('hidden');
          beginWithSession(saved);
        };
        document.getElementById('btn-discard').onclick = () => {
          try {
            localStorage.removeItem('sz.session.v1');
          } catch (_) {}
          row.classList.add('hidden');
        };
        return;
      }
    }
    row.classList.add('hidden');
  }

  SZ.ui.bindCommon(checkResume);
  SZ.ui.applyLang();
  checkResume();
})(
  typeof window !== 'undefined'
    ? (window.SZ = window.SZ || {})
    : (globalThis.SZ = globalThis.SZ || {}),
);
