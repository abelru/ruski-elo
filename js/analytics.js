/* Analytics: GoatCounter page views + a few events. No cookies, no personal data.
 *
 *   R.analytics { page(view, hasArg), event(name, title) }
 *
 * The site is a hash router, so GoatCounter's automatic page view is off (no_onload in index.html) and the
 * router reports each page instead. Paths are view-level only ("/players", "/players/profile"), never
 * player names or game ids. Nothing is counted in ?mock=1 / ?readonly=1, and GoatCounter itself skips localhost.
 */
(function () {
  'use strict';
  const R = (window.Ruski = window.Ruski || {});
  const queue = [];
  let flushing = null;

  function live() { return !R.data || R.data.mode === 'live'; }
  function ready() { return window.goatcounter && typeof window.goatcounter.count === 'function'; }
  function send(hit) { try { window.goatcounter.count(hit); } catch (e) { } }
  /* count.v4.js loads async, so early hits wait for it (up to ~10s, then they're dropped). */
  function push(hit) {
    if (!live()) return;
    if (ready()) return send(hit);
    queue.push(hit);
    if (flushing) return;
    let tries = 0;
    flushing = setInterval(() => {
      if (ready()) { while (queue.length) send(queue.shift()); }
      if (ready() || ++tries > 40) { clearInterval(flushing); flushing = null; queue.length = 0; }
    }, 250);
  }

  R.analytics = {
    page(view, hasArg) {
      const path = '/' + view + (hasArg ? (view === 'game' ? '' : '/detail') : '');
      push({ path, title: view.charAt(0).toUpperCase() + view.slice(1) });
    },
    event(name, title) { push({ path: name, title: title || name, event: true }); }
  };
})();
