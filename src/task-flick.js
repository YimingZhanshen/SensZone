(function (SZ) {
  'use strict';

  const SETTLE_MS = 250;
  const FEEDBACK_MS = 350;
  const ITI_MS = 250;
  const TIMEOUT_MS = 1500;
  const IDLE_MS = 8000;
  const ARM_VEL = 4;
  const ONSET_VEL = 15;
  const ARM_DEADLINE_MS = 600;

  function createFlickTask(hooks) {
    let phase = 'idle';
    let trial = null;
    let phaseEnd = 0;
    let flashes = [];
    let lastCam = null;
    let lastT = 0;
    let armed = false;

    function startTrial(spec, kind) {
      trial = {
        spec,
        kind: kind || 'test',
        t0: 0,
        trace: [],
        started: false,
        lastSample: 0,
        waitStart: performance.now(),
        startAz: 0,
        startEl: 0,
      };
      phase = 'settle';
      armed = false;
      phaseEnd = trial.waitStart + SETTLE_MS;
      lastCam = null;
      if (hooks.resetCamera) hooks.resetCamera();
      hooks.onHud({ phase, spec, kind: trial.kind });
    }

    function onShift() {}

    function onClick() {
      if (phase !== 'flight') return;
      finish(performance.now(), true, false);
    }

    function finish(now, clicked, idle) {
      const mt = trial.started ? Math.min(now - trial.t0, TIMEOUT_MS) : null;
      const cam = hooks.getCamera();
      const spec = trial.spec;
      const d = SZ.math.greatCircleDeg(cam.az, cam.el, spec.az, spec.el);
      const hit = !idle && clicked && trial.started && d <= spec.radDeg;
      const signed = signedEndpointError(trial.startAz, trial.startEl, spec, cam);

      if (phase === 'flight') {
        trial.trace.push({ t: Math.min(now - trial.t0, TIMEOUT_MS), az: cam.az, el: cam.el });
      }

      const kin = trial.kind === 'warmup' ? null : SZ.kinematics.summarizeTrialTrace(trial.trace);
      const swipiness = hit && kin && kin.firstPeakT > 0 && mt > 0 ? mt / kin.firstPeakT / 2 : null;
      const verificationMs = hit && kin && kin.count > 0 ? Math.max(0, mt - kin.lastEndT) : null;
      const pauseMs = hit && kin ? kin.pauseMs : null;
      const record = {
        condId: spec.condId,
        trialIdx: spec.trialIdx,
        cond: spec.cond,
        sens: spec.sens,
        target: {
          widthDeg: spec.widthDeg,
          azDeg: spec.az,
          elDeg: spec.el,
          idBits: spec.idBits,
        },
        mtMs: hit ? mt : null,
        effMs: hit ? mt : TIMEOUT_MS,
        hit,
        missReason: hit
          ? null
          : idle
            ? 'idle'
            : clicked
              ? 'miss'
              : trial.started
                ? 'timeout'
                : 'nostart',
        endpointErrDeg: d,
        signedErrDeg: signed,
        submovements: kin ? kin.count : null,
        firstPeakVel: kin ? kin.firstPeakVel : null,
        swipiness,
        verificationMs,
        pauseMs,
        waitMs: trial.started ? trial.t0 - trial.waitStart : null,
      };

      phase = 'done';
      phaseEnd = now + FEEDBACK_MS + ITI_MS;
      flashes.push({
        type: hit ? 'hit' : 'miss',
        az: spec.az,
        el: spec.el,
        rad: spec.radDeg,
        t0: now,
      });
      hooks.onFeedback(hit ? 'hit' : idle ? 'idle' : 'miss', hit ? mt : null);
      hooks.onTrialComplete(record, trial.kind);
      hooks.onHud({ phase, spec, kind: trial.kind });
    }

    function signedEndpointError(startAz, startEl, spec, cam) {
      const cosT = Math.cos((spec.el * Math.PI) / 180);
      const ux = SZ.math.wrap180(startAz - spec.az) * cosT;
      const uy = startEl - spec.el;
      const cx = SZ.math.wrap180(cam.az - spec.az) * cosT;
      const cy = cam.el - spec.el;
      const len = Math.hypot(ux, uy);
      if (len < 1e-6) return 0;
      return -(cx * (ux / len) + cy * (uy / len));
    }

    function update(now) {
      if (phase === 'settle') {
        if (now >= phaseEnd) {
          phase = 'waitmove';
          trial.armDeadline = now + ARM_DEADLINE_MS;
        }
      }
      if (phase === 'settle' || phase === 'waitmove') {
        const cam = hooks.getCamera();
        if (lastCam) {
          const dt = Math.max(1, now - lastT) / 1000;
          const v = SZ.math.greatCircleDeg(lastCam.az, lastCam.el, cam.az, cam.el) / dt;
          if (!armed) {
            if (v < ARM_VEL || now > trial.armDeadline) {
              armed = true;
            } else {
              const d = SZ.math.greatCircleDeg(cam.az, cam.el, trial.spec.az, trial.spec.el);
              if (d <= trial.spec.radDeg) {
                flashes.push({
                  type: 'deny',
                  az: trial.spec.az,
                  el: trial.spec.el,
                  rad: trial.spec.radDeg,
                  t0: now,
                });
                hooks.onFeedback('skip', null);
                if (hooks.onTrialAborted) hooks.onTrialAborted();
                lastCam = null;
                return;
              }
            }
          } else if (v > ONSET_VEL) {
            trial.t0 = now;
            trial.started = true;
            trial.startAz = cam.az;
            trial.startEl = cam.el;
            phase = 'flight';
            hooks.onHud({ phase, spec: trial.spec, kind: trial.kind });
          }
        }
        lastCam = { az: cam.az, el: cam.el };
        lastT = now;
        if (phase === 'waitmove' && now - trial.waitStart > IDLE_MS) {
          if (hooks.resetCamera) hooks.resetCamera();
          finish(now, false, true);
        }
      } else if (phase === 'flight') {
        const cam = hooks.getCamera();
        const t = Math.min(now - trial.t0, TIMEOUT_MS);
        if (trial.trace.length === 0 || now - trial.lastSample >= 2) {
          trial.trace.push({ t, az: cam.az, el: cam.el });
          trial.lastSample = now;
        }
        if (now - trial.t0 >= TIMEOUT_MS) {
          finish(now, false, false);
        }
      } else if (phase === 'done' && now >= phaseEnd) {
        phase = 'iti';
        hooks.onNeedNextTrial();
      }
      flashes = flashes.filter((f) => now - f.t0 <= 320);
    }

    const SCENE = { ref: null, test: null, flashes };
    const TESTOBJ = { az: 0, el: 0, radDeg: 0, style: 'idle' };

    function getScene() {
      SCENE.ref = null;
      SCENE.test = null;
      SCENE.flashes = flashes;
      if (trial && (phase === 'settle' || phase === 'waitmove' || phase === 'flight')) {
        const spec = trial.spec;
        TESTOBJ.az = spec.az;
        TESTOBJ.el = spec.el;
        TESTOBJ.radDeg = spec.radDeg;
        TESTOBJ.style = phase === 'flight' ? 'live' : 'idle';
        SCENE.test = TESTOBJ;
      }
      return SCENE;
    }

    function addPauseTime(ms) {
      if (trial) {
        if (trial.t0) {
          trial.t0 += ms;
          for (const s of trial.trace) s.t += ms;
        }
        if (trial.lastSample) trial.lastSample += ms;
        if (trial.waitStart) trial.waitStart += ms;
        if (trial.armDeadline) trial.armDeadline += ms;
      }
      for (const f of flashes) f.t0 += ms;
      if (phaseEnd) phaseEnd += ms;
    }

    function isFlight() {
      return phase === 'flight';
    }
    function getPhase() {
      return phase;
    }
    function getFlightProgress(now) {
      if (phase !== 'flight' || !trial || !trial.started) return 0;
      return Math.min(1, (now - trial.t0) / TIMEOUT_MS);
    }
    function reset() {
      phase = 'idle';
      trial = null;
      flashes = [];
      lastCam = null;
    }

    return {
      startTrial,
      onShift,
      onClick,
      update,
      getScene,
      isFlight,
      getPhase,
      getFlightProgress,
      reset,
      addPauseTime,
    };
  }

  SZ.taskFlick = { createFlickTask, TIMEOUT_MS };
})(
  typeof window !== 'undefined'
    ? (window.SZ = window.SZ || {})
    : (globalThis.SZ = globalThis.SZ || {}),
);
