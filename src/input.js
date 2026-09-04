(function (SZ) {
  'use strict';

  const listeners = { move: [], click: [], shift: [], lockLost: [] };
  let element = null;
  let rawMode = 'unknown';
  let locked = false;

  function on(evt, fn) { listeners[evt].push(fn); }

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
      if (document.pointerLockElement === element && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) {
        emit('shift', e);
      }
    });
    document.addEventListener('pointerlockchange', () => {
      locked = document.pointerLockElement === element;
      if (!locked) emit('lockLost');
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const EVT = { dx: 0, dy: 0, ts: 0 };

  function handleMove(e) {
    if (document.pointerLockElement !== element) return;
    let evts = [];
    try { evts = e.getCoalescedEvents ? e.getCoalescedEvents() : []; } catch (_) { evts = []; }
    if (!evts || !evts.length) evts = [e];
    let lastTs = -1;
    for (const ev of evts) {
      EVT.dx = ev.movementX; EVT.dy = ev.movementY; EVT.ts = ev.timeStamp;
      emit('move', EVT);
      lastTs = ev.timeStamp;
    }
    if (e.timeStamp > lastTs) {
      EVT.dx = e.movementX; EVT.dy = e.movementY; EVT.ts = e.timeStamp;
      emit('move', EVT);
    }
  }

  function lock() {
    return new Promise((resolve) => {
      let p;
      try {
        p = element.requestPointerLock({ unadjustedMovement: true });
      } catch (err) {
        rawMode = 'adjusted';
        try { element.requestPointerLock(); } catch (_) {}
        resolve(rawMode);
        return;
      }
      if (p && typeof p.then === 'function') {
        p.then(() => {
          rawMode = 'raw';
          resolve(rawMode);
        }).catch((err) => {
          rawMode = (err && err.name === 'NotSupportedError') ? 'adjusted' : 'unknown';
          try { element.requestPointerLock(); } catch (_) {}
          resolve(rawMode);
        });
      } else {
        rawMode = 'unknown';
        resolve(rawMode);
      }
    });
  }

  function unlock() {
    try { document.exitPointerLock(); } catch (_) {}
  }

  function isLocked() { return locked; }
  function getRawMode() { return rawMode; }

  SZ.input = { init, on, lock, unlock, isLocked, getRawMode };
})(typeof window !== 'undefined' ? (window.SZ = window.SZ || {}) : (globalThis.SZ = globalThis.SZ || {}));
