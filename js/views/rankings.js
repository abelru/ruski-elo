/* Rankings: CSS-3D podium for the top three, then the full ELO ledger (built from the roster, like the old app). */
(function (R) {
  'use strict';
  const { $, esc, mk, reduceMotion } = R.util;
  const { ranked, pageHead, emptyCard } = R.shared;

  function towerHtml(p, rank, val) {
    const cupsN = 4 - rank;   // 1st 3 cups, 2nd 2, 3rd 1
    const cupHtml = Array.from({ length: cupsN }, (_, i) => `<div class="pcup" style="z-index:${10 - i}"><div class="rim"></div><div class="body"></div></div>`).join('');
    const rot = rank === 1 ? 'translateZ(34px)' : rank === 2 ? 'rotateY(16deg)' : 'rotateY(-16deg)';
    return `<a class="tower r${rank}" href="#players/${encodeURIComponent(p.name)}" data-push style="transform:${rot}">
      <div class="stack">${cupHtml}</div>
      <div class="plate"><div class="nm ell">${esc(p.name)}</div><div class="pe num">${val}</div></div><div class="base"></div></a>`;
  }

  /* Three boards. Win % and cup average only count players with more than MIN_GAMES games; ties go to whoever played more. */
  const MIN_GAMES = 5;
  const allCups = p => p.totalCups / p.games;
  const BOARDS = {
    elo:    { tab: 'ELO', sub: 'ELO, all time', col: 'ELO', val: p => p.elo },
    winrate:{ tab: 'Win %', sub: 'Highest win rate · more than ' + MIN_GAMES + ' games played · ties go to more games', col: 'Win %', val: p => p.winRate + '%',
              sort: (a, b) => (b.wins / b.games) - (a.wins / a.games) || b.games - a.games },
    cups:   { tab: 'Cup avg', sub: 'Most cups per game (incl. redemption + OT) · more than ' + MIN_GAMES + ' games played · ties go to more games', col: 'Cups/game', val: p => allCups(p).toFixed(2),
              sort: (a, b) => allCups(b) - allCups(a) || b.games - a.games }
  };
  let board = 'elo';

  function boardList() {
    const all = ranked(), B = BOARDS[board];
    if (!B.sort) return all;
    const games = R.state.games;
    return all.filter(p => p.games > MIN_GAMES).map(p => ({ ...p, totalCups: games.reduce((sum, g) => {
      const f = R.elo.findPlayer(g, p.name); return f ? sum + (f.data.cups || 0) + (f.data.redemptionCups || 0) + (f.data.overtimeCups || 0) : sum; }, 0) })).sort(B.sort);
  }

  R.views.rankings = function () {
    const el = mk(''), B = BOARDS[board], list = boardList(), top = list.slice(0, 3);
    const tabs = `<div class="seg rk-tabs" role="group" aria-label="Ranking">${Object.keys(BOARDS).map(k =>
      `<button type="button" data-board="${k}" aria-pressed="${k === board}">${BOARDS[k].tab}</button>`).join('')}</div>`;
    const head = pageHead('Rankings', (board === 'elo' ? list.length + ' players · all time' : B.sub)) + tabs;
    if (!list.length) { el.innerHTML = head + emptyCard(board === 'elo' ? 'No players yet.' : 'Nobody has played more than ' + MIN_GAMES + ' games yet.'); }
    else el.innerHTML = head + '<div class="rankings">' +
      (top.length === 3 ? `<div class="podium" id="podium"><div class="floor">${towerHtml(top[1], 2, B.val(top[1]))}${towerHtml(top[0], 1, B.val(top[0]))}${towerHtml(top[2], 3, B.val(top[2]))}</div></div>` : '<div></div>') +
      `<div><div class="rk-head" aria-hidden="true"><span class="rankno"></span><span class="grow">Player</span><span class="rk-cols">Record</span><span class="rk-cols">Win %</span><span class="rk-cols">Games</span><span class="elo">${B.col}</span></div>
      <div class="ledger">${list.map((p, i) => `<a class="lrow" href="#players/${encodeURIComponent(p.name)}" data-push>
        <span class="rankno${i === 0 ? ' r1' : ''}">${i + 1}</span>
        <span class="grow"><span class="t-card" style="display:block">${esc(p.name)}</span><span class="t-meta rk-meta">${p.games} games · ${p.wins}-${p.losses} · ${p.winRate}% wins</span></span>
        <span class="rk-cols num">${p.wins}-${p.losses}</span><span class="rk-cols num">${p.winRate}%</span><span class="rk-cols num">${p.games}</span>
        <span class="elo">${B.val(p)}</span></a>`).join('')}</div></div></div>`;
    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-board]'); if (!btn || btn.dataset.board === board) return;
      board = btn.dataset.board; R.router.route({ force: true, instant: true });
    });
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
