/* DEV ONLY. Mock data for ?mock=1 (see js/data.js). Same shape as Firebase `fisherRuskiData`.
   Never loaded in normal use. Includes a legacy-format game and hostile names on purpose, to prove escaping. */
(function () {
  'use strict';
const DAY = 86400000;
const NOW = Date.now();
const P = (name, cups, red = 0, ot = 0, yacks = 0, doubles = 0, tris = 0, quads = 0) => ({
  name, cups, redemptionCups: red, overtimeCups: ot, yacks, doubles, tris, quads,
  nakedMile: (cups + red + ot) === 0
});
const fmtDate = ts => new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
function seasonStartYear(d) { d = new Date(d); return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; }
const seasonStartTs = new Date(seasonStartYear(NOW), 6, 1).getTime();
const daysIntoSeason = Math.ceil((NOW - seasonStartTs) / DAY);
function G(id, ago, t1, t2, winningTeam, o = {}) {
  const ts = NOW - ago * DAY - 3600000 * (o.hoursOff || 0);
  return {
    id, name: o.name || null, date: fmtDate(ts), timestamp: ts, size: t1.length, teams: [t1, t2],
    winningTeam, hadOvertime: !!o.ot, redemptionShooter: o.shooter || null
  };
}
const pre = k => daysIntoSeason + k;   // "previous season" days-ago helper
let ROSTER = ['Murphy', 'Alex', 'Brady', 'Keough', 'Sully', 'Dev', 'Priya', 'Mateo', 'Jonah', 'Reilly', 'Tess', "O'Brien"];
let approvedGames = [
  G(1, pre(50), [P('Murphy', 10)], [P('Alex', 6)], 1),                                   // 1v1
  G(2, pre(47), [P('Brady', 6), P('Keough', 4)], [P('Sully', 4), P('Dev', 3)], 1),        // 2v2
  G(3, pre(44), [P('Murphy', 6, 0, 2), P('Priya', 4, 0, 2)], [P('Alex', 5, 1, 3), P('Mateo', 3, 1, 3)], 2, { ot: true, shooter: 'Alex', name: 'Finals Night' }), // 2v2 OT, comeback
  G(4, pre(40), [P('Jonah', 6), P('Reilly', 5), P('Tess', 4, 0, 0, 1)], [P('Murphy', 5), P('Brady', 4), P("O'Brien", 2, 0, 0, 1)], 1), // 3v3
  G(5, pre(36), [P('Alex', 6), P('Sully', 4, 0, 0, 0, 0, 1), P('Dev', 4), P('Priya', 3)], [P('Mateo', 4), P('Keough', 4), P('Jonah', 3), P('Reilly', 3)], 1, { name: 'Birds Game' }), // 4v4 + tri
  G(6, pre(30), [P('Tess', 0), P("O'Brien", 5, 0, 0, 1)], [P('Dev', 6), P('Sully', 4)], 2),                // Naked Mile
  G(7, pre(26), [P('Brady', 10, 0, 1)], [P('Keough', 9, 1, 3)], 2, { ot: true, shooter: 'Keough' }),        // 1v1 OT
  G(8, 60, [P('Priya', 5, 0, 2), P('Dev', 5, 0, 2), P('Sully', 5, 0, 3)], [P('Mateo', 4, 1, 4), P('Alex', 4, 1, 3), P('Keough', 4, 1, 3)], 2, { ot: true, shooter: 'Keough' }), // 3v3 OT (10-cup OT rack)
  G(9, 55, [P('Murphy', 5), P('Alex', 5)], [P('Jonah', 4, 1), P('Reilly', 3, 1)], 1),                      // redemption, no OT
  G(10, 50, [P('Brady', 6), P('Tess', 4, 0, 0, 2)], [P('Priya', 3), P("O'Brien", 3)], 1),                  // yacks
  G(11, 45, [P('Alex', 10)], [P('Murphy', 9)], 1),
  G(12, 40, [P('Keough', 5), P('Sully', 5, 0, 0, 0, 1)], [P('Dev', 5), P('Mateo', 1, 0, 0, 1)], 1),        // double
  G(13, 33, [P('Murphy', 6, 0, 3), P('Brady', 5, 0, 3), P('Jonah', 5, 0, 3), P('Reilly', 4, 0, 3)], [P('Alex', 4, 1, 3), P('Priya', 4, 1, 2), P('Mateo', 4, 1, 2), P('Dev', 4, 1, 2)], 1, { ot: true, shooter: 'Priya', name: 'Tournament Semis' }), // 4v4 OT
  G(14, 26, [P('Sully', 6), P('Tess', 4)], [P("O'Brien", 4), P('Dev', 5, 0, 0, 1)], 1),
  G(15, 20, [P('Alex', 5), P('Murphy', 5), P('Priya', 5)], [P('Brady', 3), P('Keough', 4), P('Mateo', 3)], 1),
  G(16, 14, [P('Reilly', 6), P('Jonah', 4)], [P('Sully', 0, 0, 0, 2), P('Mateo', 5)], 1),                  // Naked Mile + yacks
  G(17, 9, [P('Priya', 10)], [P('Dev', 5, 1)], 1),
  G(18, 5, [P('Alex', 5, 0, 3), P('Murphy', 5, 0, 3)], [P('Brady', 5, 1, 2), P('Priya', 3, 1, 2)], 1, { ot: true, shooter: 'Priya' }),
  G(19, 2, [P('Jonah', 4), P('Reilly', 3, 0, 0, 1)], [P('Alex', 5), P('Keough', 5)], 2, { hoursOff: 1 }),
  G(20, 0, [P('Murphy', 3, 0, 0, 0, 0, 1), P('Priya', 4)], [P('Alex', 4), P('Brady', 2, 0, 0, 0, 0, 1)], 1, { name: 'Rematch' })
];
let gameIdCounter = 20;

  /* Legacy record: numeric date, no timestamp, missing counters (the first 14 real games look like this). */
  approvedGames.unshift({ id: 0, date: '10/2/2025, 10:31:53 PM', size: 2, winningTeam: 1,
    teams: [[{ name: 'Murphy', cups: 6, redemptionCups: 0, overtimeCups: 0, yacks: 0, nakedMile: false }, { name: 'Alex', cups: 4, redemptionCups: 0, overtimeCups: 0, yacks: 1, nakedMile: false }],
            [{ name: 'Brady', cups: 3, redemptionCups: 0, overtimeCups: 0, yacks: 0, nakedMile: false }, { name: 'Keough', cups: 2, redemptionCups: 0, overtimeCups: 0, yacks: 0, nakedMile: false }]] });
  /* Hostile names: must render as text everywhere and never run. */
  const EVIL = '<img src=x onerror="window.__xss=1">';
  const EVIL2 = "');window.__xss=2;//";
  ROSTER.push(EVIL, EVIL2);
  approvedGames.push(G(21, 1, [P(EVIL, 6), P(EVIL2, 4)], [P('Murphy', 5), P('Alex', 3)], 1, { name: '"><script>window.__xss=3</script>' }));
  gameIdCounter = 22;

  window.RUSKI_FIXTURE = {
    approvedGames, playerRoster: ROSTER.slice().sort(), gameIdCounter,
    tournamentMode: /[?&]tournament=1/.test(location.search)
  };
})();
