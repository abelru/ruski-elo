/* Log a game: two steps + a confirm sheet, written as the exact same record the old Submit page wrote:
   { id, name, date, timestamp, size, teams: [[{ name, cups, redemptionCups, overtimeCups, yacks, doubles, tris, quads, nakedMile }]],
     winningTeam, hadOvertime, redemptionShooter }.  The id comes from gameIdCounter (id = counter, then counter + 1). */
(function (R) {
  'use strict';
  const { $, $$, esc, mk, toast, store, unstore, signed, fmtDate } = R.util;
  const ST = R.stats;
  const { openSheet, closeSheet } = R.ui;
  const { pageHead, ranked, teamName } = R.shared;
  const { rackSize, otRack, eloMovers } = R.elo;
  const DB = R.state;
  const DRAFT_KEY = 'ruski-draft' + (R.data.mode === 'live' ? '' : '-' + R.data.mode);   // dev modes never touch the real draft
  const localDay = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const P = (name, cups, red = 0, ot = 0, yacks = 0, doubles = 0, tris = 0, quads = 0) => ({
    name, cups, redemptionCups: red, overtimeCups: ot, yacks, doubles, tris, quads,
    nakedMile: (cups + red + ot) === 0
  });

const Draft = {
  d: null,
  fresh() { return { size: 2, teams: [[null, null], [null, null]], winner: 0, ot: false, shooter: null, name: '', date: localDay(Date.now()), step: 1, more: false, stats: {}, extra: [] }; },
  load() { if (this.d) return this.d; const s = store(DRAFT_KEY); this.d = s && s.teams ? Object.assign(this.fresh(), s) : this.fresh(); return this.d; },
  save() { store(DRAFT_KEY, this.d); },
  reset() { this.d = this.fresh(); unstore(DRAFT_KEY); },
  rematch(g) { const d = this.fresh(); d.size = g.size; d.teams = g.teams.map(t => t.map(p => p.name)); this.d = d; this.save(); },
  stat(name) { const s = this.d.stats; return s[name] || (s[name] = { cups: 0, red: 0, ot: 0, yacks: 0, dbl: 0, tri: 0, quad: 0 }); }
};
const STAT_LABEL = { cups: 'Cups', red: 'Redemption', ot: 'Overtime', yacks: 'Yacks', dbl: 'Doubles', tri: 'Tris', quad: 'Quads' };
const STAT_MAX = { cups: 20, red: 15, ot: 12, yacks: 9, dbl: 10, tri: 6, quad: 5 };

function draftGame(d, id) {
  const win = d.winner;
  const teams = d.teams.map((t, ti) => t.map(n => {
    const s = Draft.stat(n);
    const red = d.ot ? s.red : (ti === win - 1 ? 0 : s.red);
    return P(n, s.cups, red, d.ot ? s.ot : 0, s.yacks, s.dbl, s.tri, s.quad);
  }));
  const ts = d.date === localDay(Date.now()) ? Date.now() : new Date(d.date + 'T20:00:00').getTime();
  /* Same field order and values as the old submitGame(). The old form allowed an empty shooter when overtime was on; that stays '' rather than null. */
  return { id, name: d.name.trim() || null, date: fmtDate(ts), timestamp: ts, size: d.size, teams, winningTeam: win, hadOvertime: d.ot, redemptionShooter: d.ot ? (d.shooter || '') : null };
}
function draftCheck(d) {
  const N = rackSize(d.size), oN = otRack(d.size), out = { block: [], soft: [], tot: [0, 0], N, oN, rem: null, mw: null };
  d.teams.forEach((t, ti) => { out.tot[ti] = t.reduce((a, n) => { if (!n) return a; const s = Draft.stat(n); return a + s.cups + 3 * s.tri + 4 * s.quad; }, 0); });
  const red = d.teams.map(t => t.reduce((a, n) => a + (n ? Draft.stat(n).red : 0), 0));
  const ot = d.teams.map(t => t.reduce((a, n) => a + (n ? Draft.stat(n).ot : 0), 0));
  if (!d.winner) { out.block.push('Tap the team that won.'); return out; }
  const w = d.winner - 1;
  if (d.ot) {
    if (!d.shooter) { out.soft.push('No redemption shooter picked. The game will be saved without one.'); return out; }
    const rt = d.teams.findIndex(t => t.includes(d.shooter)); out.mw = 1 - rt;
    const L = out.tot[rt]; out.rem = N - L;
    if (out.tot[out.mw] !== N) out.soft.push(`The team that cleared first has ${out.tot[out.mw]} of ${N} cups.`);
    if (L > N - 1) out.soft.push(`The other side has ${L} cups, but the rack only holds ${N}.`);
    else if (red[rt] !== out.rem) out.soft.push(`${out.rem} cups were left for redemption; ${red[rt]} logged.`);
    if (ot[w] !== oN) out.soft.push(`The overtime winner has ${ot[w]} of ${oN} cups.`);
    if (ot[1 - w] >= oN) out.soft.push('The overtime loser cleared the rack, which would be double overtime.');
  } else {
    out.mw = w; const L = out.tot[1 - w]; out.rem = N - L;
    if (out.tot[w] !== N) out.soft.push(`The winner has ${out.tot[w]} of ${N} cups.`);
    if (L > N - 1) out.soft.push(`The loser has ${L} cups, but a full ${N} would mean the game was not over.`);
    else if (red[1 - w] > out.rem - 1) out.soft.push(`${red[1 - w]} redemption cups would clear the rack and force overtime.`);
  }
  return out;
}

R.views.submit = function () {
  const d = Draft.load(); const el = mk(''); el.classList.add('narrow');
  const short = t => d.teams[t].map(n => n || '?').join(' & ').slice(0, 28) || 'Team ' + (t + 1);
  let pickFor = null;
  const playedCount = n => ST.playerGames(n, DB.games).length;

  function slotBtn(t, i) {
    const n = d.teams[t][i];
    return `<button class="slot${n ? ' filled' : ''}" data-slot="${t},${i}" data-k="s${t}${i}" aria-label="Team ${t + 1}, player ${i + 1}: ${n ? esc(n) : 'empty'}"><span>${n ? esc(n) : 'Pick player'}</span><span class="m">${n ? playedCount(n) + ' games' : ''}</span></button>`;
  }
  function step1() {
    const ready = d.teams.every(t => t.every(Boolean));
    return `<div class="steps"><i class="on"></i><i></i></div>${pageHead('Log a game', 'Step 1 of 2')}<p class="t-meta hint">Please use Fisher names.</p>
      <div class="seg" role="radiogroup" aria-label="Team size">${[1, 2, 3, 4].map(s => `<button role="radio" aria-checked="${s === d.size}" data-size="${s}" data-k="z${s}">${s}v${s}</button>`).join('')}</div>
      <div class="section" style="margin-top:16px">${[0, 1].map(t => `<div class="teamcard"><h2>${'Team ' + (t + 1)}</h2>${d.teams[t].map((_, i) => slotBtn(t, i)).join('')}</div>`).join('')}</div>
      <details class="acc" style="margin-top:12px"><summary>Game name and date</summary><div class="bd">
        <label class="field" style="margin-bottom:12px"><span>Name (optional)</span><input class="input" id="gname" value="${esc(d.name)}" placeholder="Birds Game" maxlength="40"></label>
        <label class="field"><span>Date</span><input class="input" type="date" id="gdate" value="${esc(d.date)}" max="${localDay(Date.now())}"></label></div></details>
      <div class="actions"><button class="btn primary" id="next" data-k="next" ${ready ? '' : 'disabled'}>Next: score</button></div>
      ${ready ? '' : '<p class="t-meta" style="margin-top:8px">Fill every slot to continue.</p>'}`;
  }
  const stepper = (t, i, key) => { const n = d.teams[t][i], v = Draft.stat(n)[key]; return `<div class="stepper"><label>${STAT_LABEL[key]}</label><button data-step="${t},${i},${key},-1" data-k="m${t}${i}${key}" aria-label="Fewer ${STAT_LABEL[key].toLowerCase()} for ${esc(n)}">−</button><output aria-live="off">${v}</output><button data-step="${t},${i},${key},1" data-k="p${t}${i}${key}" aria-label="More ${STAT_LABEL[key].toLowerCase()} for ${esc(n)}">+</button></div>`; };
  function step2() {
    const c = draftCheck(d), w = d.winner - 1;
    const showRed = t => d.ot || (d.winner && t !== w);
    const sugg = !d.winner && (c.tot[0] === c.N) !== (c.tot[1] === c.N) ? (c.tot[0] === c.N ? 0 : 1) : null;
    const redPlayers = d.teams.flat();
    const canReview = !c.block.length;
    return `<div class="steps"><i class="on"></i><i class="on"></i></div>${pageHead('Score', 'Step 2 of 2')}
      <h2 class="t-card" style="margin-bottom:8px" id="wl">Who won?</h2>
      <div style="display:grid;gap:8px">${[0, 1].map(t => `<button class="winpick" data-win="${t + 1}" data-k="w${t}" aria-pressed="${d.winner === t + 1}"><span class="radio"></span><span><span class="t-card" style="display:block">${esc(short(t))}</span></span><span class="tag">${d.winner === t + 1 ? 'Winners' : 'We won'}</span></button>`).join('')}</div>
      ${sugg !== null ? `<p class="t-meta" style="margin-top:8px">${esc(short(sugg))} cleared ${c.N} cups. <button class="chipbtn" style="min-height:44px;margin-left:4px" data-win="${sugg + 1}">Mark as winners</button></p>` : ''}
      <div class="switch"><div><div class="t-card">Went to overtime</div><div class="t-meta">Loser hit every redemption cup</div></div><button role="switch" aria-checked="${d.ot}" id="otsw" data-k="ot" aria-label="Went to overtime"></button></div>
      ${[0, 1].map(t => `<div class="teamcard"><h3>${esc(short(t))}${d.winner === t + 1 ? ' <span class="tok win" style="margin-left:6px">Winner</span>' : ''}</h3>${d.teams[t].map((n, i) => `<div class="prow"><div class="pn">${esc(n)}</div><div class="steppers">
        ${stepper(t, i, 'cups')}${showRed(t) ? stepper(t, i, 'red') : ''}${d.ot ? stepper(t, i, 'ot') : ''}${stepper(t, i, 'yacks')}${d.more ? stepper(t, i, 'dbl') + stepper(t, i, 'tri') + stepper(t, i, 'quad') : ''}</div></div>`).join('')}</div>`).join('')}
      <div class="switch" style="margin-top:4px"><div><div class="t-card">Doubles, tris, quads</div><div class="t-meta">Rare. Tris and quads do not count as cups.</div></div><button role="switch" aria-checked="${d.more}" id="moresw" data-k="more" aria-label="Show doubles, tris and quads"></button></div>
      ${d.ot ? `<div class="teamcard" style="margin-top:12px"><h3>Who hit the redemption that forced overtime?</h3><div class="chips" role="group" aria-label="Redemption shooter">${redPlayers.map(n => `<button class="chipbtn" data-shooter="${esc(n)}" aria-pressed="${d.shooter === n}">${esc(n)}</button>`).join('')}</div></div>` : ''}
      <div class="livebar" role="status"><div class="row"><span>${esc(short(0))} <b class="num">${c.tot[0]}/${c.N}</b></span><span>${esc(short(1))} <b class="num">${c.tot[1]}/${c.N}</b></span></div>
        ${c.rem !== null && !d.ot ? `<div class="t-meta num">${c.rem} cup${c.rem === 1 ? '' : 's'} left on the winner’s rack for redemption</div>` : ''}
        ${c.block.length ? `<div class="warn">${esc(c.block[0])}</div>` : c.soft.map(s => `<div class="warn">${esc(s)}</div>`).join('')}</div>
      <div class="actions"><button class="btn" id="prev" data-k="prev">Back</button><button class="btn primary" id="review" data-k="review" ${canReview ? '' : 'aria-disabled="true"'}>Review</button></div>`;
  }
  function render() {
    const focusKey = document.activeElement && el.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    el.innerHTML = d.step === 1 ? step1() : step2();
    Draft.save();
    if (focusKey) { const t = $(`[data-k="${focusKey}"]`, el); if (t && !t.disabled) t.focus({ preventScroll: true }); }
  }
  function openPicker(t, i) {
    pickFor = [t, i];
    const taken = new Set(d.teams.flat().filter(Boolean)); const cur = d.teams[t][i]; taken.delete(cur);
    const list = [...new Set(DB.roster.concat(d.extra))].sort((a, b) => playedCount(b) - playedCount(a) || a.localeCompare(b));
    const s = openSheet(`<h2>Pick a player</h2><input class="input" type="search" id="pq" placeholder="Search or add a name" autocomplete="off" aria-label="Search players"><ul class="pick-list" id="pl"></ul><div id="padd"></div>`, { label: 'Pick a player' });
    const fill = () => {
      const q = $('#pq', s).value.trim().toLowerCase();
      const items = list.filter(n => !q || n.toLowerCase().includes(q));
      $('#pl', s).innerHTML = items.map(n => `<li><button data-n="${esc(n)}" ${taken.has(n) ? 'disabled' : ''}><span>${esc(n)}</span><span class="t-meta">${taken.has(n) ? 'already picked' : playedCount(n) + ' games'}</span></button></li>`).join('') || '<li class="empty">No match</li>';
      const exact = list.some(n => n.toLowerCase() === q);
      $('#padd', s).innerHTML = q && !exact ? `<button class="btn block" style="margin-top:12px" data-add="${esc($('#pq', s).value.trim())}">Add “${esc($('#pq', s).value.trim())}” as a new player</button>` : '';
    };
    fill();
    s.addEventListener('input', fill);
    s.addEventListener('click', e => {
      const b = e.target.closest('[data-n]'), a = e.target.closest('[data-add]');
      let name = b ? b.dataset.n : a ? a.dataset.add : null; if (!name) return;
      if (a && !d.extra.includes(name)) d.extra.push(name);   // joins the roster only when the game is saved, like the old form
      d.teams[t][i] = name; closeSheet(); render();
    });
  }
  function reviewSheet() {
    const c = draftCheck(d), g = draftGame(d, DB.counter), mv = eloMovers(DB.games.concat([g]), DB.games.length), w = g.winningTeam - 1;
    const s = openSheet(`<h2>Save this game?</h2>
      <p class="t-card">${esc(teamName(g, w))} ${g.teams[w].length === 1 ? 'wins' : 'win'}${g.hadOvertime ? ' in overtime' : ''}</p>
      <ul class="eloprev ledger" style="margin-top:8px">${mv.slice().sort((a, b) => b.won - a.won || b.delta - a.delta).map(m => `<li><span class="grow"><span class="t-card">${esc(m.name)}</span> <span class="t-meta num">${m.before} \u2192 ${m.after}</span></span><span class="d num ${m.delta >= 0 ? 'up' : 'down'}">${signed(m.delta)}</span></li>`).join('')}</ul>
      ${c.soft.length ? `<div class="err soft">${c.soft.map(esc).join('<br>')}</div>` : ''}
      <p class="err" id="err" role="alert" hidden></p>
      <div style="display:grid;gap:8px;margin-top:16px"><button class="btn primary block" id="save">${c.soft.length ? 'Save anyway' : 'Save game'}</button><button class="btn quiet block" id="keep">Keep editing</button></div>`, { label: 'Confirm game' });
    $('#keep', s).addEventListener('click', () => closeSheet());
    $('#save', s).addEventListener('click', e => save(s, e.currentTarget));
  }

  /* Save = write to the database, then celebrate. If the write is rejected the form stays as it was and the sheet offers a retry.
     If the server is slow to answer (bad basement wifi) we stop waiting after 8s: the write stays queued and finishes when we are back online. */
  function save(sheet, btn) {
    const err = $('#err', sheet); err.hidden = true;
    btn.disabled = true; btn.textContent = 'Saving\u2026';
    const oldAdm = (ranked()[0] || {}).name;
    let game = null, settled = false;
    const done = () => {
      if (settled) return; settled = true;
      const movers = eloMovers(DB.games, DB.games.findIndex(x => x.id === game.id));
      const adm = (ranked()[0] || {}).name;
      Draft.reset(); closeSheet(true);
      history.replaceState(null, '', '#game/' + game.id + '?new=1');
      R.router.route({ instant: true, force: true });
      R.celebrate(game, movers, { newAdmiral: adm && adm !== oldAdm ? adm : null }).then(() => {
        history.replaceState(null, '', '#game/' + game.id);
        if (R.replayApi) R.replayApi.start();
      });
    };
    const p = R.data.commit(st => {
      /* Same steps as the old submitGame(): new names join the roster (sorted), then id = counter, counter + 1. */
      d.teams.flat().forEach(n => { if (!st.roster.includes(n)) { st.roster.push(n); st.roster.sort(); } });
      game = draftGame(d, st.counter); st.counter++;
      st.games.push(game);
    });
    const timer = setTimeout(() => { if (!settled) { toast('Still saving. It will finish when you are back online.'); done(); } }, 8000);
    p.then(() => { clearTimeout(timer); done(); }).catch(e => {
      clearTimeout(timer);
      console.error('Saving the game failed', e);
      if (settled) { toast('The game could not be saved: ' + (e && e.message ? e.message : 'unknown error')); return; }
      err.textContent = 'Could not save: ' + (e && e.message ? e.message : 'unknown error') + '. Nothing was lost; try again.';
      err.hidden = false; btn.disabled = false; btn.textContent = 'Try again';
    });
  }
  el.addEventListener('click', e => {
    const t = e.target;
    let b;
    if ((b = t.closest('[data-size]'))) { const n = +b.dataset.size; d.size = n; d.teams = d.teams.map(tm => Array.from({ length: n }, (_, i) => tm[i] || null)); d.shooter = null; render(); }
    else if ((b = t.closest('[data-slot]'))) { const [a, i] = b.dataset.slot.split(',').map(Number); openPicker(a, i); }
    else if (t.closest('#next')) { if (!t.closest('#next').disabled) { d.step = 2; render(); window.scrollTo(0, 0); } }
    else if (t.closest('#prev')) { d.step = 1; render(); window.scrollTo(0, 0); }
    else if ((b = t.closest('[data-win]'))) { d.winner = +b.dataset.win; if (!d.ot) d.teams[d.winner - 1].forEach(n => { Draft.stat(n).red = 0; }); render(); }
    else if (t.closest('#otsw')) { d.ot = !d.ot; if (!d.ot) { d.shooter = null; d.teams.flat().forEach(n => { Draft.stat(n).ot = 0; }); } render(); }
    else if (t.closest('#moresw')) { d.more = !d.more; render(); }
    else if ((b = t.closest('[data-step]'))) {
      const [a, i, key, dl] = b.dataset.step.split(','); const n = d.teams[+a][+i], s = Draft.stat(n);
      s[key] = Math.max(0, Math.min(STAT_MAX[key], s[key] + +dl));
      if (key === 'red' && d.ot) { const rp = d.teams.flat().filter(x => Draft.stat(x).red > 0); if (rp.length === 1) d.shooter = rp[0]; else if (!rp.includes(d.shooter)) d.shooter = null; }
      render();
    }
    else if ((b = t.closest('[data-shooter]'))) { d.shooter = b.dataset.shooter; render(); }
    else if ((b = t.closest('#review'))) { const c = draftCheck(d); if (c.block.length) { toast(c.block[0]); } else reviewSheet(); }
  });
  el.addEventListener('input', e => { if (e.target.id === 'gname') { d.name = e.target.value; Draft.save(); } if (e.target.id === 'gdate' && e.target.value) { d.date = e.target.value; Draft.save(); } });
  render();
  return { el, heading: 'Log a game' };
};

  R.submit = { rematch: g => { Draft.rematch(g); }, resetDraft: () => Draft.reset() };
})(window.Ruski);
