/* Rules + ELO. Pure: no DOM, no state, so tools/elo-diff.mjs can load this file in Node.
   The math is the live app's, unchanged. The one intended difference is dayKey(): the multi-game
   bonus is per CALENDAR DAY, and the old code keyed it by weekday name ("Sat"), which lumped every
   Saturday in history together. */
(function (root) {
  'use strict';
  const R = (root.Ruski = root.Ruski || {});

  /* Cups per side. Rules page: 2v2 = 10, beer scales linearly at 1.5 beers/cup. 1v1 = 10 (owner decision). */
  const rackSize = size => ({ 1: 10, 2: 10, 3: 15, 4: 20 })[size] || 10;
  /* Overtime rack: 1v1 = 3, 2v2 = 6 (3-2-1), 3v3 = 10 (4-3-2-1), 4v4+ = 3 per player. */
  const otRack = size => ({ 1: 3, 2: 6, 3: 10, 4: 12 })[size] || 3 * size;

  /* ---- day keys ------------------------------------------------------------------------------
     Records carry two date formats: "Sat, Sep 27, 2025" (current) and "10/2/2025, 10:31:53 PM"
     (the first 14 games). Both are the submitter's LOCAL calendar day, so the day is read from the
     date string itself (no timezone math, same answer for every viewer). If the string can't be read
     the timestamp is used, and if that is missing too the game counts as its own day. */
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const ymd = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  function dayKey(game) {
    const s = typeof game.date === 'string' ? game.date.trim() : '';
    let m = s.match(/^[A-Za-z]{3,9}\.?,?\s+([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);   // Sat, Sep 27, 2025
    if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return ymd(m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);                                              // 10/2/2025, 10:31:53 PM
    if (m) return ymd(m[3], +m[1], +m[2]);
    if (Number.isFinite(game.timestamp)) { const d = new Date(game.timestamp); return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
    return 'undated:' + game.id;
  }
  /* The old key, kept only so the regression script can prove nothing else changed. */
  const legacyWeekdayKey = game => game.date.split(',')[0];

  function calculateGameEloDelta(game, playerTeam, playerData, gameNumber) {
    const isWinner = playerTeam === game.winningTeam;
    const teamSize = game.size;

    const regularCups = playerData.cups || 0;
    const redemptionCups = playerData.redemptionCups || 0;
    const overtimeCups = playerData.overtimeCups || 0;
    const totalCupsHit = regularCups + redemptionCups + overtimeCups;

    const cupPoints = (regularCups * 10) + (redemptionCups * 20) + (overtimeCups * 15);

    const fairShareCups = 10 / teamSize;
    const cupsAboveFairShare = totalCupsHit - fairShareCups;
    const performanceMultiplier = 1 + (cupsAboveFairShare * 0.15);

    let winLossAdjustment = 0;
    if (isWinner) {
      winLossAdjustment = 20 / teamSize;
    } else {
      if (totalCupsHit < fairShareCups) winLossAdjustment = cupsAboveFairShare * 15;
      else winLossAdjustment = 0;
    }

    const yackPenalty = (playerData.yacks || 0) * -15;
    const nakedMilePenalty = totalCupsHit === 0 ? -100 : 0;

    let clutchBonus = 0;
    if (isWinner && redemptionCups > 0) clutchBonus = 15;
    if (isWinner && overtimeCups > 0) clutchBonus += 10;

    let eloChange = (cupPoints * performanceMultiplier) + winLossAdjustment + clutchBonus + yackPenalty + nakedMilePenalty;

    if (gameNumber === 2) eloChange *= 1.05;
    else if (gameNumber >= 3) eloChange *= 1.10;

    return eloChange;
  }

  /* The player's team number (1/2) and record in a game, or null. Last match wins, like the live code. */
  function findPlayer(game, name) {
    let team = null, data = null;
    game.teams.forEach((t, ti) => t.forEach(p => { if (p.name === name) { team = ti + 1; data = p; } }));
    return team ? { team, data } : null;
  }

  /* One pass over the games in array order. Returns [{ gi, game, team, data, delta, elo }]
     where elo is the UNROUNDED running total after that game. opts.dayKey swaps the day-key function. */
  function eloTrail(playerName, games, opts) {
    const key = (opts && opts.dayKey) || dayKey;
    let elo = 1000; const perDay = {}, out = [];
    games.forEach((game, gi) => {
      const f = findPlayer(game, playerName);
      if (!f) return;
      const k = key(game);
      perDay[k] = (perDay[k] || 0) + 1;
      const delta = calculateGameEloDelta(game, f.team, f.data, perDay[k]);
      elo += delta;
      out.push({ gi, game, team: f.team, data: f.data, delta, elo });
    });
    return out;
  }

  /* gamesList: every game ever by default; pass a filtered list (a season) for a scoped ELO. */
  function calculateELO(playerName, games, opts) {
    const t = eloTrail(playerName, games, opts);
    return Math.round(t.length ? t[t.length - 1].elo : 1000);
  }

  /* Rounded before/after for everyone in games[gi], using the same numbers as Rankings. */
  function eloMovers(games, gi) {
    const g = games[gi], out = [];
    g.teams.forEach((team, ti) => team.forEach(p => {
      const trail = eloTrail(p.name, games.slice(0, gi + 1));
      const last = trail[trail.length - 1], prev = trail[trail.length - 2];
      const after = Math.round(last.elo), before = Math.round(prev ? prev.elo : 1000);
      out.push({ name: p.name, team: ti, before, after, delta: after - before, p, won: g.winningTeam === ti + 1 });
    }));
    return out;
  }

  /* Running ELO (rounded) after each game the player was in, starting from 1000. */
  function eloHistory(playerName, games) {
    return [1000].concat(eloTrail(playerName, games).map(t => Math.round(t.elo)));
  }

  R.elo = { rackSize, otRack, dayKey, legacyWeekdayKey, calculateGameEloDelta, findPlayer, eloTrail, calculateELO, eloMovers, eloHistory };
  if (typeof module !== 'undefined' && module.exports) module.exports = R.elo;
})(typeof window !== 'undefined' ? window : globalThis);
