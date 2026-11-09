// Memory-only storage for opaque-origin sandboxed frames (localStorage throws there) and
// hard stops for APIs this offline training shell must never use.
(function () {
  'use strict';
  function memoryStorage() {
    const map = new Map();
    return {
      get length() { return map.size; },
      key: i => Array.from(map.keys())[i] ?? null,
      getItem: k => (map.has(String(k)) ? map.get(String(k)) : null),
      setItem: (k, v) => { map.set(String(k), String(v)); },
      removeItem: k => { map.delete(String(k)); },
      clear: () => map.clear(),
    };
  }
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(window, name, { value: memoryStorage(), configurable: true });
  }
  Object.defineProperty(document, 'cookie', { get: () => '', set: () => {}, configurable: true });
  window.open = () => null;
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Disabled in training shell', 'NotAllowedError'));
  }
})();
