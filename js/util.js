/* Small shared helpers: DOM, escaping, formatting, storage, toast. No app state in here. */
(function (R) {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  /* Every name that reaches innerHTML goes through esc(): it also escapes quotes, so it is safe in attribute values. */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory < 4) || /[?&]noblur/.test(location.search);
  const sgn = n => n < 0 ? -1 : n > 0 ? 1 : 0;
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(Math.round(n));
  const isoDay = ts => new Date(ts).toISOString().slice(0, 10);
  const hash01 = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const mk = html => { const el = document.createElement('div'); el.innerHTML = html; return el; };
  const fmtDate = ts => new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('in');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('in'), 2600);
  }
  /* localStorage that never throws (private mode, quota) */
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  function unstore(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }

  R.util = { $, $$, esc, reduceMotion, lowEnd, sgn, signed, isoDay, hash01, mk, fmtDate, toast, store, unstore };
})(window.Ruski);
