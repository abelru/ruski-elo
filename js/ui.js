/* Shared UI pieces: signal flags, the rack glyph, bottom sheets, in-page confirm sheet. */
(function (R) {
  'use strict';
  const { $, $$, esc, reduceMotion } = R.util;
  const { getReplay, layoutFor } = R.replay;

/* Signal flags (International Code): 20x14 inline SVG badges */
const FLAG_DEFS = {
  O: '<path d="M0 0H20L0 14Z" fill="#E9C23B"/><path d="M20 0V14H0Z" fill="#C8262E"/>',
  A: '<rect width="20" height="14" fill="#fff"/><path d="M10 0H20L15 7L20 14H10Z" fill="#2D5DA6"/>',
  S: '<rect width="20" height="14" fill="#fff"/><rect x="6" y="3" width="8" height="8" fill="#2D5DA6"/>',
  C: '<rect width="20" height="14" fill="#fff"/><path d="M0 0H20V3H0ZM0 5.6H20V8.4H0ZM0 11H20V14H0Z" fill="#2D5DA6"/><path d="M0 3H20V5.6H0ZM0 8.4H20V11H0Z" fill="#C8262E"/>',
  R: '<rect width="20" height="14" fill="#C8262E"/><path d="M8.5 0h3v14h-3zM0 5.5h20v3H0z" fill="#E9C23B"/>',
  L: '<rect width="20" height="14" fill="#E9C23B"/><path d="M10 0H20V7H10ZM0 7H10V14H0Z" fill="#111"/>',
  X: '<rect width="20" height="14" fill="#fff"/><path d="M8.5 0h3v14h-3zM0 5.5h20v3H0z" fill="#2D5DA6"/>',
  N: '<rect width="20" height="14" fill="#fff"/><path d="M0 0h5v3.5H0zM10 0h5v3.5h-5zM5 3.5h5V7H5zM15 3.5h5V7h-5zM0 7h5v3.5H0zM10 7h5v3.5h-5zM5 10.5h5V14H5zM15 10.5h5V14h-5z" fill="#2D5DA6"/>'
};
const flag = (k, cls = 'flag') => `<svg class="${cls}" viewBox="0 0 20 14" aria-hidden="true">${FLAG_DEFS[k]}</svg>`;

/* Rack glyph: two racks, sunk cups punched out as wet rings. State = end of the base game. */
function glyphSvg(g, h = 28) {
  try { return glyphSvgUnsafe(g, h); } catch (e) { console.error('glyph failed for game', g && g.id, e); return ''; }
}
function glyphSvgUnsafe(g, h) {
  const r = getReplay(g), s = r.snaps[r.meta.baseEnd], s0 = r.snaps[0];
  let D = 0, W = 0; s0.racks[0].cups.forEach(c => { D = Math.max(D, c.d); W = Math.max(W, Math.abs(c.x)); });
  const gap = 0.14, vbw = (2 * D + gap) * 100 + 10, vbh = 2 * (W * 100 + 5), w = h * vbw / vbh;
  let dots = '';
  s.racks.forEach((rk, t) => rk.cups.forEach(c => {
    const cx = (t === 0 ? c.d : 2 * D + gap - c.d) * 100, cy = c.x * 100;
    dots += `<circle class="${c.up ? 'up' : 'sunk'}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${c.up ? 4.4 : 4}"/>`;
  }));
  return `<svg class="glyph" viewBox="-5 ${-(W * 100 + 5)} ${vbw.toFixed(1)} ${vbh.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" role="img" aria-label="Final racks">${dots}</svg>`;
}
/* Decorative top-down rack (hero fallback, empty states) */
function rackSvg(sunk = 0, count = 10) {
  const slots = layoutFor(count, { kind: 'tri' }).sort((a, b) => b.d - a.d || a.x - b.x);   // apex first
  let out = ''; const order = slots.map((_, i) => i);
  slots.forEach((c, i) => {
    const isSunk = i >= slots.length - sunk;   // sunk from the back
    const x = c.x * 100, y = (0.26 - c.d) * 100;
    out += isSunk
      ? `<circle cx="${x}" cy="${y}" r="4.4" fill="none" stroke="rgba(216,162,58,.35)" stroke-width="1"/>`
      : `<circle cx="${x}" cy="${y}" r="4.6" fill="#C8262E" stroke="#F6F3EC" stroke-width="1"/><circle cx="${x}" cy="${y}" r="2.6" fill="#D8A23A"/>`;
  });
  return `<svg viewBox="-24 -6 48 38" aria-hidden="true">${out}</svg>`;
}

/* Bottom sheet (player picker, confirm, More) */
let sheetEl = null, sheetScrim = null, sheetPrevFocus = null;
function openSheet(inner, opts = {}) {
  closeSheet(true);
  sheetPrevFocus = document.activeElement;
  sheetScrim = document.createElement('div'); sheetScrim.className = 'sheet-scrim';
  sheetEl = document.createElement('div'); sheetEl.className = 'sheet'; sheetEl.setAttribute('role', 'dialog'); sheetEl.setAttribute('aria-modal', 'true');
  sheetEl.setAttribute('aria-label', opts.label || 'Sheet');
  sheetEl.innerHTML = '<div class="grab"></div>' + inner;
  document.body.append(sheetScrim, sheetEl);
  sheetScrim.addEventListener('click', () => closeSheet());
  const sc = sheetScrim, sh = sheetEl;
  requestAnimationFrame(() => { sc.classList.add('in'); sh.classList.add('in'); });
  const f = $('input,button,a', sheetEl); if (f) setTimeout(() => f.focus({ preventScroll: true }), 60);
  return sheetEl;
}
function closeSheet(instant) {
  if (!sheetEl) return;
  const s = sheetEl, sc = sheetScrim, pf = sheetPrevFocus; sheetEl = sheetScrim = null;
  s.classList.remove('in'); sc.classList.remove('in');
  const rm = () => { s.remove(); sc.remove(); };
  if (instant || reduceMotion()) rm(); else setTimeout(rm, 200);
  if (pf && pf.focus && document.contains(pf)) pf.focus({ preventScroll: true });
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sheetEl) closeSheet();
  if (e.key === 'Tab' && sheetEl) {
    const f = $$('button:not([disabled]),input,select,a[href]', sheetEl); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

  /* In-page confirm (replaces window.confirm). `body` is plain text and goes in via textContent. */
  function confirmSheet({ title, body, yes, danger, onYes }) {
    const s = openSheet(`<h2></h2><p class="sheet-body"></p>
      <div class="actions"><button class="btn quiet" data-a="no">Cancel</button><button class="btn primary" data-a="yes"></button></div>`, { label: title });
    $('h2', s).textContent = title; $('.sheet-body', s).textContent = body; $('[data-a="yes"]', s).textContent = yes;
    s.addEventListener('click', e => { const a = e.target.closest('[data-a]'); if (!a) return; closeSheet(); if (a.dataset.a === 'yes') onYes(); });
    return s;
  }
  const isSheetOpen = () => !!sheetEl;

  R.ui = { FLAG_DEFS, flag, glyphSvg, rackSvg, openSheet, closeSheet, confirmSheet, isSheetOpen };
})(window.Ruski);
