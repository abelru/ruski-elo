/* Home: hero (playable rack), latest game, period highlights, game list. */
(function (R) {
  'use strict';
  const { $, $$, esc, mk, signed } = R.util;
  const { flag, rackSvg } = R.ui;
  const { gameRow, ranked, emptyCard } = R.shared;
  const ST = R.stats, S = R.state;

  let homePeriod = 'week', showAllGames = false;
  const PERIOD_LABEL = { week: 'this week', month: 'this month', year: 'this year', alltime: 'all time' };
  const link = name => `#players/${encodeURIComponent(name)}`;

  /* One ledger row per highlight, same picks as the old Nautical Leaderboards. */
  function ledgerRow(fl, role, who, fig, small) {
    return `<a class="lrow" href="${link(who)}" data-push>${flag(fl)}
      <span class="grow"><span class="role">${role}</span><span class="name" style="display:block">${esc(who)}</span></span>
      <span class="fig">${fig}<small>${small}</small></span></a>`;
  }
  function gameLedgerRow(fl, role, g, fig, small) {
    const w = g.winningTeam - 1;
    return `<a class="lrow" href="#game/${g.id}" data-push>${flag(fl)}
      <span class="grow"><span class="role">${role}</span><span class="name" style="display:block">${esc(R.shared.teamName(g, 0))} <span class="beat">vs</span> ${esc(R.shared.teamName(g, 1))}</span></span>
      <span class="fig">${fig}<small>${small}</small></span></a>`;
  }

  function highlightsHtml(period) {
    const h = ST.periodHighlights(S.games, period, Date.now());
    if (!h) return `<div class="card empty">${rackSvg(0).replace('<svg', '<svg class="empty-rack"')}<p>No games ${PERIOD_LABEL[period]} yet. Racking up…</p></div>`;
    const rows = (arr) => arr.filter(Boolean).join('');
    return `
    <section class="card tilt titles" aria-labelledby="ct"><h2 class="t-section" id="ct">Captain’s Table</h2><div class="ledger">${rows([
      h.admiral && ledgerRow('A', 'Admiral · highest ELO', h.admiral.name, h.admiral.elo, 'ELO'),
      h.sharp && ledgerRow('S', 'Sharpshooter · most cups', h.sharp.name, h.sharp.cups, 'cups'),
      h.champ && ledgerRow('C', 'Champion · best win rate', h.champ.name, h.champ.rate + '%', h.champ.wins + '-' + h.champ.losses),
      h.rise && ledgerRow('R', 'Rising Tide · biggest ELO gain', h.rise.name, '<span class="up">+' + h.rise.gain + '</span>', 'in one game')
    ])}</div></section>
    <section class="titles plain" aria-labelledby="fl"><h2 class="t-section" id="fl">Fred’s Locker</h2><div class="ledger">${rows([
      h.over && ledgerRow('O', 'Overboard · worst win rate', h.over.name, h.over.rate + '%', h.over.wins + '-' + h.over.losses),
      h.land && ledgerRow('L', 'Landlubber · most yacks', h.land.name, h.land.yacks, 'yacks'),
      h.scal && ledgerRow('X', 'Scallywag · fewest cups', h.scal.name, h.scal.cups, 'cups'),
      h.anchor && ledgerRow('N', 'Anchor · biggest ELO loss', h.anchor.name, '<span class="down">' + signed(h.anchor.loss) + '</span>', 'in one game')
    ])}</div></section>
    <section class="titles plain" aria-labelledby="lr"><h2 class="t-section" id="lr">Legendary Regattas</h2><div class="ledger">${rows([
      h.closest && gameLedgerRow('C', 'Battle of the Ages · most competitive', h.closest.game, h.closest.a + '–' + h.closest.b, 'cups, diff ' + h.closest.diff),
      h.brutal && gameLedgerRow('L', 'Most Brutal · most yacks', h.brutal.game, h.brutal.yacks, 'yacks total')
    ])}</div></section>`;
  }

  R.views.home = function () {
    const el = mk('');
    const wc = ST.cupsInGames(ST.periodGames(S.games, 'week', Date.now())), sunk = wc % 10;   // cups sunk toward the next full rack
    el.innerHTML = `
     <div class="home"><div class="home-main">
      <section class="tbanner" aria-labelledby="tb-h"><h2 class="t-title" id="tb-h">Welcome to the 25th Annual Ruski Tournament</h2>
        <p>The ultimate battle for beer pong glory.</p><span class="marker">Sign up this week</span>
        <a class="btn" href="${esc(R.config.signupUrl)}" target="_blank" rel="noopener">Sign up now</a></section>
      <div class="hero" id="hero">
        <div class="fallback">${rackSvg(sunk)}</div>
        <div class="cap"><div><div class="t-hero num">${wc}</div></div>
          <div class="t-meta">cups sunk this week<br>${Math.floor(wc / 10)} full rack${Math.floor(wc / 10) === 1 ? '' : 's'} + ${wc % 10}</div></div>
      </div>
      <h1 class="sr">Home</h1>
      <div class="statline homestats" id="hstats"></div>
      <div class="latest" id="latest"></div>
      <div class="section games"><div class="pagehead"><h2 class="t-section">Games</h2><span class="t-meta" id="gcount"></span></div>
        <div id="glist"></div><div id="gmore"></div>
      </div></div>
      <aside class="home-side"><div class="section"><div class="seg" role="group" aria-label="Period" id="period">
        ${Object.keys(ST.PERIODS).map(k => `<button aria-pressed="${k === homePeriod}" data-p="${k}">${{ week: 'Week', month: 'Month', year: 'Year', alltime: 'All time' }[k]}</button>`).join('')}
      </div></div>
      <div id="hl" style="margin-top:12px"></div></aside></div>`;

    /* Everything below the hero can be refreshed when another phone logs a game, without touching the mini-game. */
    function fill() {
      const r = ranked(), list = S.games.slice().reverse(), shown = showAllGames ? list : list.slice(0, 8), latest = S.games[S.games.length - 1];
      $('#hstats', el).innerHTML = `<div><b>${S.roster.length}</b><span>players</span></div><div><b>${S.games.length}</b><span>games played</span></div><div><b>${r.length ? r[0].elo : 0}</b><span>highest ELO</span></div>`;
      $('#latest', el).innerHTML = latest ? `<div class="grow"><div class="t-meta" style="margin-bottom:2px">Latest game</div>${gameRow(latest, { big: true })}</div>` : '';
      $('#gcount', el).textContent = S.games.length + ' logged';
      $('#glist', el).innerHTML = shown.map(g => gameRow(g)).join('') || `<div class="empty"><p>No games played yet. Log your first game.</p></div>`;
      $('#gmore', el).innerHTML = list.length > 8 ? `<button class="btn quiet block" id="more" style="margin-top:12px">${showAllGames ? 'Show fewer' : 'Show all ' + list.length + ' games'}</button>` : '';
      $('#hl', el).innerHTML = highlightsHtml(homePeriod);
    }
    fill();
    el.addEventListener('click', e => {
      const b = e.target.closest('#period button');
      if (b) { homePeriod = b.dataset.p; $$('#period button', el).forEach(x => x.setAttribute('aria-pressed', x === b)); $('#hl', el).innerHTML = highlightsHtml(homePeriod); return; }
      if (e.target.closest('#more')) { showAllGames = !showAllGames; fill(); }
    });
    return { el, heading: 'Home', onShown: () => R.hero.mount($('#hero', el), sunk, wc), cleanup: () => R.hero.unmount(), onData: fill };
  };
})(window.Ruski);
