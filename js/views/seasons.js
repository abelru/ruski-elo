/* Seasons: July 1 to June 30. Season ELO restarts at 1000 and is computed over that season's games only. */
(function (R) {
  'use strict';
  const { $, $$, esc, mk } = R.util;
  const { flag } = R.ui;
  const { gameRow, pageHead, emptyCard } = R.shared;
  const ST = R.stats, S = R.state;
  let seasonSel = null;
  const link = name => `#players/${encodeURIComponent(name)}`;

  function awardsHtml(rep) {
    const a = rep.awards, s = rep.stats, c = rep.champion;
    const row = (fl, role, name, fig, small) => name ? `<a class="lrow" href="${link(name)}" data-push>${flag(fl)}<span class="grow"><span class="role t-meta">${role}</span><span class="t-card" style="display:block">${esc(name)}</span></span><span class="fig">${fig}<small>${small}</small></span></a>` : '';
    return [
      row('A', 'Season Champion', c.name, c.elo, c.wins + '-' + c.losses + ' · ELO'),
      row('S', 'Sharpshooter', a.sharp, a.sharp && s[a.sharp].totalCups, 'cups'),
      row('C', 'Best Record', a.record, a.record && Math.round(s[a.record].wins / s[a.record].games * 100) + '%', a.record && s[a.record].wins + '-' + s[a.record].losses),
      row('R', 'Most Clutch', a.clutch, a.clutch && (s[a.clutch].redemptionCups + s[a.clutch].overtimeCups), a.clutch && s[a.clutch].redemptionCups + ' redemption · ' + s[a.clutch].overtimeCups + ' OT'),
      row('L', 'Landlubber', a.land, a.land && s[a.land].yacks, 'yacks'),
      row('O', 'Naked Miler', a.miler, a.miler && s[a.miler].nakedMiles, 'naked miles')
    ].join('');
  }

  R.views.seasons = function () {
    const el = mk('');
    const years = ST.availableSeasons(S.games, Date.now()), cy = ST.seasonStartYear(new Date());
    if (seasonSel === null || !years.includes(seasonSel)) seasonSel = years[0];
    function body() {
      const games = ST.gamesInSeason(S.games, seasonSel);
      if (!games.length) return emptyCard('No games recorded in this season yet.');
      const rep = ST.seasonReport(games), c = rep.champion, t = rep.totals;
      return `<div class="split season"><div class="col-a"><section class="card" style="margin-top:12px">
          <div class="t-meta" style="display:flex;align-items:center;gap:8px">${flag('A')}&nbsp; Season champion · ${ST.seasonLabel(seasonSel)}</div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-top:6px">
            <a href="${link(c.name)}" data-push class="t-title" style="min-height:44px;display:flex;align-items:center">${esc(c.name)}</a><div class="t-hero num" style="color:var(--brass)">${c.elo}</div></div>
          <div class="statline"><div><b>${t.games}</b><span>games</span></div><div><b>${t.players}</b><span>players</span></div><div><b>${t.cups}</b><span>total cups</span></div><div><b>${t.yacks}</b><span>total yacks</span></div></div>
        </section>
        <div class="section"><h2 class="t-section">Season awards</h2><div class="ledger">${awardsHtml(rep)}</div></div></div>
        <div class="col-b"><div class="section"><h2 class="t-section">Season standings</h2>
          <p class="t-meta" style="margin-bottom:8px">Season ELO resets to 1000 each July 1st.</p>
          <div class="scroller"><table class="tbl standings"><thead><tr><th class="n">#</th><th>Player</th><th class="n">ELO</th><th class="n">GP</th><th class="n">W-L</th><th class="n">Win%</th><th class="n">Cups</th><th class="n">Avg</th><th class="n">Yacks</th><th class="n">NM</th></tr></thead><tbody>
          ${rep.standings.map((p, i) => `<tr><td class="n${i === 0 ? ' r1' : ''}">${i + 1}</td><td><a class="plink" href="${link(p.name)}" data-push><b>${esc(p.name)}</b></a></td><td class="n"><b>${p.elo}</b></td><td class="n">${p.games}</td><td class="n">${p.wins}-${p.losses}</td><td class="n">${p.winRate}%</td><td class="n">${p.totalCups}</td><td class="n">${p.avgCups}</td><td class="n">${p.yacks}</td><td class="n">${p.nakedMiles || '-'}</td></tr>`).join('')}
          </tbody></table></div></div>
        <div class="section"><h2 class="t-section">Season games</h2>${games.slice().reverse().map(g => gameRow(g)).join('')}</div></div></div>`;
    }
    el.innerHTML = pageHead('Seasons', ST.seasonRangeText(seasonSel)) +
      `<div class="chips" id="schips" role="group" aria-label="Season">${years.map(y => `<button class="chipbtn" data-y="${y}" aria-pressed="${y === seasonSel}">${ST.seasonLabel(y)}${y === cy ? ' (Current)' : ''}</button>`).join('')}</div><div id="sbody">${body()}</div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-y]'); if (!b) return;
      seasonSel = +b.dataset.y; $$('[data-y]', el).forEach(x => x.setAttribute('aria-pressed', x === b));
      $('#sbody', el).innerHTML = body(); $('.pagehead .t-meta', el).textContent = ST.seasonRangeText(seasonSel);
    });
    return { el, heading: 'Seasons', onData: () => R.router.route({ force: true, instant: true }) };
  };
})(window.Ruski);
