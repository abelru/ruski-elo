/* Router + "wake" page transitions.
   Hash router: tabs use replaceState (peers), game/profile routes use pushState so Back returns to the list.
   The transition is WAAPI on ONE wrapper (.page): skew + blur + fade. It never blocks input: the outgoing page is
   inert + fixed, and a new navigation finishes the running one. */
(function (R) {
  'use strict';
  const { $, $$, esc, reduceMotion, lowEnd, sgn } = R.util;
  const S = R.state;

const TABS = ['home', 'submit', 'rankings', 'seasons', 'players', 'rules', 'admin'];
const views = R.views = R.views || {};   // each page file registers views[name](route) -> { el, cleanup?, heading?, onShown?, onData? }
let cur = { key: null, view: null, el: null, cleanup: null, idx: 0 };
let pending = null;
const scrollMap = {};

function parseHash() {
  const raw = (location.hash || '#home').slice(1) || 'home';
  const [path, q] = raw.split('?'); const parts = path.split('/');
  let arg = null; try { arg = parts[1] ? decodeURIComponent(parts.slice(1).join('/')) : null; } catch (e) { arg = parts[1]; }
  return { view: views[parts[0]] ? parts[0] : 'home', arg, q: new URLSearchParams(q || '') };
}
const viewIndex = (view, arg) => view === 'game' ? 99 : TABS.indexOf(view) + (arg ? 0.5 : 0);

function go(hash, mode = 'replace') {
  if (mode === 'push') history.pushState({ from: location.hash || '#home', scrollY: window.scrollY }, '', hash);
  else history.replaceState(history.state, '', hash);
  route();
}
function back() {
  if (history.state && history.state.from) history.back(); else go('#home');
}

function finishTransition() {
  if (!pending) return;
  const p = pending; pending = null;
  p.anims.forEach(a => { try { a.cancel(); } catch (e) { } });
  if (p.old) p.old.remove();
  if (p.nw) p.nw.style.willChange = '';
}

/* Pages that read games/roster wait for the first snapshot (or show why it failed). Rules needs no data. */
function build(r) {
  try {
    if (!S.loaded && r.view !== 'rules') return views.loading();
    return views[r.view](r);
  } catch (e) {
    console.error('View failed:', r.view, e);
    const el = R.util.mk('<div class="empty"><h1 class="t-section">Something broke</h1><p style="margin:8px 0 16px">This page hit an error. The rest of the site still works.</p><a class="btn" href="#home">Home</a></div>');
    return { el, heading: 'Error' };
  }
}

function route(opts = {}) {
  const r = parseHash();
  const key = r.view + (r.arg != null ? '/' + r.arg : '');
  if (cur.key === key && !opts.force) return;
  finishTransition();
  const stage = $('#main');
  const oldEl = cur.el, oldIdx = cur.idx;
  if (cur.key) scrollMap[cur.key] = window.scrollY;
  if (cur.cleanup) { try { cur.cleanup(); } catch (e) { console.error(e); } }

  const made = build(r);
  const el = made.el; el.classList.add('page');
  const idx = viewIndex(r.view, r.arg);
  const prev = cur;
  cur = { key, view: r.view, el, cleanup: made.cleanup || null, idx, onData: made.onData || null, loading: !!made.loading };
  updateChrome(r, made);

  let dir = sgn(idx - oldIdx) || 1;
  if (r.view === 'game') dir = 1; else if (prev.view === 'game') dir = -1;
  const targetScroll = r.view === 'game' && !opts.force ? 0 : (scrollMap[key] || 0);

  if (!oldEl || opts.instant) {
    if (oldEl) oldEl.remove();
    stage.insertBefore(el, $('#foot')); window.scrollTo(0, targetScroll);
    if (made.onShown) made.onShown();
    return;
  }
  /* Both pages briefly mounted: old goes position:fixed at its current visual spot so scroll can reset under it. */
  const top = oldEl.getBoundingClientRect().top;
  oldEl.classList.add('leaving'); oldEl.style.top = top + 'px'; oldEl.inert = true; oldEl.setAttribute('aria-hidden', 'true');
  stage.insertBefore(el, $('#foot'));
  window.scrollTo(0, targetScroll);
  if (made.onShown) made.onShown();

  const anims = [];
  const blur = !lowEnd;
  if (reduceMotion()) {
    anims.push(oldEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }));
    anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, fill: 'backwards' }));
  } else {
    oldEl.style.willChange = el.style.willChange = blur ? 'transform, filter, opacity' : 'transform, opacity';
    const f = (v) => blur ? { filter: v } : {};
    anims.push(oldEl.animate([
      { transform: 'none', opacity: 1, ...f('blur(0px)') },
      { transform: `translateX(${-28 * dir}px) skewX(${-6 * dir}deg)`, opacity: 0, ...f('blur(6px)') }
    ], { duration: 140, easing: 'cubic-bezier(.77,0,.175,1)', fill: 'forwards' }));
    anims.push(el.animate([
      { transform: `translateX(${36 * dir}px) skewX(${4 * dir}deg)`, opacity: 0, ...f('blur(10px)') },
      { transform: 'none', opacity: 1, ...f('blur(0px)') }
    ], { duration: 260, delay: 60, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'backwards' }));
    const wake = $('#wake');
    anims.push(wake.animate([
      { opacity: .9, transform: `translateX(${-100 * dir}%)` }, { opacity: 0, transform: `translateX(${100 * dir}%)` }
    ], { duration: 200, easing: 'linear' }));
  }
  pending = { old: oldEl, nw: el, anims };
  const last = anims[1];
  last.onfinish = () => { if (pending && pending.nw === el) finishTransition(); };
}

function updateChrome(r, made) {
  const isGame = r.view === 'game', isProfile = r.view === 'players' && r.arg;
  $('#backbtn').hidden = !(isGame || isProfile);
  $('#mark').hidden = false;
  $$('.app-nav [data-tab]').forEach(a => {
    const t = a.dataset.tab;
    const on = t === r.view || (t === 'more' && (r.view === 'rules' || r.view === 'admin'));
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = (made.heading ? made.heading + ' | ' : '') + 'Fisher Ruski Tracker';
}

document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
    e.preventDefault();
    const href = a.getAttribute('href');
    if (a.hasAttribute('data-push')) go(href, 'push'); else go(href, 'replace');
    return;
  }
});
$('#backbtn').addEventListener('click', back);
window.addEventListener('hashchange', () => route());

/* Realtime updates: the first snapshot swaps the loading page for the real one; later ones let the page update itself. */
R.data.subscribe(() => {
  if (!cur.view) return;
  if (cur.loading && S.loaded) { route({ force: true, instant: true }); return; }
  if (cur.loading && S.error) { route({ force: true, instant: true }); return; }
  if (cur.onData) { try { cur.onData(); } catch (e) { console.error(e); } }
});
$('#morebtn').addEventListener('click', () => {
  const s = R.ui.openSheet(`<h2>More</h2>
    <ul class="ledger">
      <li><a class="lrow grow t-card" href="#rules" style="min-height:52px">Rules</a></li>
      <li><a class="lrow grow t-card" href="#admin" style="min-height:52px">Admin</a></li>
    </ul>`, { label: 'More' });
  s.addEventListener('click', e => { if (e.target.closest('a')) R.ui.closeSheet(); });
});

/* tap feedback: the leaderboard cards tilt on press (140ms), no idle animation */
document.addEventListener('pointerdown', e => { const t = e.target.closest('.tilt'); if (t && !reduceMotion()) t.classList.add('pressed'); });
['pointerup', 'pointercancel', 'pointerleave', 'scroll'].forEach(ev => document.addEventListener(ev, () => $$('.tilt.pressed').forEach(t => t.classList.remove('pressed')), { passive: true, capture: true }));

  R.router = { views, route, go, back, parseHash, current: () => cur };
})(window.Ruski);
