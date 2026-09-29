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
    window.RuskiMiniGame.mount(box, { css: false, caption: { value: String(wc), label: 'cups sunk this week' } });
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

  R.hero = { mount: heroMount, unmount: heroUnmount, remount: heroRemount };
})(window.Ruski);
