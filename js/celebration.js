/* Submit celebration "Sunk" (~2.5s; tap or Esc skips). Runs after the write, then hands off to the replay. */
(function (R) {
  'use strict';
  const { $, $$, esc, reduceMotion, signed } = R.util;
  const { flag } = R.ui;

function celebrate(g, movers, ctx = {}) {
  return new Promise(resolve => {
    const rm = reduceMotion(), w = g.winningTeam - 1;
    const anyRed = g.teams.some(t => t.some(p => (p.redemptionCups || 0) > 0));
    const winners = g.teams[w].map(p => p.name).join(g.teams[w].length > 2 ? ', ' : ' & ');
    const tag = g.hadOvertime ? 'won in overtime' : anyRed ? 'won after redemption' : 'take the game';
    const rows = movers.slice().sort((a, b) => b.won - a.won || b.delta - a.delta);
    const ov = document.createElement('div'); ov.className = 'cele' + (rm ? ' reduced' : '');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Game saved');
    ov.innerHTML = `
      <div class="cwrap"><div class="ringw"></div>
        ${g.hadOvertime ? '<div class="cup3 back"><div class="b"></div><div class="r"></div></div>' : ''}
        <div class="cup3 main${g.hadOvertime ? ' ot' : ''}"><div class="b"></div><div class="r"></div></div>
        ${Array.from({ length: 10 }, () => '<i class="drop"></i>').join('')}</div>
      <div class="names"><span>${esc(winners)}</span></div><div class="tagline">${tag}</div>
      <ul>${rows.map(m => `<li><span class="nm" style="position:relative">${esc(m.name)}${ctx.newAdmiral === m.name ? '<u style="position:absolute;left:0;right:0;bottom:2px;height:3px;background:var(--brass);transform:scaleX(0);transform-origin:0 50%" data-adm></u>' : ''}</span>${m.p.nakedMile ? `<span class="fl">${flag('O', 'flag')}</span>` : ''}<span class="dl num ${m.delta >= 0 ? 'up' : 'down'}" data-to="${m.delta}">${rm ? signed(m.delta) : '0'}</span></li>`).join('')}</ul>
      <div class="ballc"><i></i></div><div class="skip">Tap to skip</div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('in'));
    let done = false; const timers = [], anims = [], at = (ms, fn) => timers.push(setTimeout(fn, ms));
    const A = (elm, kf, opt) => { const a = elm.animate(kf, opt); anims.push(a); return a; };
    const onKey = e => { if (e.key === 'Escape') finish(); };
    function finish() {
      if (done) return; done = true; timers.forEach(clearTimeout); anims.forEach(a => { try { a.cancel(); } catch (e) { } });
      document.removeEventListener('keydown', onKey); ov.classList.remove('in'); ov.classList.add('out');
      setTimeout(() => { ov.remove(); resolve(); }, rm ? 20 : 160);
    }
    ov.addEventListener('click', finish); document.addEventListener('keydown', onKey);
    if (rm) { $$('.fl', ov).forEach(f => { f.style.transform = 'none'; }); $$('[data-adm]', ov).forEach(u => { u.style.transform = 'none'; }); $$('.ballc,.drop,.ringw', ov).forEach(x => x.remove()); at(1200, finish); return; }
    if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) { try { navigator.vibrate([30, 40, 30]); } catch (e) { } }
    const easeOut = 'cubic-bezier(.23,1,.32,1)', main = $('.cup3.main', ov), ball = $('.ballc', ov), inner = ball.firstChild;
    requestAnimationFrame(() => {
      if (done) return;
      const cr = main.getBoundingClientRect(), br = ball.getBoundingClientRect(), dy = (cr.top + 18) - (br.top + 7);
      A(ball, [{ transform: 'translateY(0) scale(1)' }, { transform: `translateY(${dy}px) scale(.7)` }], { duration: 480, delay: 80, easing: 'cubic-bezier(.33,0,.67,1)', fill: 'both' });
      A(inner, [{ transform: 'translateY(0)', easing: 'cubic-bezier(.2,.7,.4,1)' }, { transform: 'translateY(-120px)', offset: .5, easing: 'cubic-bezier(.6,0,.8,.4)' }, { transform: 'translateY(0)' }], { duration: 480, delay: 80, fill: 'both' });
    });
    at(560, () => {
      ball.style.opacity = 0;
      A(main, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.94)', offset: .5 }, { transform: 'scaleY(1)' }], { duration: 160, easing: 'ease-out' });
      $$('.drop', ov).forEach((d, i) => { const a = i / 10 * Math.PI * 2, r = 30 + (i * 7) % 31; A(d, [{ opacity: 1, transform: 'translate(0,0)' }, { opacity: 0, transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r * .8 - 8}px)` }], { duration: 300, easing: easeOut, fill: 'forwards' }); });
      A($('.ringw', ov), [{ opacity: .9, transform: 'scale(.4)' }, { opacity: .6, transform: 'scale(1)' }], { duration: 300, easing: easeOut, fill: 'forwards' });
    });
    at(700, () => {
      A($('.names', ov), [{ opacity: 0, transform: 'scale(1.08) rotate(-2deg)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: easeOut, fill: 'forwards' });
      A($('.tagline', ov), [{ opacity: 0 }, { opacity: 1 }], { duration: 220, fill: 'forwards' });
    });
    $$('li', ov).forEach((li, i) => at(900 + i * 60, () => {
      A(li, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: easeOut, fill: 'forwards' });
      const out = $('.dl', li), to = +out.dataset.to, t0 = performance.now();
      (function tick(now) { if (done) return; const k = Math.min(1, (now - t0) / 600), e = 1 - Math.pow(1 - k, 3); out.textContent = signed(to * e); if (k < 1) requestAnimationFrame(tick); else out.textContent = signed(to); })(t0);
      const fl = $('.fl', li); if (fl) at(300, () => A(fl, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 240, easing: easeOut, fill: 'forwards' }));
      const u = $('[data-adm]', li); if (u) at(360, () => A(u, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 300, easing: easeOut, fill: 'forwards' }));
    }));
    at(2200, () => { ov.classList.remove('in'); ov.classList.add('out'); });
    at(2500, finish);
  });
}

  R.celebrate = celebrate;
})(window.Ruski);
