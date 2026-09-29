/* Admin: login gate, Site Settings (tournament toggle), All Games (search/edit/delete), Player Roster, Data Management.
   Same features and same writes as the old page; confirmations are in-page sheets instead of window.confirm/alert. */
(function (R) {
  'use strict';
  const { $, $$, esc, mk, toast, reduceMotion } = R.util;
  const { openSheet, closeSheet, confirmSheet } = R.ui;
  const { pageHead } = R.shared;
  const S = R.state;

  let adminAuthed = false;
  const rerender = () => R.router.route({ force: true, instant: true });
  const gameMatch = g => g.teams[0].map(p => p.name).join(' & ') + ' vs ' + g.teams[1].map(p => p.name).join(' & ');
  const fail = (what) => err => { console.error(what, err); toast('Could not save: ' + (err && err.message ? err.message : 'unknown error')); };

  R.views.admin = function () {
    const el = mk(''); el.classList.add('narrow');
    if (!adminAuthed) {
      el.innerHTML = pageHead('Admin') + `
      <form class="card login" id="alogin" novalidate><input type="text" name="username" autocomplete="username" value="admin" hidden aria-hidden="true">
        <label class="field"><span>Password</span><input class="input" type="password" id="apw" autocomplete="current-password" aria-describedby="aerr"></label>
        <p class="err" id="aerr" role="alert" hidden>Incorrect!</p>
        <button class="btn primary block" style="margin-top:16px">Login</button>
      </form>`;
      el.addEventListener('submit', e => {
        e.preventDefault();
        const inp = $('#apw', el), err = $('#aerr', el);
        if (inp.value === 'bbsucks') { adminAuthed = true; rerender(); }
        else { err.hidden = false; inp.setAttribute('aria-invalid', 'true'); inp.select(); }
      });
      el.addEventListener('input', () => { const inp = $('#apw', el); inp.removeAttribute('aria-invalid'); $('#aerr', el).hidden = true; });
      return { el, heading: 'Admin', onShown() { const i = $('#apw', el); if (i && matchMedia('(pointer: fine)').matches) i.focus({ preventScroll: true }); } };
    }
    el.classList.add('admin');
    el.innerHTML = `<div class="pagehead"><h1 class="t-title">Admin</h1></div>
    <nav class="quicknav" aria-label="Admin sections"><button class="btn quiet" data-jump="admin-settings">Settings</button><button class="btn quiet" data-jump="admin-games">Games</button><button class="btn quiet" data-jump="admin-roster">Roster</button><button class="btn quiet" data-jump="admin-data">Data</button><button class="btn quiet danger" id="alogout">Logout</button></nav>
    <section class="card" id="admin-settings"><h2 class="t-section">Site Settings</h2>
      <div class="switch"><div><div class="t-card">Tournament Mode</div><div class="t-meta" style="max-width:46ch">Activates green background, white text, falling brackets animation, and tournament banner</div></div>
      <button id="tswitch" role="switch" aria-checked="${S.tournament}" aria-label="Tournament Mode"></button></div></section>
    <section class="card" id="admin-games"><h2 class="t-section">All Games <span class="t-meta" id="agcount"></span></h2>
      <label class="field" style="margin-top:12px"><span class="sr">Search games</span><input class="input" type="search" id="agsearch" placeholder="Search by player, game name, or date..." autocomplete="off"></label>
      <div id="aglist"></div></section>
    <section class="card" id="admin-roster"><h2 class="t-section">Player Roster</h2>
      <label class="field" style="margin-top:12px"><span>Add New Player</span></label>
      <form class="rowform" id="addp" novalidate><input class="input" id="newp" placeholder="Enter player name" aria-label="Add New Player" autocomplete="off"><button class="btn primary">Add Player</button></form>
      <div id="rosterlist"></div></section>
    <section class="card" id="admin-data"><h2 class="t-section">Data Management</h2>
      <div class="rowform" style="margin-top:12px"><button class="btn primary" id="aexport">Export JSON Backup</button>
        <label class="btn quiet filebtn">Import JSON Backup<input type="file" id="aimport" accept=".json,application/json"></label></div>
      <p class="t-meta" style="margin-top:12px">Export downloads a JSON backup file. Import to restore from a saved backup file.</p></section>`;

    function drawGames() {
      const q = $('#agsearch', el).value.trim().toLowerCase(), box = $('#aglist', el), cnt = $('#agcount', el);
      if (!S.games.length) { box.innerHTML = '<p class="t-meta" style="margin-top:12px">No games yet</p>'; cnt.textContent = ''; return; }
      const sorted = S.games.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      const list = q ? sorted.filter(g => [...g.teams[0], ...g.teams[1]].map(p => p.name.toLowerCase()).join(' ').includes(q) || (g.name || '').toLowerCase().includes(q) || String(g.date).toLowerCase().includes(q)) : sorted;
      cnt.textContent = `(${list.length} of ${S.games.length})`;
      if (!list.length) { box.innerHTML = '<p class="t-meta" style="margin-top:12px">No games match your search</p>'; return; }
      box.innerHTML = `<ul class="alist">${list.map(g => `<li><a class="grow alink" href="#game/${g.id}" data-push><span class="t-card" style="display:block">${esc(gameMatch(g))}</span><span class="t-meta num">#${g.id} · ${esc(g.date)}${g.name ? ' · ' + esc(g.name) : ''} · Winner: Team ${g.winningTeam}</span></a>
        <span class="acts"><button class="btn quiet" data-edit="${g.id}" aria-label="Edit game ${g.id}">Edit</button><button class="btn quiet danger" data-del="${g.id}" aria-label="Delete game ${g.id}">Delete</button></span></li>`).join('')}</ul>`;
    }
    function drawRoster() {
      const box = $('#rosterlist', el);
      if (!S.roster.length) { box.innerHTML = '<p class="t-meta" style="margin-top:12px">No players yet</p>'; return; }
      box.innerHTML = `<p class="t-meta" style="margin-top:16px"><b style="color:var(--ball)">Total Players: ${S.roster.length}</b></p><ul class="alist">${S.roster.map((n, i) => `<li><span class="grow t-card">${esc(n)}</span><button class="btn quiet danger" data-rm="${i}" aria-label="Remove ${esc(n)}">Remove</button></li>`).join('')}</ul>`;
    }
    drawGames(); drawRoster();

    el.addEventListener('input', e => { if (e.target.id === 'agsearch') drawGames(); });
    el.addEventListener('submit', e => {
      e.preventDefault();
      const inp = $('#newp', el), name = inp.value.trim();
      if (!name) { toast('Enter a player name'); inp.focus(); return; }
      if (S.roster.includes(name)) { toast('Player already exists'); return; }
      R.data.commit(s => { s.roster.push(name); s.roster.sort(); }).then(() => toast('Player added to roster!')).catch(fail('add player'));
      inp.value = ''; drawRoster();
    });
    el.addEventListener('change', e => { if (e.target.id === 'aimport') { importBackup(e.target.files[0]); e.target.value = ''; } });
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.jump) { const t = document.getElementById(b.dataset.jump); if (t) t.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); }
      else if (b.id === 'tswitch') {
        const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', v);
        /* commit() notifies immediately (the theme follows S.tournament) and rolls back if the write is rejected */
        R.data.commit(s => { s.tournament = v; }).catch(fail('tournament'));
      }
      else if (b.id === 'alogout') { adminAuthed = false; rerender(); toast('Logged out'); }
      else if (b.dataset.edit) editGameSheet(+b.dataset.edit, drawGames);
      else if (b.dataset.del) {
        const g = S.games.find(x => x.id === +b.dataset.del); if (!g) return;
        confirmSheet({ title: 'Delete game?', body: `Game #${g.id}: ${gameMatch(g)}, ${g.date}. This changes rankings and ELO.`, yes: 'Delete', danger: true, onYes() {
          R.data.commit(s => { const i = s.games.findIndex(x => x.id === g.id); if (i !== -1) s.games.splice(i, 1); }).then(() => toast('Game deleted')).catch(fail('delete game'));
          drawGames(); } });
      }
      else if (b.dataset.rm) {
        const n = S.roster[+b.dataset.rm]; if (n == null) return;
        confirmSheet({ title: 'Remove ' + n + ' from roster?', body: 'This will not affect existing games.', yes: 'Remove', danger: true, onYes() {
          R.data.commit(s => { const i = s.roster.indexOf(n); if (i !== -1) s.roster.splice(i, 1); }).then(() => toast(n + ' removed')).catch(fail('remove player'));
          drawRoster(); } });
      }
      else if (b.id === 'aexport') exportBackup();
    });
    return { el, heading: 'Admin', onData() { drawGames(); drawRoster(); const t = $('#tswitch', el); if (t) t.setAttribute('aria-checked', S.tournament); } };
  };

  /* ---- edit sheet ---- */
  const EDIT_FIELDS = [['cups', 'Regular Cups'], ['redemptionCups', 'Redemption Cups'], ['overtimeCups', 'Overtime Cups'], ['yacks', 'Yacks'], ['doubles', 'Doubles'], ['tris', 'Tris'], ['quads', 'Quads']];
  function editGameSheet(id, done) {
    const g = S.games.find(x => x.id === id); if (!g) return;
    const t1 = g.teams[0].map(p => p.name).join(' & '), t2 = g.teams[1].map(p => p.name).join(' & ');
    const opts = p => (S.roster.includes(p.name) ? S.roster : [p.name, ...S.roster]).map(n => `<option value="${esc(n)}"${n === p.name ? ' selected' : ''}>${esc(n)}</option>`).join('');
    const player = (p, t, i) => `<fieldset class="epl"><legend class="sr">Team ${t + 1} player ${i + 1}</legend>
      <label class="field"><span>Player Name</span><select class="input" data-t="${t}" data-i="${i}" data-k="name">${opts(p)}</select></label>
      <div class="egrid">${EDIT_FIELDS.map(([k, l]) => `<label class="field"><span>${l}</span><input class="input" type="number" inputmode="numeric" min="0" data-t="${t}" data-i="${i}" data-k="${k}" value="${p[k] || 0}"></label>`).join('')}</div></fieldset>`;
    const s = openSheet(`<div class="ehead"><h2>Edit Game #${g.id}</h2><button class="btn quiet" data-a="no">Close</button></div>
      <label class="field"><span>Winner</span><select class="input" id="ewin"><option value="1"${g.winningTeam === 1 ? ' selected' : ''}>Team 1 (${esc(t1)})</option><option value="2"${g.winningTeam === 2 ? ' selected' : ''}>Team 2 (${esc(t2)})</option></select></label>
      ${[0, 1].map(t => `<h3 class="t-card" style="margin-top:16px">Team ${t + 1} Players</h3>${g.teams[t].map((p, i) => player(p, t, i)).join('')}`).join('')}
      <div class="actions sticky-actions"><button class="btn quiet" data-a="no">Cancel</button><button class="btn primary" data-a="save">Save Changes</button></div>`, { label: 'Edit game ' + g.id });
    s.classList.add('esheet');
    s.addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a !== 'save') { closeSheet(); return; }
      const vals = $$('[data-k]', s).map(f => ({ t: +f.dataset.t, i: +f.dataset.i, k: f.dataset.k, v: f.value }));
      const winner = parseInt($('#ewin', s).value, 10);
      closeSheet();
      R.data.commit(st => {
        const game = st.games.find(x => x.id === id); if (!game) return;
        game.winningTeam = winner;
        vals.forEach(({ t, i, k, v }) => { const p = game.teams[t][i]; p[k] = k === 'name' ? v : Math.max(0, parseInt(v, 10) || 0); });
        game.teams.forEach(t => t.forEach(p => { p.nakedMile = ((p.cups || 0) + (p.redemptionCups || 0) + (p.overtimeCups || 0)) === 0; }));
      }).then(() => toast('Game updated')).catch(fail('edit game'));
      R.replay.clearCache(); done();
    });
  }

  /* ---- JSON backup: same shape as the old exportData(); import validates first so junk can't reach the database ---- */
  function exportBackup() {
    const data = { approvedGames: S.games, playerRoster: S.roster, gameIdCounter: S.counter, tournamentMode: S.tournament, exportDate: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `fisher-ruski-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Data exported successfully!');
  }
  function validBackup(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    const games = d.approvedGames === undefined ? [] : d.approvedGames, roster = d.playerRoster === undefined ? [] : d.playerRoster;
    if (!Array.isArray(games) || !Array.isArray(roster) || roster.some(n => typeof n !== 'string')) return null;
    const num = v => v === undefined || (Number.isFinite(v) && v >= 0);
    for (const g of games) {
      if (!g || typeof g !== 'object' || !Number.isFinite(g.id) || (g.winningTeam !== 1 && g.winningTeam !== 2) || !Array.isArray(g.teams) || g.teams.length !== 2) return null;
      if (g.teams.some(t => !Array.isArray(t) || !t.length || t.some(p => !p || typeof p.name !== 'string' || !num(p.cups) || !['redemptionCups', 'overtimeCups', 'yacks', 'doubles', 'tris', 'quads'].every(k => num(p[k]))))) return null;
    }
    return { games, roster, counter: d.gameIdCounter, tournament: !!d.tournamentMode };
  }
  /* Behaves like the old importData(): it replaces what this page holds in memory. It does not write to the database by itself;
     the next admin change (or any game logged) saves the whole object, exactly as before. */
  function importBackup(file) {
    if (!file) return;
    const bad = () => toast('Error importing data: Invalid file format');
    const rd = new FileReader();
    rd.onerror = bad;
    rd.onload = () => {
      let v = null; try { v = validBackup(JSON.parse(rd.result)); } catch (e) { v = null; }
      if (!v) { bad(); return; }
      confirmSheet({ title: 'Replace all current data?', body: `This will replace all current data with ${v.games.length} game${v.games.length === 1 ? '' : 's'} and ${v.roster.length} player${v.roster.length === 1 ? '' : 's'} from ${file.name}. Continue?`, yes: 'Replace data', danger: true, onYes() {
        R.replay.clearCache();
        R.data.applyLocal({ approvedGames: v.games, playerRoster: v.roster, gameIdCounter: v.counter, tournamentMode: v.tournament });
        R.submit.resetDraft();
        toast('Data imported successfully!');
      } });
    };
    rd.readAsText(file);
  }
})(window.Ruski);
