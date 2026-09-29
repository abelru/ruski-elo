#!/usr/bin/env node
/* ELO regression: old live code vs the new js/elo.js + js/stats.js, on the real data.
 *
 *   node tools/elo-diff.mjs                 fetch live data (read-only REST GET) and compare
 *   node tools/elo-diff.mjs --file x.json   use a saved copy of fisherRuskiData instead of the network
 *   node tools/elo-diff.mjs --old-html path the old single-file app (default: `git show main:index.html`)
 *
 * Checks
 *   (a) old code            : calculateELO / updateHighlights pulled out of the old index.html and run as-is
 *   (b1) new code, old key  : js/elo.js with the weekday day-key  -> must equal (a) exactly
 *   (b2) new code, new key  : js/elo.js with the calendar-day key  -> differs from (a) only through the multi-game bonus
 * The script never writes anywhere: the network call is a GET and git is only asked to print a file.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const DB = 'https://fisher-ruski-tracker-default-rtdb.firebaseio.com/fisherRuskiData.json';

/* ---- data ---- */
let data;
if (opt('--file')) data = JSON.parse(fs.readFileSync(opt('--file'), 'utf8'));
else { const r = await fetch(DB); if (!r.ok) throw new Error('GET ' + DB + ' -> ' + r.status); data = await r.json(); }
const games = data.approvedGames || [], roster = data.playerRoster || [];
const names = [...new Set(games.flatMap(g => g.teams.flatMap(t => t.map(p => p.name))).concat(roster))];
console.log(`Data: ${games.length} games, ${roster.length} roster names, ${names.length} distinct names`);

/* ---- (a) old code, sliced out of the old file ---- */
const oldHtml = opt('--old-html') ? fs.readFileSync(opt('--old-html'), 'utf8')
  : execFileSync('git', ['show', 'main:index.html'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
const slice = (from, to) => { const a = oldHtml.indexOf(from), b = oldHtml.indexOf(to, a); if (a < 0 || b < 0) throw new Error('cannot find ' + from); return oldHtml.slice(a, b); };
const oldElo = slice('function calculateGameEloDelta', 'function getPlayerStats');
const oldHl = slice('function updateHighlights(period)', 'function updateHomeStats');

const FIXED = Date.UTC(2026, 8, 28, 12, 0, 0);   // pin "now" so both sides see the same week/month/year windows
class FixedDate extends Date { constructor(...a) { if (a.length) super(...a); else super(FIXED); } static now() { return FIXED; } }
const captured = {};
const sandbox = {
  approvedGames: games, Date: FixedDate, Math, Object, Array, Infinity, isNaN, console,
  document: { getElementById: id => ({ set textContent(v) { captured[id] = v; }, get textContent() { return captured[id]; } }) }
};
vm.createContext(sandbox);
vm.runInContext(oldElo + '\n' + oldHl + '\nthis.__old = { calculateELO, updateHighlights };', sandbox);
const oldCalc = sandbox.__old.calculateELO;

/* ---- (b) new code ---- */
for (const f of ['elo.js', 'stats.js']) vm.runInThisContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), { filename: f });
const { elo: E, stats: S } = globalThis.Ruski;
const legacy = { dayKey: E.legacyWeekdayKey };

/* ---- ELO per player ---- */
const A = {}, B1 = {}, B2 = {};
for (const n of names) { A[n] = oldCalc(n); B1[n] = E.calculateELO(n, games, legacy); B2[n] = E.calculateELO(n, games); }
const notSame = names.filter(n => A[n] !== B1[n]);
console.log(`\n(b1) new code with the OLD weekday key vs old code: ${names.length - notSame.length}/${names.length} identical` + (notSame.length ? '  MISMATCH: ' + notSame.join(', ') : '  -> byte-identical'));

/* Season-scoped ELO uses the same function: check one filtered list per season too */
let seasonMismatch = 0;
for (const y of S.availableSeasons(games, FIXED)) {
  const sg = S.gamesInSeason(games, y);
  for (const n of names) if (oldCalc(n, sg) !== E.calculateELO(n, sg, legacy)) seasonMismatch++;
}
console.log(`     season-scoped ELO (old vs new/old-key): ${seasonMismatch === 0 ? 'identical' : seasonMismatch + ' mismatches'}`);

const diffs = names.filter(n => A[n] !== B2[n]).map(n => ({ n, old: A[n], neu: B2[n], d: B2[n] - A[n] }));
console.log(`\n(b2) new code with the CALENDAR-DAY key: ${diffs.length} of ${names.length} players change`);

/* Explain each difference: it must come only from games whose multi-game number changed. */
const explain = n => {
  const to = E.eloTrail(n, games, legacy), tn = E.eloTrail(n, games), rows = []; let sum = 0;
  const seen = { o: {}, n: {} };
  to.forEach((o, i) => {
    const w = tn[i]; sum += w.delta - o.delta;
    const ko = legacy.dayKey(o.game), kn = E.dayKey(w.game);
    seen.o[ko] = (seen.o[ko] || 0) + 1; seen.n[kn] = (seen.n[kn] || 0) + 1;
    if (Math.abs(w.delta - o.delta) > 1e-9) rows.push({ id: o.game.id, date: o.game.date, oldNo: seen.o[ko], newNo: seen.n[kn], oldDelta: +o.delta.toFixed(2), newDelta: +w.delta.toFixed(2) });
  });
  return { rows, sum };
};
let unexplained = 0;
for (const x of diffs) {
  const { rows, sum } = explain(x.n);
  const ok = rows.length > 0 && rows.every(r => r.oldNo !== r.newNo) && Math.abs(Math.round(1000 + E.eloTrail(x.n, games).reduce((s, t) => s + t.delta, 0)) - x.neu) === 0
    && Math.abs((x.neu - x.old) - sum) <= 1;
  x.explained = ok; x.games = rows; if (!ok) unexplained++;
}
/* And the converse: a game whose multi-game number is unchanged must have an unchanged delta (only mover games differ). */
console.log(`     every difference traced to games whose "Nth game of the day" changed: ${unexplained === 0 ? 'YES' : unexplained + ' UNEXPLAINED'}`);

const movers = diffs.slice().sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
console.log('\nTop movers (old -> new):');
movers.slice(0, 15).forEach(x => console.log(`  ${x.n.padEnd(22)} ${String(x.old).padStart(5)} -> ${String(x.neu).padStart(5)}  (${x.d > 0 ? '+' : ''}${x.d})  ${x.games.length} game(s) re-numbered`));
const up = diffs.filter(x => x.d > 0).length, down = diffs.filter(x => x.d < 0).length;
console.log(`  up: ${up}, down: ${down}, largest |change|: ${movers.length ? Math.abs(movers[0].d) : 0}`);

const rank = m => roster.slice().sort((a, b) => m[b] - m[a]).map((n, i) => [n, i + 1]);
const ra = Object.fromEntries(rank(A)), rb = Object.fromEntries(rank(B2));
const rankMoves = roster.filter(n => ra[n] !== rb[n]);
const top10 = roster.slice().sort((a, b) => A[b] - A[a]).slice(0, 10).map(n => `${n}: #${ra[n]} -> #${rb[n]}`);
console.log(`\nRoster rank positions that change: ${rankMoves.length} of ${roster.length}. Old top 10:\n  ` + top10.join('\n  '));

/* ---- Home highlights: old updateHighlights() vs new periodHighlights() ---- */
console.log('\nHome highlights (Captain\'s Table / Fred\'s Locker):');
const map = [ // [old DOM ids, new key, picker]
  ['highest-elo-player', 'highest-elo-stat', 'admiral', h => [h.name, h.elo + ' ELO']],
  ['most-cups-player', 'most-cups-stat', 'sharp', h => [h.name, h.cups + ' cups']],
  ['best-record-player', 'best-record-stat', 'champ', h => [h.name, `${h.wins}-${h.losses} (${h.rate}%)`]],
  ['best-gain-player', 'best-gain-stat', 'rise', h => [h.name, `+${h.gain} in one game`]],
  ['worst-player', 'worst-player-stat', 'over', h => [h.name, `${h.wins}-${h.losses} (${h.rate}%)`]],
  ['most-yacks-player', 'most-yacks-stat', 'land', h => [h.name, h.yacks + ' yacks']],
  ['least-cups-player', 'least-cups-stat', 'scal', h => [h.name, h.cups + ' cups']],
  ['worst-loss-player', 'worst-loss-stat', 'anchor', h => [h.name, `${h.loss} in one game`]],
  ['best-game', null, 'closest', h => [h.game.teams[0].map(p => p.name).join(' & ') + ' vs ' + h.game.teams[1].map(p => p.name).join(' & '), null]],
  ['most-yacks-game', 'most-yacks-game-stat', 'brutal', h => [h.game.teams[0].map(p => p.name).join(' & ') + ' vs ' + h.game.teams[1].map(p => p.name).join(' & '), h.yacks + ' yacks total']]
];
let hlBad = 0, hlChanged = 0;
for (const period of ['week', 'month', 'year', 'alltime']) {
  for (const k of Object.keys(captured)) delete captured[k];
  sandbox.__old.updateHighlights(period);
  const o = { ...captured };
  const nOld = S.periodHighlights(games, period, FIXED, legacy), nNew = S.periodHighlights(games, period, FIXED);
  if (!nOld) { if (o['highest-elo-player'] !== 'No data') { hlBad++; console.log('  ' + period + ': old has data, new does not'); } continue; }
  for (const [pid, sid, key, fmt] of map) {
    const want = o[pid] === undefined || o[pid] === 'No data' ? undefined : o[pid], got = nOld[key] ? fmt(nOld[key]) : [];
    if (want !== got[0]) { hlBad++; console.log(`  ${period} ${key}: old=${want} new(old key)=${got[0]}`); }
    if (sid && want !== undefined && o[sid] !== got[1]) { hlBad++; console.log(`  ${period} ${key} stat: old=${o[sid]} new(old key)=${got[1]}`); }
    const now = nNew[key] ? fmt(nNew[key]) : [];
    if (now[0] !== got[0] || now[1] !== got[1]) { hlChanged++; console.log(`  ${period} ${key}: ${got[0]} (${got[1]}) -> ${now[0]} (${now[1]})  [weekday fix]`); }
  }
}
console.log(`  new code with the old key vs old updateHighlights: ${hlBad === 0 ? 'identical (names + figures)' : hlBad + ' MISMATCHES'}; ${hlChanged} highlight slot(s) change under the calendar-day key`);

const dateFormats = {}; games.forEach(g => { const k = String(g.date).replace(/[A-Za-z]+/g, 'W').replace(/\d+/g, 'N'); dateFormats[k] = (dateFormats[k] || 0) + 1; });
console.log('\nDate formats in the data:', JSON.stringify(dateFormats));
const failed = notSame.length || seasonMismatch || unexplained || hlBad;
console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: OK (new code == old code except where the weekday bug applied)');
process.exit(failed ? 1 : 0);
