/* Derived stats: player records, rankings, seasons, period highlights. Pure functions over (games, roster). */
(function (root) {
  'use strict';
  const R = (root.Ruski = root.Ruski || {});
  const E = R.elo;

  const DAY = 86400000;
  const PERIODS = { week: 7, month: 30, year: 365, alltime: Infinity };

  /* Timestamp when present, else parse the date string (the first 14 games have no timestamp). */
  function gameDate(g) {
    if (g.timestamp) return new Date(g.timestamp);
    const parsed = new Date(g.date);
    return isNaN(parsed.getTime()) ? new Date(0) : parsed;
  }
  const totalCups = p => (p.cups || 0) + (p.redemptionCups || 0) + (p.overtimeCups || 0);
  const cupsInGames = list => list.reduce((a, g) => a + g.teams.reduce((b, t) => b + t.reduce((c, p) => c + totalCups(p), 0), 0), 0);

  function playerGames(name, games) { return games.filter(g => g.teams.some(t => t.some(p => p.name === name))); }

  function getPlayerStats(name, games) {
    let n = 0, wins = 0, cups = 0, yacks = 0, nakedMiles = 0;
    games.forEach(g => {
      const f = E.findPlayer(g, name); if (!f) return;
      n++; cups += f.data.cups || 0; yacks += f.data.yacks || 0;
      if (f.data.nakedMile) nakedMiles++;
      if (f.team === g.winningTeam) wins++;
    });
    return { games: n, wins, losses: n - wins, cups, yacks, nakedMiles, winRate: n ? Math.round(wins / n * 100) : 0, avg: n ? (cups / n).toFixed(1) : '0.0' };
  }

  /* Rankings are built from the roster, like the live app: removing someone from the roster drops them from the list. */
  function rankedPlayers(roster, games) {
    return roster.map(name => ({ name, elo: E.calculateELO(name, games), ...getPlayerStats(name, games) })).sort((a, b) => b.elo - a.elo);
  }

  /* ---- seasons: July 1 to June 30, identified by the starting year ---- */
  const seasonStartYear = d => d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  const seasonLabel = y => y + '–' + String((y + 1) % 100).padStart(2, '0');
  const seasonRangeText = y => 'July 1, ' + y + ' — June 30, ' + (y + 1);
  const gamesInSeason = (games, y) => games.filter(g => seasonStartYear(gameDate(g)) === y);
  function availableSeasons(games, now) {
    const years = new Set(games.map(g => seasonStartYear(gameDate(g))));
    years.add(seasonStartYear(new Date(now)));
    return [...years].sort((a, b) => b - a);
  }
  function buildSeasonPlayerStats(games) {
    const stats = {};
    games.forEach(game => game.teams.forEach((team, ti) => team.forEach(p => {
      const s = stats[p.name] || (stats[p.name] = { games: 0, wins: 0, losses: 0, regularCups: 0, redemptionCups: 0, overtimeCups: 0, totalCups: 0, yacks: 0, nakedMiles: 0 });
      const reg = p.cups || 0, red = p.redemptionCups || 0, ot = p.overtimeCups || 0;
      s.games++; s.regularCups += reg; s.redemptionCups += red; s.overtimeCups += ot; s.totalCups += reg + red + ot;
      s.yacks += p.yacks || 0;
      if (p.nakedMile) s.nakedMiles++;
      if (ti + 1 === game.winningTeam) s.wins++; else s.losses++;
    })));
    return stats;
  }
  function seasonReport(games) {
    const stats = buildSeasonPlayerStats(games), names = Object.keys(stats);
    const standings = names.map(name => ({
      name, elo: E.calculateELO(name, games), ...stats[name],
      winRate: stats[name].games ? Math.round(stats[name].wins / stats[name].games * 100) : 0,
      avgCups: stats[name].games ? (stats[name].totalCups / stats[name].games).toFixed(1) : '0.0'
    })).sort((a, b) => b.elo - a.elo);
    const pick = (ok, better) => { let best = null; names.forEach(n => { if (ok(stats[n]) && (!best || better(stats[n], stats[best]))) best = n; }); return best; };
    const sharp = pick(() => true, (a, b) => a.totalCups > b.totalCups);
    const record = pick(s => s.games >= 2, (a, b) => a.wins / a.games > b.wins / b.games);
    const clutch = pick(s => s.redemptionCups + s.overtimeCups > 0, (a, b) => a.redemptionCups + a.overtimeCups > b.redemptionCups + b.overtimeCups);
    const land = pick(s => s.yacks > 0, (a, b) => a.yacks > b.yacks);
    const miler = pick(s => s.nakedMiles > 0, (a, b) => a.nakedMiles > b.nakedMiles);
    return {
      stats, standings, champion: standings[0] || null,
      awards: { sharp, record, clutch, land, miler },
      totals: { games: games.length, players: names.length, cups: names.reduce((s, n) => s + stats[n].totalCups, 0), yacks: names.reduce((s, n) => s + stats[n].yacks, 0) }
    };
  }

  /* ---- home highlights (Captain's Table / Fred's Locker / regattas) ----
     Same selection rules as the live updateHighlights(). Period filter uses the date string like live. */
  function periodGames(games, period, now) {
    const cutoff = period === 'alltime' ? new Date(0) : new Date(now - PERIODS[period] * DAY);
    return games.filter(g => new Date(g.date) >= cutoff);
  }
  function periodHighlights(games, period, now, opts) {
    const filtered = periodGames(games, period, now);
    if (!filtered.length) return null;
    const key = (opts && opts.dayKey) || E.dayKey;
    const ps = {}, perDay = {};
    filtered.forEach(game => game.teams.forEach((team, ti) => team.forEach(p => {
      const s = ps[p.name] || (ps[p.name] = { wins: 0, losses: 0, cups: 0, yacks: 0, games: 0, eloChanges: [] });
      s.games++; s.cups += totalCups(p); s.yacks += p.yacks || 0;
      if (ti + 1 === game.winningTeam) s.wins++; else s.losses++;
      const k = key(game);
      const pd = perDay[p.name] || (perDay[p.name] = {});
      pd[k] = (pd[k] || 0) + 1;
      s.eloChanges.push(E.calculateGameEloDelta(game, ti + 1, p, pd[k]));
    })));
    const entries = Object.entries(ps);
    const out = {};
    let hi = 0, hiName = null;
    Object.keys(ps).forEach(n => { const elo = E.calculateELO(n, games, opts); if (elo > hi) { hi = elo; hiName = n; } });
    if (hiName) out.admiral = { name: hiName, elo: hi };
    let mc = 0, mcName = null;
    entries.forEach(([n, s]) => { if (s.cups > mc) { mc = s.cups; mcName = n; } });
    if (mcName) out.sharp = { name: mcName, cups: mc };
    let br = null, bw = -1;
    entries.forEach(([n, s]) => { if (s.games >= 2) { const r = s.wins / s.games; if (r > bw) { bw = r; br = { name: n, ...s }; } } });
    if (br) out.champ = { name: br.name, wins: br.wins, losses: br.losses, rate: Math.round(bw * 100) };
    let bg = 0, bgName = null;
    entries.forEach(([n, s]) => { const m = Math.max(...s.eloChanges); if (m > bg) { bg = m; bgName = n; } });
    if (bgName) out.rise = { name: bgName, gain: Math.round(bg) };
    let wr = null, ww = 2;
    entries.forEach(([n, s]) => { if (s.games >= 2) { const r = s.wins / s.games; if (r < ww) { ww = r; wr = { name: n, ...s }; } } });
    if (wr) out.over = { name: wr.name, wins: wr.wins, losses: wr.losses, rate: Math.round(ww * 100) };
    let my = 0, myName = null;
    entries.forEach(([n, s]) => { if (s.yacks > my) { my = s.yacks; myName = n; } });
    if (myName && my > 0) out.land = { name: myName, yacks: my };
    let lc = Infinity, lcName = null;
    entries.forEach(([n, s]) => { if (s.games >= 2 && s.cups < lc) { lc = s.cups; lcName = n; } });
    if (lcName) out.scal = { name: lcName, cups: lc };
    let wl = 0, wlName = null;
    entries.forEach(([n, s]) => { const m = Math.min(...s.eloChanges); if (m < wl) { wl = m; wlName = n; } });
    if (wlName) out.anchor = { name: wlName, loss: Math.round(wl) };
    let best = null, diff = Infinity;
    filtered.forEach(g => {
      const a = g.teams[0].reduce((s, p) => s + totalCups(p), 0), b = g.teams[1].reduce((s, p) => s + totalCups(p), 0);
      if (Math.abs(a - b) < diff) { diff = Math.abs(a - b); best = { game: g, a, b, diff }; }
    });
    if (best) out.closest = best;
    let brutal = null, my2 = 0;
    filtered.forEach(g => {
      const y = g.teams.reduce((s, t) => s + t.reduce((q, p) => q + (p.yacks || 0), 0), 0);
      if (y > my2) { my2 = y; brutal = { game: g, yacks: y }; }
    });
    if (brutal) out.brutal = brutal;
    out.count = filtered.length;
    return out;
  }

  R.stats = { DAY, PERIODS, gameDate, totalCups, cupsInGames, playerGames, getPlayerStats, rankedPlayers,
    seasonStartYear, seasonLabel, seasonRangeText, gamesInSeason, availableSeasons, seasonReport, periodGames, periodHighlights };
  if (typeof module !== 'undefined' && module.exports) module.exports = R.stats;
})(typeof window !== 'undefined' ? window : globalThis);
