(function (SZ) {
  'use strict';

  const listeners = { move: [], click: [], shift: [], lockLost: [] };
  let element = null;
  let rawMode = 'unknown';
  let locked = false;
  let lastExitTs = -1e9;
  let legacyRun = null;
  let legacyFinish = null;
  let retryTimer = 0;
  let tries = 0;

  // Chromium 在用户退出 Pointer Lock 后 ~1.25s 内禁止再次锁定（SecurityError）。
  // 恢复测试时 ESC → 点"继续"经常落在这个窗口里，必须等待冷却后有界重试。
  const COOLDOWN_MS = 1300;
  const RETRY_DELAY_MS = 1400;
  const MAX_TRIES = 4;

  function on(evt, fn) {
    listeners[evt].push(fn);
  }

  function emit(evt, arg) {
    for (const fn of listeners[evt]) fn(arg);
  }

  function init(el) {
    element = el;
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement === element && e.button === 0) emit('click', e);
    });
    window.addEventListener('keydown', (e) => {
      if (
        document.pointerLockElement === element &&
        (e.code === 'ShiftLeft' || e.code === 'ShiftRight')
      ) {
        emit('shift', e);
      }
    });
    document.addEventListener('pointerlockchange', () => {
      locked = document.pointerLockElement === element;
      if (locked) {
        if (legacyFinish) {
          const f = legacyFinish;
          legacyFinish = null;
          legacyRun = null;
          f(rawMode);
        }
      } else {
        lastExitTs = performance.now();
        emit('lockLost');
      }
    });
    document.addEventListener('pointerlockerror', () => {
      // legacy 路径（requestPointerLock 不返回 Promise）失败结果只能从这里感知
      if (legacyRun) {
        const r = legacyRun;
        legacyRun = null;
        setTimeout(r, RETRY_DELAY_MS);
      }
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const EVT = { dx: 0, dy: 0, ts: 0 };

  function handleMove(e) {
    if (document.pointerLockElement !== element) return;
    let evts = [];
    try {
      evts = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    } catch (_) {
      evts = [];
    }
    if (!evts || !evts.length) evts = [e];
    let lastTs = -1;
    for (const ev of evts) {
      EVT.dx = ev.movementX;
      EVT.dy = ev.movementY;
      EVT.ts = ev.timeStamp;
      emit('move', EVT);
      lastTs = ev.timeStamp;
    }
    if (e.timeStamp > lastTs) {
      EVT.dx = e.movementX;
      EVT.dy = e.movementY;
      EVT.ts = e.timeStamp;
      emit('move', EVT);
    }
  }

  function legacyConsume(p, run, finish) {
    // 老浏览器 requestPointerLock() 返回 undefined：结果依赖 pointerlockchange/error 事件
    legacyRun = run;
    legacyFinish = finish;
    void p;
  }

  function lock() {
    if (locked) return Promise.resolve(rawMode);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (mode) => {
        if (settled) return;
        settled = true;
        if (mode) rawMode = mode;
        resolve(rawMode);
      };
      tries = 0;
      const run = () => {
        if (settled) return;
        if (locked) {
          finish(rawMode);
          return;
        }
        if (tries++ >= MAX_TRIES) {
          // 放弃：调用方用 isLocked() 兜底（恢复会退回暂停层，不会裸奔）
          finish(rawMode);
          return;
        }
        let p = null;
        try {
          p = element.requestPointerLock({ unadjustedMovement: true });
        } catch (_) {
          // 参数同步抛错（老浏览器不支持选项）
          try {
            p = element.requestPointerLock();
          } catch (_2) {
            setTimeout(run, RETRY_DELAY_MS);
            return;
          }
          legacyConsume(p, run, finish);
          return;
        }
        if (p && typeof p.then === 'function') {
          p.then(() => finish('raw')).catch((err) => {
            if (err && err.name === 'NotSupportedError') {
              rawMode = 'adjusted';
              let p2 = null;
              try {
                p2 = element.requestPointerLock();
              } catch (_3) {
                setTimeout(run, RETRY_DELAY_MS);
                return;
              }
              if (p2 && typeof p2.then === 'function') {
                p2.then(() => finish('adjusted')).catch(() => setTimeout(run, RETRY_DELAY_MS));
              } else {
                legacyConsume(p2, run, finish);
              }
            } else {
              // SecurityError（退出冷却期/其他）→ 等待后重试
              setTimeout(run, RETRY_DELAY_MS);
            }
          });
        } else {
          legacyConsume(p, run, finish);
        }
      };
      const wait = Math.max(0, lastExitTs + COOLDOWN_MS - performance.now());
      clearTimeout(retryTimer);
      retryTimer = setTimeout(run, wait);
    });
  }

  function unlock() {
    try {
      document.exitPointerLock();
    } catch (_) {}
  }

  function isLocked() {
    return locked;
  }
  function getRawMode() {
    return rawMode;
  }

  SZ.input = { init, on, lock, unlock, isLocked, getRawMode };
})(
  typeof window !== 'undefined'
    ? (window.SZ = window.SZ || {})
    : (globalThis.SZ = globalThis.SZ || {}),
);
