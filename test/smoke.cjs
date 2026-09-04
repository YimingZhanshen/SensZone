globalThis.window = globalThis;
const fs = require('fs');
const path = require('path');

(function syntaxGuard() {
  const dir = path.join(__dirname, '..', 'src');
  let bad = 0;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.js')) continue;
    try {
      new Function(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch (e) {
      console.log('FAIL syntax ' + f + ': ' + e.message);
      bad++;
    }
  }
  if (bad) {
    console.log('FAILURES: ' + bad + ' (syntax)');
    process.exit(1);
  }
})();

function load(f) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  eval(code);
}

['math.js', 'kinematics.js', 'stats.js', 'analysis.js', 'session.js', 'render.js', 'task-flick.js', 'task-track.js', 'ui.js'].forEach(load);
const SZ = globalThis.SZ;

let failures = 0;
function ok(cond, name) {
  if (cond) console.log('PASS ' + name);
  else { console.log('FAIL ' + name); failures++; }
}
function near(a, b, eps, name) {
  ok(Math.abs(a - b) <= eps, name + ' [' + a + ' ~ ' + b + ']');
}

const m = SZ.math;
near(m.cm360(0.022, 1.15, 800), 45.18, 0.05, 'cm360 anchor 800dpi 1.15');
near(m.sensFromCm360(0.022, 800, 45.18), 1.15, 0.001, 'sens roundtrip');
near(m.degPerMm(45.18), 0.797, 0.002, 'degPerMm');
near(m.cmFromDegPerMm(0.797), 45.17, 0.05, 'cm roundtrip');
near(m.indexOfDifficulty(7, 9.15), 0.821, 0.01, 'ID min (paper 0.83)');
near(m.indexOfDifficulty(25.14, 0.57), 5.50, 0.02, 'ID max (paper 5.50)');

const f43 = m.gameFov('cs2', 4 / 3, 90);
near(f43.vFov, 73.74, 0.02, 'cs2 vFOV 4:3 = 73.74');
near(f43.hFov, 90, 0.01, 'cs2 hFOV 4:3 = 90');
const f169 = m.gameFov('cs2', 16 / 9, 90);
near(f169.hFov, 106.26, 0.05, 'cs2 hFOV 16:9 = 106.26');
near(f169.vFov, 73.74, 0.02, 'cs2 vFOV 16:9 = 73.74');
const fv = m.gameFov('valorant', 16 / 9, null);
near(fv.hFov, 103, 0.01, 'valorant hFOV 103');

near(m.greatCircleDeg(0, 0, 25, 2.8), 25.14, 0.02, 'greatCircle eccentricity');
near(m.signedEndpointError(0, 0, 10, 0, 11, 0), 1.0, 0.001, 'signed +1 overshoot');
near(m.signedEndpointError(0, 0, 10, 0, 9, 0), -1.0, 0.001, 'signed -1 undershoot');
near(m.signedEndpointError(0, 0, -10, 0, -11, 0), 1.0, 0.001, 'signed left overshoot');

const s = SZ.stats;
const fit = s.quadFit([0, 1, 2, 3, 4, 5], [4, 1, 0, 1, 4, 9]);
near(fit.optimum(), 2, 0.01, 'quadFit optimum');

const boot = s.bootstrapOptimum(
  Array.from({ length: 60 }, (_, i) => {
    const cond = Math.floor(i / 10);
    const x = Math.log2(0.4) + cond * (Math.log2(1.6) - Math.log2(0.4)) / 5;
    return { x, y: 100 + 250 * (x - Math.log2(0.9)) ** 2 + (i % 7), cond };
  }),
  300, m.mulberry32(42));
ok(boot.opt !== null, 'bootstrap opt not null');
near(boot.opt, Math.log2(0.9), 0.2, 'bootstrap opt near truth');
ok(boot.ci && boot.ci[0] < boot.ci[1], 'bootstrap ci ordered');

const K = SZ.kinematics;
(function submovementTest() {
  const tr = [];
  const dt = 1000 / 240;
  let t = 0;
  for (; t < 200; t += dt) tr.push({ t, az: 0, el: 0 });
  for (let u = 0; u <= 160; u += dt) {
    const f = 0.5 - 0.5 * Math.cos(Math.PI * u / 160);
    tr.push({ t: 200 + u, az: 18 * f, el: 0 });
  }
  const t1 = 360;
  for (let u = 0; u < 120; u += dt) tr.push({ t: t1 + u, az: 18, el: 0 });
  for (let u = 0; u <= 120; u += dt) {
    const f = 0.5 - 0.5 * Math.cos(Math.PI * u / 120);
    tr.push({ t: t1 + 120 + u, az: 18 + 2.5 * f, el: 0 });
  }
  for (let u = 0; u < 100; u += dt) tr.push({ t: t1 + 240 + u, az: 20.5, el: 0 });
  const sum = K.summarizeTrialTrace(tr);
  ok(sum && sum.count === 2, 'submovement count == 2, got ' + (sum && sum.count));
  ok(sum && sum.firstPeakVel > 60, 'first submovement peak vel > 60 deg/s, got ' + (sum && sum.firstPeakVel.toFixed(1)));
  ok(sum && sum.firstPeakT >= 220 && sum.firstPeakT <= 340, 'first submovement peak time in flick window, got ' + (sum && sum.firstPeakT.toFixed(0)));
})();

(function singleMoveTest() {
  const tr = [];
  const dt = 1000 / 240;
  for (; t0() < 150;) tr.push({ t: t0(), az: 0, el: 0 });
  function t0() { return tr.length * dt; }
  for (let u = 0; u <= 180; u += dt) {
    const f = 0.5 - 0.5 * Math.cos(Math.PI * u / 180);
    tr.push({ t: 150 + u, az: 12 * f, el: 0 });
  }
  for (let u = 0; u < 120; u += dt) tr.push({ t: 330 + u, az: 12, el: 0 });
  const sum = K.summarizeTrialTrace(tr);
  ok(sum && sum.count === 1, 'single clean flick == 1 submovement, got ' + (sum && sum.count));
})();

const settings = {
  game: 'cs2', aspect: 4 / 3, customFov: 90, dpi: 800, sens: 1.15,
  yaw: 0.022, trialsPerCond: 40, padWidthCm: 45, sessionId: 12345
};

const conds = SZ.session.buildConditions(settings);
ok(conds.length === 6, '6 conditions');
near(conds[3].cm360, 45.18, 0.05, 'anchor condition cm/360');
const specA = SZ.session.makeTrialSpec(conds[0], 7);
const specB = SZ.session.makeTrialSpec(conds[0], 7);
ok(specA.az === specB.az && specA.el === specB.el && specA.widthDeg === specB.widthDeg, 'trial spec deterministic');
ok(specA.idBits >= 0.8 && specA.idBits <= 5.6, 'ID in paper range: ' + specA.idBits.toFixed(2));

(function analysisTest() {
  const records = [];
  const optDpm = 0.9;
  const rng = m.mulberry32(7);
  for (const c of conds) {
    for (let i = 0; i < 40; i++) {
      const spec = SZ.session.makeTrialSpec(c, i);
      const x = Math.log2(c.dpm);
      let mt = 420 + 900 * (x - Math.log2(optDpm)) ** 2 + rng() * 80;
      let hit = rng() < 0.93;
      if (c.idx === 3 && i === 39) { mt = 10000; hit = true; }
      records.push({
        condId: c.idx,
        trialIdx: i,
        cond: c,
        sens: { dpm: c.dpm, cm360: c.cm360, gameSens: c.gameSens },
        target: { widthDeg: spec.widthDeg, azDeg: spec.az, elDeg: spec.el, idBits: spec.idBits },
        mtMs: hit ? mt : null,
        effMs: hit ? mt : 1500,
        hit,
        endpointErrDeg: rng() * 2,
        signedErrDeg: (rng() - 0.4) * 2,
        submovements: 1 + Math.floor(rng() * 2),
        firstPeakVel: 100,
        swipiness: 0.4 + rng() * 0.8
      });
    }
  }
  const rep = SZ.analysis.analyze(records, settings, { rawMode: 'raw' });
  ok(rep.conds.length === 6, 'report has 6 conditions');
  ok(rep.global && rep.global.optCm360 != null, 'global optimum exists');
  if (rep.global && rep.global.optCm360 != null) {
    near(rep.global.optCm360, 36 / optDpm, 5, 'global opt near true 40 cm/360');
  }
  ok(rep.buckets.low && rep.buckets.high, 'buckets present');
  ok(rep.plateau && rep.global.optCm360 >= rep.plateau.lo && rep.global.optCm360 <= rep.plateau.hi, 'plateau is curve-derived and contains the optimum');
  ok(rep.counts.trials === 162, 'kept trials = 162 (2/3 of 240), got ' + rep.counts.trials);
  ok(rep.warnings.length === 0, 'no warnings under clean data');
  const c45 = rep.conds.find(c => Math.abs(c.cm360 - 45.18) < 1);
  ok(c45 && c45.meanMT < 600, 'p95 outlier cleaning (10000ms excluded): meanMT ' + (c45 && Math.round(c45.meanMT)));
  ok(rep.flickStyle && rep.flickStyle.meanSwip >= 0.4 && rep.flickStyle.meanSwip <= 1.2, 'flickStyle meanSwip computed: ' + (rep.flickStyle && rep.flickStyle.meanSwip.toFixed(2)));
  ok(rep.flickStyle.style === 'mixed' || rep.flickStyle.style === 'swipe' || rep.flickStyle.style === 'land', 'flickStyle label valid: ' + (rep.flickStyle && rep.flickStyle.style));
})();

(function renderContractTest() {
  const task = SZ.taskFlick.createFlickTask({
    getCamera: () => ({ az: 0, el: 0 }),
    resetCamera: () => {},
    onHud: () => {}, onFeedback: () => {}, onTrialComplete: () => {},
    onNeedNextTrial: () => {}, onTrialStart: () => {}
  });
  const spec = { condId: 0, trialIdx: 0, cond: {}, sens: {}, az: 10, el: 1, radDeg: 1, widthDeg: 2, idBits: 3 };
  task.startTrial(spec, 'test');
  const s1 = task.getScene();
  ok(s1.test && SZ.render.STYLE[s1.test.style], 'flick settle scene style known to renderer: ' + (s1.test && s1.test.style));
  ok(s1.ref === null, 'no reference target in v2 scene');
  const t2 = SZ.taskTrack.createTrackTask({
    getCamera: () => ({ az: 0, el: 0 }),
    onHud: () => {}, onProgress: () => {}, onTrackComplete: () => {}, onNeedNextTrack: () => {}
  });
  t2.startRun({ idx: 0 }, 'test', 12345, 15);
  const s2 = t2.getScene();
  ok(s2.test && SZ.render.STYLE[s2.test.style], 'track scene style known to renderer: ' + (s2.test && s2.test.style));
  const p1 = t2.getTargetPos();
  ok(Math.abs(p1.az) <= 33 && Math.abs(p1.el) <= 6, 'track target within bands');
})();

(function trajectoryTest() {
  const traj = SZ.taskTrack.makeTrajectory(424242);
  let maxV = 0, maxAz = 0, maxEl = 0, reversals = 0, lowSpeedFrames = 0, totalFrames = 0, maxStep = 0;
  let prevAz = traj.az(0), prevV = null;
  for (let t = 0.004; t <= SZ.taskTrack.DURATION_S; t += 0.004) {
    const az = traj.az(t), el = traj.el(t);
    const v = (az - prevAz) / 0.004;
    const av = Math.abs(v);
    if (av > maxV) maxV = av;
    if (av < 3) lowSpeedFrames++;
    totalFrames++;
    if (prevV !== null) {
      const step = Math.abs(v - prevV);
      if (step > maxStep) maxStep = step;
    }
    if (Math.abs(az) > maxAz) maxAz = Math.abs(az);
    if (Math.abs(el) > maxEl) maxEl = Math.abs(el);
    if (prevV !== null && Math.sign(v) !== 0 && Math.sign(prevV) !== 0 && Math.sign(v) !== Math.sign(prevV)) reversals++;
    prevAz = az;
    prevV = v;
  }
  ok(maxV <= 45, 'trajectory peak angular velocity <= 45 deg/s, got ' + maxV.toFixed(1));
  ok(maxAz >= 15 && maxAz <= 33, 'az amplitude in [15, 33], got ' + maxAz.toFixed(1));
  ok(maxEl <= 6, 'el amplitude <= 6 deg, got ' + maxEl.toFixed(2));
  ok(lowSpeedFrames / totalFrames < 0.05, 'shallow dips only: |v|<3 deg/s frames < 5%, got ' + (100 * lowSpeedFrames / totalFrames).toFixed(2) + '%');
  ok(maxStep < 2, 'no velocity steps (smooth turns): max dv per frame < 2 deg/s, got ' + maxStep.toFixed(2));
  const minutes = totalFrames * 0.004 / 60;
  ok(reversals / minutes >= 20 && reversals / minutes <= 60, 'direction flips 20-60 per min, got ' + (reversals / minutes).toFixed(0));
})();

(function rowWeightTest() {
  const cond = SZ.session.buildConditions(settings)[3];
  const rows = [0, 0, 0, 0, 0];
  const N = 400;
  for (let i = 0; i < N; i++) {
    const spec = SZ.session.makeTrialSpec(cond, 1000 + i);
    const m = Math.abs(spec.az);
    let row = 4;
    const bounds = [9, 11.7, 15, 19.4, 25.01];
    for (let b = 0; b < 5; b++) { if (m < bounds[b]) { row = b; break; } }
    rows[row]++;
  }
  const frac0 = rows[0] / N, fracMid = (rows[2] + rows[3]) / N;
  ok(frac0 < 0.2, 'closest band under-weighted (<20%), got ' + (frac0 * 100).toFixed(1) + '%');
  ok(fracMid > 0.45, 'mid bands dominate (>45%), got ' + (fracMid * 100).toFixed(1) + '%');
})();

(function trackAnalysisTest() {
  const settings2 = { ...settings, sessionId: 999 };
  const conds2 = SZ.session.buildConditions(settings2);
  const results = [];
  const rng2 = m.mulberry32(11);
  for (const c of conds2) {
    const x = Math.log2(c.dpm);
    const base = 3 + 0.9 * (x - Math.log2(0.9)) ** 2;
    const blocks = [];
    for (let b = 0; b < 13; b++) blocks.push(Math.max(0.4, base + (rng2() - 0.5) * 0.3));
    results.push({
      condId: c.idx, cond: c,
      sens: { dpm: c.dpm, cm360: c.cm360, gameSens: c.gameSens },
      rms: Math.sqrt(blocks.reduce((s, v) => s + v * v, 0) / blocks.length),
      onTargetPct: 0.7, lagMs: 60 + x * 10,
      blocks
    });
  }
  const tr = SZ.analysis.analyzeTrack(results, settings2);
  ok(tr && tr.global && tr.global.optCm360 != null, 'track global optimum exists');
  if (tr && tr.global && tr.global.optCm360 != null) {
    near(tr.global.optCm360, 36 / 0.9, 6, 'track opt near true 40 cm/360');
  }
  ok(tr && tr.plateau, 'track plateau detected');
})();

(function uiHelpersTest() {
  ok(typeof SZ.ui.combinedCm360 === 'function', 'combinedCm360 defined (regression: report buttons died when missing)');
  ok(typeof SZ.ui.centersOf === 'function', 'centersOf defined');
  const fake = {
    plateau: { bestCm360: 45 },
    global: { optCm360: 45 },
    track: { plateau: { bestCm360: 60 }, global: { optCm360: 60 } }
  };
  near(SZ.ui.combinedCm360(fake, 50), Math.sqrt(45 * 60), 0.1, 'combined geometric mean 50/50');
  near(SZ.ui.combinedCm360(fake, 0), 60, 0.01, 'combined 0% flick = track center');
  near(SZ.ui.combinedCm360(fake, 100), 45, 0.01, 'combined 100% flick = flick center');
  ok(SZ.ui.combinedCm360({ global: {}, track: null }, 50) === null, 'combined with no data = null');
  ok(SZ.ui.combinedCm360({ global: { optCm360: 45 }, track: null }, 50) === 45, 'combined flick-only = flick center');
})();

(function reliabilityTest() {
  const settings3 = { ...settings, sessionId: 321 };
  const conds3 = SZ.session.buildConditions(settings3);
  function mkResults(mode) {
    const rng3 = m.mulberry32(23);
    const rs = [];
    for (const c of conds3) {
      const x = Math.log2(c.dpm);
      const base = 3 + 0.9 * (x - Math.log2(0.9)) ** 2;
      let blocks = [];
      for (let b = 0; b < 13; b++) blocks.push(Math.max(0.4, base + (rng3() - 0.5) * 0.3));
      if (mode === 'flat') blocks = blocks.map(() => 2.5 + rng3() * 0.2);
      rs.push({
        condId: c.idx, cond: c,
        sens: { dpm: c.dpm, cm360: c.cm360, gameSens: c.gameSens },
        rms: Math.sqrt(blocks.reduce((s, v) => s + v * v, 0) / blocks.length),
        onTargetPct: 0.7, lagMs: 60,
        blocks
      });
    }
    return rs;
  }
  const clean = SZ.analysis.analyzeTrack(mkResults('clean'), settings3);
  ok(clean && clean.reliable === true, 'clean track fit is reliable');
  const flat = SZ.analysis.analyzeTrack(mkResults('flat'), settings3);
  ok(flat && flat.reliable === false, 'flat track fit excluded from blending');
  ok(SZ.ui.centersOf({ global: { optCm360: 35 }, plateau: { bestCm360: 30 }, track: null }).flickCm === 35, 'centersOf prefers fitted optimum over plateau best');
})();

console.log(failures ? 'FAILURES: ' + failures : 'ALL PASS');
process.exit(failures ? 1 : 0);
