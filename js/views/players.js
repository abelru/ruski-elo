/* Players: the roster list with search, and the profile page (#players/<name>). */
(function (R) {
  'use strict';
  const { $, $$, esc, mk } = R.util;
  const { glyphSvg } = R.ui;
  const { ranked, gameRow, pageHead } = R.shared;
  const ST = R.stats, E = R.elo, S = R.state;
  const link = name => `#players/${encodeURIComponent(name)}`;
  const refresh = () => R.router.route({ force: true, instant: true });

  R.views.players = function (r) {
    if (r.arg) return profileView(r.arg);
    const el = mk(''), list = ranked();
    el.innerHTML = pageHead('Players', list.length + ' on the roster') +
      `<label class="field"><span class="sr">Find a player</span><input class="input" type="search" id="q" placeholder="Find a player" autocomplete="off"></label>
      <div class="ledger players-list" id="plist" style="margin-top:8px">${list.map((p, i) => `<a class="lrow" data-n="${esc(p.name.toLowerCase())}" href="${link(p.name)}" data-push>
        <span class="rankno${i === 0 ? ' r1' : ''}">${i + 1}</span><span class="grow"><span class="t-card" style="display:block">${esc(p.name)}</span><span class="t-meta">${p.games} games \u00b7 ${p.wins}W-${p.losses}L \u00b7 ${p.cups} cups \u00b7 ${p.winRate}% wins</span></span><span class="elo">${p.elo}</span></a>`).join('')}</div>
      <p class="empty" id="none" ${list.length ? 'hidden' : ''}>${list.length ? 'No player by that name.' : 'No players yet.'}</p>`;
    el.addEventListener('input', e => {
      if (e.target.id !== 'q') return; const q = e.target.value.trim().toLowerCase(); let n = 0;
      $$('#plist a', el).forEach(a => { const ok = !q || a.dataset.n.includes(q); a.hidden = !ok; if (ok) n++; });
      const none = $('#none', el); none.textContent = 'No player by that name.'; none.hidden = n > 0;
    });
    return { el, heading: 'Players', onData: () => { if (document.activeElement && document.activeElement.id === 'q') return; refresh(); } };
  };

  function profileView(name) {
    const el = mk(''), list = ranked();
    const games = ST.playerGames(name, S.games);
    let me = list.find(p => p.name === name);
    /* Someone removed from the roster can still appear in old games: show their record from the games. */
    if (!me && games.length) me = { name, elo: E.calculateELO(name, S.games), ...ST.getPlayerStats(name, S.games) };
    if (!me) { el.innerHTML = `<div class="empty"><h1 class="t-section">No such player</h1><p style="margin:8px 0 16px">${esc(name)} is not on the roster.</p><a class="btn" href="#players">All players</a></div>`; return { el, heading: 'Player' }; }
    const rank = list.indexOf(me) + 1;
    const last10 = games.slice(-10).reverse();
    const won = g => E.findPlayer(g, name).team === g.winningTeam;
    const opp = {};
    games.forEach(g => {
      const f = E.findPlayer(g, name);
      g.teams[2 - f.team].forEach(o => {
        const x = opp[o.name] || (opp[o.name] = { w: 0, l: 0, last: 0 });
        if (f.team === g.winningTeam) x.w++; else x.l++;
        x.last = Math.max(x.last, ST.gameDate(g).getTime());
      });
    });
    const rivals = Object.entries(opp).sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l) || b[1].last - a[1].last).slice(0, 3);
    const hist = E.eloHistory(name, S.games);
    let tide = '<p class="t-meta">No games yet.</p>';
    if (hist.length > 1) {
      const mn = Math.min(...hist), mx = Math.max(...hist), pad = (mx - mn) * 0.15 || 10;
      const pts = hist.map((v, i) => [i / (hist.length - 1) * 300, 90 - (v - mn + pad * .5) / (mx - mn + pad * 1.5) * 84]);
      const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
      const hi = hist.indexOf(mx), lo = hist.indexOf(mn);
      tide = `<div class="tide-wrap"><svg class="tide" viewBox="0 0 300 96" preserveAspectRatio="none" role="img" aria-label="ELO history: peak ${mx}, low ${mn}"><path class="f" d="${path}L300 96L0 96Z"/><path class="l" d="${path}"/></svg><i style="left:${(pts[hi][0] / 3).toFixed(2)}%;top:${pts[hi][1].toFixed(1)}px"></i><i class="lo" style="left:${(pts[lo][0] / 3).toFixed(2)}%;top:${pts[lo][1].toFixed(1)}px"></i></div>
        <div class="t-meta" style="display:flex;justify-content:space-between;margin-top:6px"><span>Low ${mn}</span><span>Peak ${mx}</span></div>`;
    }
    el.innerHTML = `<div class="split profile"><div class="col-a">
      <div class="t-meta">${rank ? '#' + rank + ' of ' + list.length : 'Not on the roster'}</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px"><h1 class="t-title">${esc(name)}</h1><div class="t-hero num"${rank === 1 ? ' style="color:var(--brass)"' : ''}>${me.elo}</div></div>
      <div class="statline"><div><b>${me.games}</b><span>games</span></div><div><b>${me.wins}-${me.losses}</b><span>record</span></div><div><b>${me.winRate}%</b><span>win rate</span></div><div><b>${me.cups}</b><span>total cups</span></div><div><b>${me.avg}</b><span>cups / game</span></div><div><b>${me.yacks}</b><span>yacks</span></div><div><b>${me.nakedMiles}</b><span>naked miles</span></div></div>
      ${last10.length ? `<div class="section"><h2 class="t-section">Last ${last10.length}</h2>
        <div class="strip">${last10.map(g => `<a href="#game/${g.id}" data-push aria-label="Game ${g.id}, ${won(g) ? 'win' : 'loss'}">${glyphSvg(g, 26)}<span class="wl ${won(g) ? 'w' : 'l'}">${won(g) ? 'W' : 'L'}</span></a>`).join('')}</div></div>` : ''}
      ${rivals.length ? `<div class="section"><h2 class="t-section">Rivals</h2><div class="ledger">${rivals.map(([n, x]) => `<a class="lrow" href="${link(n)}" data-push><span class="grow t-card">vs. ${esc(n)}</span><span class="t-fig">${x.w}\u2013${x.l}</span><span class="t-meta" style="min-width:64px;text-align:right">last ${new Date(x.last).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></a>`).join('')}</div></div>` : ''}
      <div class="section"><h2 class="t-section">Tide</h2>${tide}</div></div>
      <div class="col-b"><div class="section"><h2 class="t-section">Game history</h2>${games.length ? games.slice().reverse().map(g => gameRow(g, { player: name })).join('') : '<p class="t-meta">No games yet.</p>'}</div></div></div>`;
    return { el, heading: name, onData: refresh };
  }
})(window.Ruski);
