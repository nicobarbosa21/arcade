// Just enough browser to import the UI modules in node. The canvas context is a
// recorder wrapped in a Proxy that throws on anything it does not know, so a
// mistyped drawing call fails the test instead of silently doing nothing.

const CTX_PROPS = {
  fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
  font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', globalAlpha: 1,
  globalCompositeOperation: 'source-over', shadowColor: 'transparent', shadowBlur: 0,
};

const CTX_METHODS = [
  'save', 'restore', 'translate', 'rotate', 'scale', 'setTransform', 'resetTransform',
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect',
  'bezierCurveTo', 'quadraticCurveTo', 'fill', 'stroke', 'clip', 'setLineDash',
  'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'drawImage',
];

export function makeContext(log) {
  const target = { ...CTX_PROPS };
  for (const m of CTX_METHODS) {
    target[m] = (...args) => {
      log.calls.push(m);
      if (m === 'fillText' || m === 'strokeText') log.text.push(String(args[0]));
      if (m === 'translate') log.translate.push([args[0], args[1]]);
      for (const a of args) {
        if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${m} got ${a}`);
      }
    };
  }
  target.createLinearGradient = () => ({ addColorStop() {} });
  target.createRadialGradient = target.createLinearGradient;
  target.measureText = (t) => ({ width: String(t).length * 6 });
  target.getImageData = () => ({ data: new Uint8ClampedArray(4) });
  target.canvas = null;

  return new Proxy(target, {
    get(o, k) {
      if (k in o || typeof k === 'symbol') return o[k];
      throw new Error(`canvas context has no "${String(k)}"`);
    },
    set(o, k, v) {
      if (!(k in o)) throw new Error(`canvas context has no "${String(k)}"`);
      o[k] = v;
      return true;
    },
  });
}

function makeElement(id, log, tag = 'div') {
  const listeners = {};
  const el = {
    id, tagName: tag, dataset: {}, style: {}, value: '', textContent: '', innerHTML: '',
    width: 0, height: 0, disabled: false, onclick: null, onchange: null,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: () => {},
    dispatch(type, ev = {}) { for (const fn of listeners[type] || []) fn({ preventDefault() {}, ...ev }); },
    getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: el.width || 540, height: el.height || 540 }),
    getContext: () => { const c = makeContext(log); c.canvas = el; return c; },
    setPointerCapture() {}, releasePointerCapture() {}, focus() {}, querySelectorAll: () => [],
    click() { el.onclick?.({ preventDefault() {} }); el.dispatch('click'); },
  };
  return el;
}

/**
 * Installs the globals the UI modules expect.
 * @param ids element ids to hand out from getElementById
 * @param groups selector -> array of ids, for querySelectorAll
 */
export function installDom({ ids = [], groups = {} } = {}) {
  const log = { calls: [], text: [], translate: [] };
  const els = new Map(ids.map((id) => [id, makeElement(id, log)]));
  for (const [sel, list] of Object.entries(groups)) {
    els.set(sel, list.map((id) => {
      const el = makeElement(id, log);
      el.dataset.key = id;
      return el;
    }));
  }

  const winListeners = {};
  const frames = [];
  const saved = {};
  let clock = null;
  const set = (k, v) => { saved[k] = globalThis[k]; globalThis[k] = v; };

  set('window', { devicePixelRatio: 1, addEventListener: (t, f) => { (winListeners[t] ||= []).push(f); } });
  set('document', {
    getElementById: (id) => els.get(id) ?? null,
    querySelectorAll: (sel) => els.get(sel) ?? [],
    querySelector: (sel) => (els.get(sel) ?? [])[0] ?? null,
    addEventListener: (t, f) => { (winListeners[t] ||= []).push(f); },
    createElement: (tag) => makeElement('', log, tag),
  });
  set('addEventListener', (t, f) => { (winListeners[t] ||= []).push(f); });
  set('requestAnimationFrame', (fn) => { frames.push(fn); return frames.length; });
  set('cancelAnimationFrame', () => {});
  set('setInterval', () => 0);          // the puzzle pages poll a clock; nothing to wait for here
  set('setTimeout', (fn) => { fn(); return 0; });   // run deferred work straight away

  return {
    log,
    el: (id) => els.get(id),
    group: (sel) => els.get(sel),
    fire(type, ev = {}) { for (const fn of winListeners[type] || []) fn({ preventDefault() {}, ...ev }); },
    /** Pumps the requestAnimationFrame loop for n frames of 1/60s on a monotonic clock. */
    tick(n) {
      clock ??= performance.now();
      for (let i = 0; i < n; i++) {
        const fn = frames.shift();
        if (!fn) break;
        clock += 1000 / 60;
        fn(clock);
      }
    },
    restore() { for (const [k, v] of Object.entries(saved)) globalThis[k] = v; },
  };
}
