/* Home hero: the playable beer pong table (modules/minigame.js). The static SVG rack under it stays
   if WebGL, Save-Data, low memory or the three.js CDN fails. */
(function (R) {
  'use strict';

const heroAllowed = () => !(navigator.connection && navigator.connection.saveData) && !(navigator.deviceMemory && navigator.deviceMemory < 4);
let heroCtx = null;   // { box, wc } of the mounted Home hero, so a theme change can remount it
function heroMount(box, sunk, wc) {
  heroCtx = { box, sunk, wc };
  if (!heroAllowed() || !window.RuskiMiniGame) return;
  const start = () => {
    if (!box.isConnected || !heroCtx || heroCtx.box !== box) return;
    window.RuskiMiniGame.mount(box, { css: false, caption: { value: String(wc), label: 'cups sunk this week' },
      cpuHitRate, onGameOver: r => { if (r.won) goCrazy(); }, onStats: r => R.data.addMinigameShots(r.shots, r.hits) });
  };
  const idle = window.requestIdleCallback || (f => setTimeout(f, 250));   // lazy: after first paint
  if (document.readyState === 'complete') idle(start, { timeout: 1500 });
  else window.addEventListener('load', () => idle(start, { timeout: 1500 }), { once: true });
}
function heroUnmount() { heroCtx = null; if (window.RuskiMiniGame) window.RuskiMiniGame.unmount(); }
/* Colours are read once per mount, so Tournament Day needs a fresh mount to re-tint the canvas */
function heroRemount() {
  if (!heroCtx || !heroCtx.box.isConnected) return;
  const { box, sunk, wc } = heroCtx;
  if (window.RuskiMiniGame) window.RuskiMiniGame.unmount();
  heroMount(box, sunk, wc);
}

/* The CPU shoots like the people who play the mini game: everyone's hits / everyone's shots (R.state.mg).
   Until there are plenty of shots that number is noisy, so it's blended with a starting guess worth PRIOR_SHOTS
   shots. The guess comes from real games: they only store cups, not shots, so assume an average player takes
   about SHOTS_PER_GAME shots a game, i.e. guess = average cups per player per game / SHOTS_PER_GAME. */
const SHOTS_PER_GAME = 16, PRIOR_SHOTS = 150;
function cpuHitRate() {
  let cups = 0, n = 0;
  (R.state.games || []).forEach(g => g.teams.forEach(t => t.forEach(p => { cups += p.cups || 0; n++; })));
  const guess = n ? Math.min(0.45, Math.max(0.15, cups / n / SHOTS_PER_GAME)) : 0.28;
  const mg = R.state.mg || { shots: 0, hits: 0 };
  return Math.min(0.6, Math.max(0.1, (mg.hits + guess * PRIOR_SHOTS) / (mg.shots + PRIOR_SHOTS)));
}

/* You beat the CPU: the whole site loses it for a few seconds. Tap anywhere to stop early. */
let crazyEl = null;
function goCrazy() {
  if (crazyEl) return;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = crazyEl = document.createElement('div');
  el.className = 'crazy' + (calm ? ' calm' : '');
  el.setAttribute('role', 'status');
  let bits = '';
  if (!calm) for (let i = 0; i < 44; i++) {
    const cup = i % 3 === 0, size = cup ? 22 + Math.random() * 18 : 10 + Math.random() * 16;
    bits += `<i class="${cup ? 'c' : 'b'}" style="left:${(Math.random() * 100).toFixed(1)}%;width:${size.toFixed(0)}px;height:${(cup ? size * 1.2 : size).toFixed(0)}px;` +
      `animation-delay:${(Math.random() * 1.6).toFixed(2)}s;animation-duration:${(1.6 + Math.random() * 1.4).toFixed(2)}s;--spin:${((Math.random() - 0.5) * 900).toFixed(0)}deg;--drift:${((Math.random() - 0.5) * 160).toFixed(0)}px"></i>`;
  }
  el.innerHTML = bits + '<div class="crazy-banner"><span>You beat the CPU</span><small>Ruski legend. Tell everyone.</small></div>';
  document.body.appendChild(el);
  document.body.classList.add('crazy-on');
  try { navigator.vibrate && navigator.vibrate([90, 50, 90, 50, 200]); } catch (e) { /* no vibration */ }
  const stop = () => {
    if (!crazyEl) return;
    document.body.classList.remove('crazy-on'); crazyEl.remove(); crazyEl = null;
    document.removeEventListener('pointerdown', stop, true);
  };
  setTimeout(() => document.addEventListener('pointerdown', stop, true), 400);
  setTimeout(stop, calm ? 2500 : 4800);
}

  R.hero = { mount: heroMount, unmount: heroUnmount, remount: heroRemount, goCrazy };
})(window.Ruski);
