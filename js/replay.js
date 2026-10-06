/* Replay reconstruction. Pure: no DOM, no Math.random, no Date. Same game.id + same box score = same replay.
   Games store per-player totals only, so the shot order is illustrative ("Reconstructed from the box score"). */
(function (root) {
  'use strict';
  const R = (root.Ruski = root.Ruski || {});
  const { rackSize, otRack } = R.elo;

function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  const f = mulberry32(cyrb128(seed)[0]);
  return {
    next: f,
    int: n => Math.floor(f() * n),
    shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    weighted(w) { const t = w.reduce((x, y) => x + y, 0); let r = f() * t; for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; } return w.length - 1; }
  };
}

/* =====================================================================
   D. REPLAY RECONSTRUCTION  buildReplay(game) -> { events, snaps, meta }
   Pure: no DOM, no Math.random, no Date. Same game.id + same stats = same replay.
   ===================================================================== */
const PITCH = 0.1;                 // cup pitch in table-width units
const triRowsOf = n => { for (let k = 1; k < 8; k++) if (k * (k + 1) / 2 === n) return k; return 0; };
function layoutFor(count, shape) {          // shape: {kind:'tri'} | {kind:'rect',cols,rows}
  const out = [];
  if (shape.kind === 'tri') {
    const k = triRowsOf(count);
    for (let r = 0; r < k; r++) for (let c = 0; c < k - r; c++)
      out.push({ x: (c - (k - r - 1) / 2) * PITCH, d: r * PITCH * 0.87, f: k > 1 ? r / (k - 1) : 0 });
  } else {
    for (let r = 0; r < shape.rows; r++) for (let c = 0; c < shape.cols; c++)
      out.push({ x: (c - (shape.cols - 1) / 2) * PITCH, d: r * PITCH, f: shape.rows > 1 ? r / (shape.rows - 1) : 0 });
  }
  return out;
}
function rackShape(count, size, isOT) {
  if (triRowsOf(count)) return { kind: 'tri' };
  if (isOT) return { kind: 'rect', cols: size, rows: 3 };
  return { kind: 'rect', cols: 5, rows: count / 5 };
}
function newRack(prefix, count, size, isOT) {
  const shape = rackShape(count, size, isOT);
  return {
    tri: shape.kind === 'tri', intact: true, start: count,
    cups: layoutFor(count, shape).map((s, i) => ({ id: prefix + '-' + i, x: s.x, d: s.d, f: s.f, up: true }))
  };
}
const cloneRacks = racks => racks.map(r => ({ tri: r.tri, intact: r.intact, start: r.start, rr: r.rr || 0, cups: r.cups.map(c => ({ ...c })) }));

function buildReplay(game) {
  const size = Math.min(4, Math.max(1, game.size || game.teams[0].length));
  const N = rackSize(size), otN = otRack(size);
  const seed = 'ruski-replay-v1:' + game.id;
  const R = label => makeRng(seed + '|' + label);
  const T = game.teams.map(t => t.map(p => ({
    name: p.name, cups: p.cups || 0, red: p.redemptionCups || 0, ot: p.overtimeCups || 0, yacks: p.yacks || 0,
    dbl: p.doubles || 0, tri: p.tris || 0, quad: p.quads || 0, nm: !!p.nakedMile
  })));
  T.forEach(t => t.forEach(p => { p.dbl = Math.min(p.dbl, Math.floor(p.cups / 2)); }));
  let approx = false;
  const sum = (t, k) => T[t].reduce((a, p) => a + p[k], 0);
  const remov = t => T[t].reduce((a, p) => a + p.cups + 3 * p.tri + 4 * p.quad, 0);
  const biggest = (t, k) => T[t].reduce((b, p) => p[k] > b[k] ? p : b, T[t][0]);
  const teamLabel = t => size <= 2 ? T[t].map(p => p.name).join(' & ') : 'Team ' + (t + 1);

  /* Step A: roles */
  const goesOT = !!game.hadOvertime, winner = game.winningTeam - 1;
  let redT = null;
  if (game.redemptionShooter) { const i = T.findIndex(t => t.some(p => p.name === game.redemptionShooter)); if (i >= 0) redT = i; }
  if (redT === null) { const a = sum(0, 'red'), b = sum(1, 'red'); if (a || b) redT = a > b ? 0 : b > a ? 1 : 1 - winner; }
  if (redT === null && goesOT) redT = 1 - winner;      // legacy OT game with no shooter: assume the loser's side
  const mainWinner = goesOT ? (redT === null ? winner : 1 - redT) : winner;
  const mainLoser = 1 - mainWinner;

  /* Step B: reconcile (works on copies; sets approx when the box score didn't add up) */
  function fit(t, key, target, exact) {
    const tot = () => key === 'cups' ? remov(t) : sum(t, key);
    let guard = 300;
    while (tot() > target && guard--) {
      approx = true;
      if (key === 'cups') {
        let q = null; for (let i = T[t].length - 1; i >= 0; i--) if (T[t][i].quad > 0) { q = T[t][i]; break; }
        if (q) { q.quad--; continue; }
        for (let i = T[t].length - 1; i >= 0; i--) if (T[t][i].tri > 0) { q = T[t][i]; break; }
        if (q) { q.tri--; continue; }
      }
      const p = biggest(t, key); p[key]--; p.dbl = Math.min(p.dbl, Math.floor(p.cups / 2));
    }
    if (exact) while (tot() < target && guard--) { approx = true; biggest(t, key)[key]++; }
  }
  fit(mainWinner, 'cups', N, true);
  fit(mainLoser, 'cups', N - 1, false);
  let L = remov(mainLoser), rem = N - L;
  T[mainWinner].forEach(p => { p.red = 0; });
  /* Redemption: each losing-team player shoots until they miss, so a player can sink several. */
  if (goesOT) {
    /* OT means redemption hit every remaining cup; the designated shooter sinks the last one */
    let sh = game.redemptionShooter && T[mainLoser].find(p => p.name === game.redemptionShooter);
    if (!sh) sh = T[mainLoser].find(p => p.red > 0) || T[mainLoser][0];
    T[mainLoser].shooterName = sh.name;
    if (sh.red < 1) { sh.red = 1; approx = true; }
    let guard = 60;
    while (sum(mainLoser, 'red') > rem && guard--) {   // too many: take from the others first, keep the shooter's last cup
      const p = T[mainLoser].filter(q => q !== sh && q.red > 0).sort((a, b) => b.red - a.red)[0] || (sh.red > 1 ? sh : null);
      if (!p) break; p.red--; approx = true;
    }
    while (sum(mainLoser, 'red') < rem && guard--) { sh.red++; approx = true; }
    fit(winner, 'ot', otN, true); fit(1 - winner, 'ot', otN - 1, false);
  } else {
    /* no OT: redemption fell short, so at least one cup was left standing */
    let over = sum(mainLoser, 'red') - Math.max(0, rem - 1), guard = 60;
    while (over > 0 && guard--) { biggest(mainLoser, 'red').red--; over--; approx = true; }
    T.forEach(t => t.forEach(p => { p.ot = 0; }));
  }
  const Rsum = sum(mainLoser, 'red');

  /* Step C: scheduling one phase (main or OT) */
  function schedule(first, winT, beats, rng, phaseSize) {
    const loser = 1 - winT, loserFirst = first === loser;
    const slots = (pi, lim) => { const a = []; for (let r = pi; r < lim; r += phaseSize) a.push(r); return a; };
    const need = t => beats[t].map(b => b.length);
    const maxNeed = Math.max(1, ...need(0), ...need(1));
    const totW = need(winT).reduce((a, b) => a + b, 0);
    const W = Math.min(60, Math.max(Math.ceil(totW / 0.55), Math.ceil(maxNeed / 0.65) * phaseSize));
    const hitR = [[], []];
    beats[winT].forEach((b, pi) => { hitR[winT][pi] = rng.shuffle(slots(pi, Math.max(W, (b.length + 1) * phaseSize))).slice(0, b.length).sort((a, c) => a - c); });
    let lastR = Math.max(...hitR[winT].map(a => a.length ? a[a.length - 1] : -1));
    for (let g = 0; g < 100; g++) {
      const E = lastR + 1, limit = loserFirst ? E : E - 1;
      let ok = true; const nl = [];
      beats[loser].forEach((b, pi) => {
        const av = slots(pi, limit);
        if (av.length < b.length) ok = false; else nl[pi] = rng.shuffle(av).slice(0, b.length).sort((a, c) => a - c);
      });
      if (ok) { hitR[loser] = nl; break; }
      const pl = lastR % phaseSize, arr = hitR[winT][pl];
      arr[arr.length - 1] = lastR + phaseSize; lastR += phaseSize; arr.sort((a, c) => a - c);
      lastR = Math.max(...hitR[winT].map(a => a.length ? a[a.length - 1] : -1));
    }
    const E = lastR + 1, limit = loserFirst ? E : E - 1, ptr = [beats[0].map(() => 0), beats[1].map(() => 0)];
    const shots = [];
    for (let r = 0; r < E; r++) for (const t of [first, 1 - first]) {
      if (t === loser && r >= limit) continue;
      const pi = r % phaseSize, k = hitR[t][pi].indexOf(r);
      let kind = 'miss';
      if (k >= 0) kind = beats[t][pi][k];
      shots.push({ team: t, pi, kind, final: t === winT && r === E - 1 });
    }
    return shots;
  }
  function beatsOf(key) {
    const rb = R('beats-' + key);
    return T.map(t => t.map(p => {
      const a = [];
      if (key === 'cups') {
        for (let i = 0; i < p.cups - 2 * p.dbl; i++) a.push('hit');
        for (let i = 0; i < p.dbl; i++) a.push('double');
        for (let i = 0; i < p.tri; i++) a.push('tri');
        for (let i = 0; i < p.quad; i++) a.push('quad');
      } else for (let i = 0; i < p[key]; i++) a.push('hit');
      return rb.shuffle(a);
    }));
  }
  const mainShots = schedule(mainWinner, mainWinner, beatsOf('cups'), R('main-slots'), size).map(s => ({ ...s, phase: 'main' }));
  let redShots = [], otShots = [];
  {
    /* Each player shoots until they miss: their redemption hits, then a miss. Order is seeded. With OT the
       designated shooter goes last and their final hit clears the rack, so they never miss. */
    const P2 = T[mainLoser], streak = (pi, miss) => Array.from({ length: P2[pi].red }, () => ({ team: mainLoser, pi, kind: 'hit', phase: 'red' }))
      .concat(miss ? [{ team: mainLoser, pi, kind: 'miss', phase: 'red' }] : []);
    const order = R('red-order').shuffle(P2.map((p, pi) => pi));
    if (goesOT) {
      const spi = P2.findIndex(p => p.name === P2.shooterName);
      order.filter(pi => pi !== spi).forEach(pi => { redShots = redShots.concat(streak(pi, true)); });
      redShots = redShots.concat(streak(spi, false));
    } else order.forEach(pi => { redShots = redShots.concat(streak(pi, true)); });
  }
  if (goesOT) otShots = schedule(mainLoser, winner, beatsOf('ot'), R('ot-slots'), size).map(s => ({ ...s, phase: 'ot' }));

  /* Yacks: distribute across phases by hit share, attach to hit beats, later hits weigh x2; yack = lost next turn */
  const ry = R('yacks'); const puddleRng = R('puddles');
  T.forEach((team, t) => team.forEach((p, pi) => {
    if (!p.yacks) return;
    const hitsBy = { main: p.cups - p.dbl + p.tri + p.quad, red: p.red, ot: p.ot };
    const tot = hitsBy.main + hitsBy.red + hitsBy.ot;
    const alloc = { main: 0, red: 0, ot: 0 }; let left = p.yacks;
    if (tot === 0) alloc.main = left; else {
      ['main', 'red', 'ot'].forEach(k => { alloc[k] = Math.floor(p.yacks * hitsBy[k] / tot); left -= alloc[k]; });
      const order = ['main', 'red', 'ot'].sort((a, b) => hitsBy[b] - hitsBy[a]);
      for (let i = 0; left > 0; i = (i + 1) % 3, left--) alloc[order[i]]++;
    }
    [['main', mainShots], ['red', redShots], ['ot', otShots]].forEach(([ph, shots]) => {
      let k = alloc[ph]; if (!k) return;
      const mine = shots.map((s, i) => [s, i]).filter(([s]) => s.team === t && s.pi === pi);
      if (!mine.length) return;
      const firstHit = mine.find(([s]) => s.kind !== 'miss' && s.kind !== 'skip');
      let cand = mine.filter(([s]) => s.kind !== 'miss' && s.kind !== 'skip' && s !== (firstHit && firstHit[0]));
      if (cand.length < k) cand = mine.filter(([s]) => s.kind !== 'skip');
      const chosen = [];
      while (k-- > 0 && cand.length) {
        const w = cand.map(([, i]) => (i > shots.length / 2 ? 2 : 1));
        chosen.push(cand.splice(ry.weighted(w), 1)[0]);
      }
      chosen.forEach(([s]) => { s.yack = true; s.puddle = puddleRng.int(5); });
      if (ph !== 'red') chosen.forEach(([s]) => {
        const idx = mine.findIndex(([m]) => m === s);
        const e2 = mine[idx + 1]; if (!e2) return;
        const s2 = e2[0];
        if (s2.kind === 'miss') s2.kind = 'skip';
        else if (s2.kind !== 'skip' && !s2.final) {
          const e3 = mine.slice(idx + 2).find(([m]) => m.kind === 'miss' && !m.final);
          if (e3) { e3[0].kind = s2.kind; s2.kind = 'skip'; }
        }
      });
    });
  }));

  /* Step D/E: simulate racks + build events and precomputed snapshots */
  const rc = R('cups');
  let rackSet = 'main';
  let racks = [newRack('m0', N, size, false), newRack('m1', N, size, false)];
  const hits = {}; T.forEach(t => t.forEach(p => { hits[p.name] = { reg: 0, red: 0, ot: 0, tq: 0, yacks: 0 }; }));
  const puddles = [];
  const events = [], snaps = [];
  let phaseLabel = 'MAIN', redemTeam = null;
  const upCount = r => r.cups.filter(c => c.up).length;
  const snap = (ev, caption) => {
    snaps.push({
      rackSet, racks: cloneRacks(racks), left: [upCount(racks[0]), upCount(racks[1])], phase: phaseLabel, redemTeam,
      hits: JSON.parse(JSON.stringify(hits)), puddles: puddles.slice(), caption,
      shooter: ev.type === 'shot' ? { team: ev.team, pi: ev.pi } : null, ev
    });
  };
  const push = (ev, caption) => { events.push(ev); snap(ev, caption); };
  const who = (t, pi) => T[t][pi];
  const cupsLeftTxt = t => { const n = upCount(racks[t]); return teamLabel(t) + ' has ' + n + ' cup' + (n === 1 ? '' : 's') + ' left.'; };

  function pickCups(rack, kind) {
    const up = rack.cups.filter(c => c.up); if (!up.length) return [];
    const want = Math.min(up.length, kind === 'double' ? 2 : kind === 'tri' ? 3 : kind === 'quad' ? 4 : 1);
    const w = up.map(c => c.f > 0.66 ? 3 : c.f > 0.33 ? 2 : 1);
    const seedCup = up[rc.weighted(w)];
    if (want === 1) return [seedCup];
    const rest = up.filter(c => c !== seedCup).sort((a, b) => Math.hypot(a.x - seedCup.x, a.d - seedCup.d) - Math.hypot(b.x - seedCup.x, b.d - seedCup.d) || (a.id < b.id ? -1 : 1));
    return [seedCup].concat(rest.slice(0, want - 1));
  }
  function maybeRerack(rack) {
    const c = upCount(rack);
    if (!rack.tri || rack.intact || c >= rack.start || ![10, 6, 3].includes(c)) return false;
    rack.rr = (rack.rr || 0) + 1;
    /* First rerack: a fresh triangle. Second rerack (the last 3 cups): a straight line ("stoplight") along the table, pointing at the shooter. */
    const slots = (rack.rr >= 2 && c === 3 ? Array.from({ length: c }, (_, k) => ({ x: 0, d: k * PITCH, f: c > 1 ? k / (c - 1) : 0 })) : layoutFor(c, { kind: 'tri' })).sort((a, b) => a.d - b.d || a.x - b.x);
    const ups = rack.cups.filter(x => x.up).sort((a, b) => a.d - b.d || a.x - b.x);
    ups.forEach((cup, i) => { cup.x = slots[i].x; cup.d = slots[i].d; cup.f = slots[i].f; });
    rack.intact = true; return true;
  }
  function doShot(s, finalCleanup) {
    const p = who(s.team, s.pi), tgt = 1 - s.team, rack = racks[tgt];
    let kind = s.kind, removed = [], rerack = null;
    if (kind !== 'miss' && kind !== 'skip') {
      const picked = pickCups(rack, kind);
      if (picked.length < (kind === 'double' ? 2 : kind === 'tri' ? 3 : kind === 'quad' ? 4 : 1)) kind = picked.length >= 2 ? 'double' : 'hit';
      picked.forEach(c => { c.up = false; removed.push(c.id); });
      if (finalCleanup) rack.cups.filter(c => c.up).forEach(c => { c.up = false; removed.push(c.id); });
      if (removed.length) { rack.intact = false; if (maybeRerack(rack)) rerack = tgt; }
      const h = hits[p.name], n = picked.length;
      if (kind === 'tri' || kind === 'quad') h.tq += 1; else if (s.phase === 'main') h.reg += n; else if (s.phase === 'red') h.red += n; else h.ot += n;
    }
    if (s.yack) { hits[p.name].yacks++; puddles.push({ team: s.team, shape: s.puddle || 0, k: puddles.length }); }
    let cap;
    if (kind === 'skip') cap = p.name + ' lost a turn (yack).';
    else if (kind === 'miss') cap = p.name + ' missed.';
    else cap = p.name + ' hit' + (kind === 'double' ? ' a double' : kind === 'tri' ? ' a tri' : kind === 'quad' ? ' a quad' : '') + '. ' + cupsLeftTxt(tgt);
    if (s.yack) cap += ' ' + p.name + ' yacked.';
    if (rerack !== null) cap += ' Rerack.';
    const aim = removed.length ? removed[0] : null;
    const aimCup = aim ? rack.cups.find(c => c.id === aim) : null;
    push({ type: 'shot', team: s.team, pi: s.pi, name: p.name, kind, phase: s.phase, removed, rerack, yack: !!s.yack, aimTeam: tgt, aimId: aim, aimX: aimCup ? aimCup.x : null, aimD: aimCup ? aimCup.d : null }, cap);
  }

  push({ type: 'start' }, teamLabel(mainWinner) + ' and ' + teamLabel(mainLoser) + ' rack up. ' + N + ' cups each.');
  mainShots.forEach(s => doShot(s, s.final));
  let baseEnd = events.length - 1;
  let redIdx = -1, otIdx = -1;
  if (redShots.length) {
    phaseLabel = 'REDEMPTION'; redemTeam = mainWinner; redIdx = events.length;
    push({ type: 'phase', label: 'REDEMPTION' }, 'Redemption: ' + teamLabel(mainLoser) + ' shoots at the last ' + rem + ' cup' + (rem === 1 ? '' : 's') + '.');
    redShots.forEach((s, i) => doShot(s, goesOT && i === redShots.length - 1));
    baseEnd = events.length - 1;
  }
  if (goesOT) {
    phaseLabel = 'OVERTIME'; redemTeam = null; rackSet = 'ot'; otIdx = events.length;
    racks = [newRack('o0', otN, size, true), newRack('o1', otN, size, true)];
    push({ type: 'phase', label: 'OVERTIME' }, 'Redemption forced overtime. ' + otN + ' cups each.');
    otShots.forEach(s => doShot(s, s.final));
  }
  phaseLabel = 'FINAL'; redemTeam = null;
  const fw = winner, marginCups = upCount(racks[fw]);
  push({ type: 'end', winner: fw, margin: marginCups }, teamLabel(fw) + ' win' + (size === 1 ? 's' : '') + (marginCups ? ' with ' + marginCups + ' cup' + (marginCups === 1 ? '' : 's') + ' left' : '') + '.');

  /* Durations at 1x (ms), compressed so a full replay autoplays in ~9s */
  const base = e => e.type === 'shot' ? ({ miss: 200, skip: 200, hit: 260, double: 320, tri: 380, quad: 380 }[e.kind] || 260) + (e.rerack !== null ? 350 : 0) + (e.yack ? 300 : 0)
    : e.type === 'phase' ? 900 : e.type === 'start' ? 300 : 1000;
  const total = events.reduce((a, e) => a + base(e), 0), k = Math.max(0.5, Math.min(1, 9000 / total));
  events.forEach(e => { e.dur = Math.round(base(e) * k); });

  return {
    events, snaps,
    meta: { size, N, otN, goesOT, approx, rem, R: Rsum, mainWinner, mainLoser, winner, redIdx, otIdx, baseEnd, T, teamLabel: [teamLabel(0), teamLabel(1)] }
  };
}
const replayCache = new Map();
function getReplay(game) {
  const key = game.id + ':' + game.size + ':' + JSON.stringify(game.teams) + game.winningTeam + game.hadOvertime + game.redemptionShooter;
  let r = replayCache.get(key); if (!r) { r = buildReplay(game); replayCache.set(key, r); } return r;
}

  R.replay = { buildReplay, getReplay, layoutFor, triRowsOf, PITCH, clearCache: () => replayCache.clear() };
  if (typeof module !== 'undefined' && module.exports) module.exports = R.replay;
})(typeof window !== 'undefined' ? window : globalThis);
