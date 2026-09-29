/* Boot: last file loaded. Everything else has registered itself on window.Ruski by now. */
(function (R) {
  'use strict';
  const { $, isoDay } = R.util;

  $('#main').setAttribute('tabindex', '-1');
  $('.sr[href="#main"]').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); $('#main').focus(); });

  /* "Last updated" is the deploy time: GitHub Pages sends Last-Modified for index.html. */
  const lm = new Date(document.lastModified), when = isNaN(lm) ? new Date() : lm;
  $('#updated').textContent = when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  $('#updated').dateTime = isoDay(when.getTime());

  /* EmailJS is initialised as before; the old app never sent a message with it, so nothing else uses it. */
  try { if (window.emailjs) window.emailjs.init(R.config.emailjsKey); } catch (e) { console.warn('EmailJS init failed', e); }

  R.tournament.hint();     // apply last known theme before first paint of the page
  R.data.init();           // firebase listener, or the dev fixture
  R.router.route();
})(window.Ruski);
