/* Rankings: CSS-3D podium for the top three, then the full ELO ledger (built from the roster, like the old app). */
(function (R) {
  'use strict';
  const { $, esc, mk, reduceMotion } = R.util;
  const { ranked, pageHead, emptyCard } = R.shared;

  function towerHtml(p, rank) {
    const cupsN = 4 - rank;   // 1st 3 cups, 2nd 2, 3rd 1
    const cupHtml = Array.from({ length: cupsN }, (_, i) => `<div class="pcup" style="z-index:${10 - i}"><div class="rim"></div><div class="body"></div></div>`).join('');
    const rot = rank === 1 ? 'translateZ(34px)' : rank === 2 ? 'rotateY(16deg)' : 'rotateY(-16deg)';
    return `<a class="tower r${rank}" href="#players/${encodeURIComponent(p.name)}" data-push style="transform:${rot}">
      <div class="stack">${cupHtml}</div>
      <div class="plate"><div class="nm ell">${esc(p.name)}</div><div class="pe num">${p.elo}</div></div><div class="base"></div></a>`;
  }

  R.views.rankings = function () {
    const el = mk(''), list = ranked(), top = list.slice(0, 3);
    if (!list.length) { el.innerHTML = pageHead('Rankings', 'ELO, all time') + emptyCard('No players yet.'); return { el, heading: 'Rankings' }; }
    el.innerHTML = pageHead('Rankings', list.length + ' players · all time') + '<div class="rankings">' +
      (top.length === 3 ? `<div class="podium" id="podium"><div class="floor">${towerHtml(top[1], 2)}${towerHtml(top[0], 1)}${towerHtml(top[2], 3)}</div></div>` : '<div></div>') +
      `<div><div class="rk-head" aria-hidden="true"><span class="rankno"></span><span class="grow">Player</span><span class="rk-cols">Record</span><span class="rk-cols">Win %</span><span class="rk-cols">Games</span><span class="elo">ELO</span></div>
      <div class="ledger">${list.map((p, i) => `<a class="lrow" href="#players/${encodeURIComponent(p.name)}" data-push>
        <span class="rankno${i === 0 ? ' r1' : ''}">${i + 1}</span>
        <span class="grow"><span class="t-card" style="display:block">${esc(p.name)}</span><span class="t-meta rk-meta">${p.games} games · ${p.wins}-${p.losses} · ${p.winRate}% wins</span></span>
        <span class="rk-cols num">${p.wins}-${p.losses}</span><span class="rk-cols num">${p.winRate}%</span><span class="rk-cols num">${p.games}</span>
        <span class="elo">${p.elo}</span></a>`).join('')}</div></div></div>`;
    let onOri = null;
    return {
      el, heading: 'Rankings',
      onShown() {
        const pod = $('#podium', el);
        if (!pod || reduceMotion() || typeof DeviceOrientationEvent === 'undefined' || typeof DeviceOrientationEvent.requestPermission === 'function' || !matchMedia('(pointer: coarse)').matches) return;
        let raf = 0;
        onOri = e => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0;
          const ty = Math.max(-4, Math.min(4, (e.gamma || 0) / 8)), tx = Math.max(-4, Math.min(4, ((e.beta || 45) - 45) / 10));
          pod.style.setProperty('--tilty', ty + 'deg'); pod.style.setProperty('--tiltx', (-tx) + 'deg'); }); };
        window.addEventListener('deviceorientation', onOri, { passive: true });
      },
      cleanup() { if (onOri) window.removeEventListener('deviceorientation', onOri); },
      onData: () => R.router.route({ force: true, instant: true })
    };
  };
})(window.Ruski);
