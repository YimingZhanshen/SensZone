globalThis.window = globalThis;
const fs = require('fs');
const path = require('path');

const FAKE = { now: 1000 };
globalThis.performance = { now: () => FAKE.now };

function load(f) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  eval(code);
}
[
  'math.js',
  'kinematics.js',
  'stats.js',
  'task-flick.js',
  'task-track.js',
  'session.js',
  'analysis.js',
].forEach(load);
const SZ = globalThis.SZ;

let failures = 0;
function ok(cond, name) {
  if (cond) console.log('PASS ' + name);
  else {
    console.log('FAIL ' + name);
    failures++;
  }
}

const settings = {
  game: 'cs2',
  aspect: 4 / 3,
  customFov: 90,
  dpi: 800,
  sens: 1.15,
  yaw: 0.022,
  trialsPerCond: 4,
  padWidthCm: 45,
  sessionId: 777,
};

const cam = { az: 0, el: 0 };
let lastSpec = null;
let records = [];
let finished = false;
let condBegins = 0;
let error = null;

const task = SZ.taskFlick.createFlickTask({
  getCamera: () => cam,
  onHud: () => {},
  onFeedback: () => {},
  onTrialComplete: (record, kind) => {
    if (kind !== 'warmup') records.push(record);
    if (session) session.onTrialComplete(record, kind);
  },
  onNeedNextTrial: () => {
    if (session) session.requestNextTrial();
  },
  onTrialStart: (spec) => {
    lastSpec = spec;
  },
});

const session = SZ.session.createSession(settings, {
  onCountdown: () => {},
  onCountdownEnd: () => {},
  onConditionBegin: () => {
    condBegins++;
  },
  onTrialStart: (spec) => {
    lastSpec = spec;
  },
  startTrial: (spec, kind) => task.startTrial(spec, kind),
  onTrialComplete: () => {},
  onNeedNextTrial: () => {
    if (session) session.requestNextTrial();
  },
  onFeedback: () => {},
  onHud: () => {},
  onSessionComplete: (recs) => {
    finished = true;
    records = recs;
  },
});
session.settings = settings;

session.startWarmup();

let iterations = 0;
let moveStart = -1;
try {
  while (!finished && iterations < 60000) {
    iterations++;
    FAKE.now += 16;
    const phase = task.getPhase();
    if ((phase === 'settle' || phase === 'waitmove') && lastSpec) {
      if (phase === 'waitmove' && moveStart < 0) moveStart = FAKE.now;
      if (moveStart >= 0) {
        const wait = FAKE.now - moveStart;
        if (wait > 400) {
          const p = Math.min(1, (wait - 400) / 250);
          cam.az = lastSpec.az * p;
          cam.el = lastSpec.el * p;
        }
      }
    } else if (phase === 'flight' && lastSpec) {
      const p = Math.min(1, (FAKE.now - moveStart - 400) / 250);
      cam.az = lastSpec.az * p;
      cam.el = lastSpec.el * p;
      if (p >= 1) {
        task.onClick();
        moveStart = -1;
      }
    } else {
      moveStart = -1;
      cam.az = 0;
      cam.el = 0;
    }
    session.update(FAKE.now);
    task.update(FAKE.now);
  }
} catch (e) {
  error = e;
}

if (error) {
  console.log('THROWN: ' + error.message);
  console.log(error.stack.split('\n').slice(0, 4).join('\n'));
  failures++;
}

ok(!error, 'full session runs without exception');
ok(
  finished,
  'session reaches finished state (iterations=' + iterations + ', records=' + records.length + ')',
);
ok(records.length === 24, '24 recorded trials (6 cond x 4), got ' + records.length);
ok(condBegins === 7, 'warmup + 6 conditions began, got ' + condBegins);
ok(
  records.every((r) => r.hit),
  'all simulated trials hit',
);
ok(
  records.every((r) => r.submovements != null),
  'submovements computed',
);
ok(
  records.every((r) => r.swipiness != null && r.swipiness > 0.4 && r.swipiness < 2.5),
  'swipiness computed in plausible range',
);
ok(
  records.every((r) => r.waitMs != null && r.waitMs >= 0),
  'waitMs recorded',
);
ok(
  records.every((r) => !r.missReason),
  'no miss reasons',
);

const report = SZ.analysis.analyze(records, settings, { rawMode: 'raw' });
ok(report && report.conds.length === 6, 'analysis produces report');

(function bothModeRun() {
  const cam3 = { az: 0, el: 0 };
  let recs3 = [];
  let tracks3 = [];
  let done3 = false;
  let spec3 = null;
  let moveStart3 = -1;
  const lagBuf = [];
  const task3 = SZ.taskFlick.createFlickTask({
    getCamera: () => cam3,
    resetCamera: () => {
      cam3.az = 0;
      cam3.el = 0;
    },
    onHud: () => {},
    onFeedback: () => {},
    onTrialComplete: (r, kind) => {
      if (kind !== 'warmup') recs3.push(r);
      if (s3) s3.onTrialComplete(r, kind);
    },
    onNeedNextTrial: () => {
      if (s3) s3.requestNextTrial();
    },
    onTrialStart: (spec) => {
      spec3 = spec;
    },
  });
  const track3 = SZ.taskTrack.createTrackTask({
    getCamera: () => cam3,
    onHud: () => {},
    onProgress: () => {},
    onTrackComplete: (r, kind) => {
      if (s3) s3.onTrackComplete(r, kind);
    },
    onNeedNextTrack: () => {
      if (s3) s3.requestNextTrack();
    },
  });
  const settings3 = { ...settings, trialsPerCond: 2, taskMode: 'both', sessionId: 999 };
  const s3 = SZ.session.createSession(settings3, {
    onCountdown: () => {},
    onCountdownEnd: () => {},
    onConditionBegin: () => {},
    onTrialStart: (spec) => {
      spec3 = spec;
    },
    startTrial: (spec, kind) => task3.startTrial(spec, kind),
    startTrackRun: (cond, kind, seed, dur) => track3.startRun(cond, kind, seed, dur),
    onTrialComplete: () => {},
    onTrackComplete: () => {},
    onNeedNextTrial: () => {
      if (s3) s3.requestNextTrial();
    },
    onNeedNextTrack: () => {
      if (s3) s3.requestNextTrack();
    },
    onFeedback: () => {},
    onHud: () => {},
    onSessionComplete: (recs, tracks) => {
      done3 = true;
      recs3 = recs;
      tracks3 = tracks;
    },
  });
  s3.settings = settings3;
  s3.startWarmup();
  let it = 0;
  let err3 = null;
  try {
    while (!done3 && it < 60000) {
      it++;
      FAKE.now += 16;
      if (track3.isRunning()) {
        const tp = track3.getTargetPos();
        lagBuf.push({ t: FAKE.now, az: tp.az, el: tp.el });
        while (lagBuf.length > 40) lagBuf.shift();
        let tgt = lagBuf[0];
        for (const s of lagBuf) {
          if (s.t <= FAKE.now - 100) tgt = s;
          else break;
        }
        cam3.az = tgt.az;
        cam3.el = tgt.el;
      } else {
        const ph = task3.getPhase();
        if ((ph === 'settle' || ph === 'waitmove') && spec3) {
          if (ph === 'waitmove' && moveStart3 < 0) moveStart3 = FAKE.now;
          if (moveStart3 >= 0) {
            const wait = FAKE.now - moveStart3;
            if (wait > 400) {
              const pp = Math.min(1, (wait - 400) / 250);
              cam3.az = spec3.az * pp;
              cam3.el = spec3.el * pp;
            }
          }
        } else if (ph === 'flight' && spec3) {
          const pp = Math.min(1, (FAKE.now - moveStart3 - 400) / 250);
          cam3.az = spec3.az * pp;
          cam3.el = spec3.el * pp;
          if (pp >= 1) {
            task3.onClick();
            moveStart3 = -1;
          }
        } else {
          moveStart3 = -1;
          cam3.az = 0;
          cam3.el = 0;
        }
      }
      s3.update(FAKE.now);
      task3.update(FAKE.now);
      track3.update(FAKE.now);
    }
  } catch (e) {
    err3 = e;
    console.log('THROWN(both run): ' + e.message);
    failures++;
  }
  ok(!err3 && done3, 'both-mode session completes');
  ok(recs3.length === 12, 'both-mode: 12 flick records (6 cond x 2), got ' + recs3.length);
  ok(tracks3.length === 6, 'both-mode: 6 track results, got ' + tracks3.length);
  ok(
    tracks3.every((r) => r.rms != null && r.rms < 5),
    'track RMS computed and small (follower): ' +
      (tracks3[0] && tracks3[0].rms && tracks3[0].rms.toFixed(2)),
  );
  const nearLag = tracks3.every((r) => Math.abs(r.lagMs - 100) < 45);
  ok(
    nearLag,
    'track lag ~100ms (driver lag), got ' +
      (tracks3[0] && tracks3[0].lagMs && tracks3[0].lagMs.toFixed(0)),
  );
  const rep3 = SZ.analysis.analyze(recs3, settings3, { rawMode: 'raw' });
  rep3.track = SZ.analysis.analyzeTrack(tracks3, settings3);
  ok(rep3.track != null, 'both-mode report has track section');
})();

(function missRun() {
  const cam2 = { az: 0, el: 0 };
  let recs2 = [];
  let done2 = false;
  const task2 = SZ.taskFlick.createFlickTask({
    getCamera: () => cam2,
    resetCamera: () => {
      cam2.az = 0;
      cam2.el = 0;
    },
    onHud: () => {},
    onFeedback: () => {},
    onTrialComplete: (r, kind) => {
      if (kind !== 'warmup') recs2.push(r);
      if (s2) s2.onTrialComplete(r, kind);
    },
    onNeedNextTrial: () => {
      if (s2) s2.requestNextTrial();
    },
    onTrialStart: () => {},
  });
  const s2 = SZ.session.createSession(
    { ...settings, sessionId: 888 },
    {
      onCountdown: () => {},
      onCountdownEnd: () => {},
      onConditionBegin: () => {},
      onTrialStart: () => {},
      startTrial: (spec, kind) => task2.startTrial(spec, kind),
      onTrialComplete: () => {},
      onNeedNextTrial: () => {
        if (s2) s2.requestNextTrial();
      },
      onFeedback: () => {},
      onHud: () => {},
      onSessionComplete: (r) => {
        done2 = true;
        recs2 = r;
      },
    },
  );
  s2.settings = { ...settings, sessionId: 888 };
  s2.startWarmup();
  let it = 0;
  try {
    while (!done2 && it < 60000) {
      it++;
      FAKE.now += 16;
      s2.update(FAKE.now);
      task2.update(FAKE.now);
    }
  } catch (e) {
    console.log('THROWN(miss run): ' + e.message);
    failures++;
  }
  ok(
    done2 && recs2.length === 24,
    'all-miss session completes with 24 records, got ' + recs2.length,
  );
  ok(
    recs2.every((r) => !r.hit),
    'all records are misses',
  );
  ok(
    recs2.every((r) => r.missReason === 'idle'),
    'all misses are idle skips',
  );
  const rep2 = SZ.analysis.analyze(recs2, { ...settings, sessionId: 888 }, { rawMode: 'raw' });
  ok(
    rep2.global.method === 'insufficient' || rep2.global.optCm360 === null,
    'all-miss report degrades gracefully',
  );
  ok(rep2.warnings.length > 0, 'all-miss run raises warnings');
})();

(function trackOnlyRun() {
  const cam4 = { az: 0, el: 0 };
  let recs4 = [];
  let tracks4 = [];
  let done4 = false;
  const lagBuf4 = [];
  const track4 = SZ.taskTrack.createTrackTask({
    getCamera: () => cam4,
    onHud: () => {},
    onProgress: () => {},
    onTrackComplete: (r, kind) => {
      if (s4) s4.onTrackComplete(r, kind);
    },
    onNeedNextTrack: () => {
      if (s4) s4.requestNextTrack();
    },
  });
  const flick4 = SZ.taskFlick.createFlickTask({
    getCamera: () => cam4,
    resetCamera: () => {
      cam4.az = 0;
      cam4.el = 0;
    },
    onHud: () => {},
    onFeedback: () => {},
    onTrialComplete: (r, kind) => {
      if (s4) s4.onTrialComplete(r, kind);
    },
    onNeedNextTrial: () => {
      if (s4) s4.requestNextTrial();
    },
    onTrialStart: () => {},
  });
  const settings4 = { ...settings, taskMode: 'track', sessionId: 1234 };
  const s4 = SZ.session.createSession(settings4, {
    onCountdown: () => {},
    onCountdownEnd: () => {},
    onConditionBegin: () => {},
    onTrialStart: () => {},
    startTrial: (spec, kind) => flick4.startTrial(spec, kind),
    startTrackRun: (cond, kind, seed, dur) => track4.startRun(cond, kind, seed, dur),
    onTrialComplete: () => {},
    onTrackComplete: () => {},
    onNeedNextTrial: () => {
      if (s4) s4.requestNextTrial();
    },
    onNeedNextTrack: () => {
      if (s4) s4.requestNextTrack();
    },
    onFeedback: () => {},
    onHud: () => {},
    onSessionComplete: (recs, tracks) => {
      done4 = true;
      recs4 = recs;
      tracks4 = tracks;
    },
  });
  s4.settings = settings4;
  s4.startWarmup();
  let it = 0;
  try {
    while (!done4 && it < 60000) {
      it++;
      FAKE.now += 16;
      if (track4.isRunning()) {
        const tp = track4.getTargetPos();
        lagBuf4.push({ t: FAKE.now, az: tp.az, el: tp.el });
        while (lagBuf4.length > 40) lagBuf4.shift();
        let tgt = lagBuf4[0];
        for (const s of lagBuf4) {
          if (s.t <= FAKE.now - 100) tgt = s;
          else break;
        }
        cam4.az = tgt.az;
        cam4.el = tgt.el;
      }
      s4.update(FAKE.now);
      flick4.update(FAKE.now);
      track4.update(FAKE.now);
    }
  } catch (e) {
    console.log('THROWN(track-only run): ' + e.message);
    failures++;
  }
  ok(done4, 'track-only session completes');
  ok(recs4.length === 0, 'track-only: no flick records, got ' + recs4.length);
  ok(tracks4.length === 6, 'track-only: 6 track results, got ' + tracks4.length);
  const rep4 = SZ.analysis.analyze(recs4, settings4, { rawMode: 'raw' });
  rep4.track = SZ.analysis.analyzeTrack(tracks4, settings4);
  ok(
    rep4.track != null && rep4.track.global.optCm360 != null,
    'track-only report has track global optimum',
  );
})();

(function fastReactorRun() {
  const cam5 = { az: 0, el: 0 };
  let recs5 = [];
  let done5 = false;
  let spec5 = null;
  let resetAt5 = -1;
  const task5 = SZ.taskFlick.createFlickTask({
    getCamera: () => cam5,
    resetCamera: () => {
      cam5.az = 0;
      cam5.el = 0;
    },
    onHud: () => {},
    onFeedback: () => {},
    onTrialComplete: (r, kind) => {
      if (kind !== 'warmup') recs5.push(r);
      if (s5) s5.onTrialComplete(r, kind);
    },
    onNeedNextTrial: () => {
      if (s5) s5.requestNextTrial();
    },
    onTrialStart: (spec) => {
      spec5 = spec;
    },
  });
  const settings5 = { ...settings, trialsPerCond: 2, sessionId: 555 };
  const s5 = SZ.session.createSession(settings5, {
    onCountdown: () => {},
    onCountdownEnd: () => {},
    onConditionBegin: () => {
      resetAt5 = -1;
    },
    onTrialStart: (spec) => {
      spec5 = spec;
    },
    startTrial: (spec, kind) => {
      task5.startTrial(spec, kind);
      resetAt5 = FAKE.now;
    },
    onTrialComplete: () => {},
    onNeedNextTrial: () => {
      if (s5) s5.requestNextTrial();
    },
    onFeedback: () => {},
    onHud: () => {},
    onSessionComplete: (recs) => {
      done5 = true;
      recs5 = recs;
    },
  });
  s5.settings = settings5;
  s5.startWarmup();
  let it = 0;
  try {
    while (!done5 && it < 60000) {
      it++;
      FAKE.now += 16;
      const ph = task5.getPhase();
      if ((ph === 'settle' || ph === 'waitmove') && spec5 && resetAt5 > 0) {
        const since = FAKE.now - resetAt5;
        if (since > 150) {
          const p = Math.min(1, (since - 150) / 250);
          cam5.az = spec5.az * p;
          cam5.el = spec5.el * p;
        }
      } else if (ph === 'flight' && spec5) {
        const since = FAKE.now - resetAt5;
        const p = Math.min(1, (since - 150) / 250);
        cam5.az = spec5.az * p;
        cam5.el = spec5.el * p;
        if (p >= 1) task5.onClick();
      } else {
        cam5.az = 0;
        cam5.el = 0;
      }
      s5.update(FAKE.now);
      task5.update(FAKE.now);
    }
  } catch (e) {
    console.log('THROWN(fast reactor run): ' + e.message);
    failures++;
  }
  ok(
    done5 && recs5.length === 12,
    'fast-reactor session completes with 12 records, got ' + recs5.length,
  );
  ok(
    recs5.every((r) => r.hit),
    'fast reactor: first flick counts (no double-move needed)',
  );
})();

console.log(failures ? 'FAILURES: ' + failures : 'ALL PASS');
process.exit(failures ? 1 : 0);
