/* Data layer: the ONLY file that talks to Firebase.
 *
 *   R.state   { games, roster, counter, tournament, loaded, rev, error, mode }
 *   R.data    { mode, init(), subscribe(fn), commit(mutator) -> Promise, save() -> Promise, addMinigameShots(shots, hits) }
 *
 * The mini game keeps a running total of every player's shots at `minigameStats` ({shots, hits}), a separate
 * node from the game data. It is only ever incremented with a transaction, never written whole.
 *
 * Storage shape is unchanged from the old single-file app: one object at `fisherRuskiData` that is
 * written whole with set():  { approvedGames, playerRoster, gameIdCounter, tournamentMode, lastSaved }.
 *
 * Dev modes (query string, never on by accident; a badge is shown whenever one is active):
 *   ?readonly=1   reads the live database, but every write is blocked and logged instead.
 *   ?mock=1       no network at all: loads js/dev/fixture.js. localhost / 127.0.0.1 / file: only, so a
 *                 crafted link on playruski.org cannot swap the site's data for fake data.
 */
(function (R) {
  'use strict';
  const cfg = R.config;

  const qs = new URLSearchParams(location.search);
  const localHost = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
  const mode = qs.get('mock') === '1' && localHost ? 'mock' : qs.get('readonly') === '1' ? 'readonly' : 'live';

  const S = R.state = { games: [], roster: [], counter: 1, tournament: false, loaded: false, rev: 0, error: null, mode, mg: { shots: 0, hits: 0 } };
  const MG_PATH = 'minigameStats';
  const subs = [];
  let database = null;

  const notify = () => { S.rev++; subs.forEach(fn => { try { fn(S); } catch (e) { console.error(e); } }); };
  function subscribe(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; }

  function apply(data) {
    data = data || {};
    S.games = data.approvedGames || [];       // Firebase drops empty arrays, so always default
    S.roster = data.playerRoster || [];
    S.counter = data.gameIdCounter || 1;
    S.tournament = !!data.tournamentMode;
    S.loaded = true; S.error = null;
    notify();
  }

  function payload() {
    return { approvedGames: S.games, playerRoster: S.roster, gameIdCounter: S.counter, tournamentMode: S.tournament, lastSaved: new Date().toISOString() };
  }

  /* Whole-object write, exactly like the old saveToFirebase(). Blocked in mock and readonly modes. */
  function save() {
    const data = payload();
    if (mode !== 'live') {
      console.info('[ruski:' + mode + '] write blocked (' + data.approvedGames.length + ' games, ' + data.playerRoster.length + ' players, counter ' + data.gameIdCounter + ')');
      return new Promise(res => setTimeout(res, 250));
    }
    return database.ref(cfg.dataPath).set(data);
  }

  /* Apply a change to the in-memory state, then write it. If the write is rejected the change is rolled back. */
  function commit(mutator) {
    const backup = JSON.stringify({ games: S.games, roster: S.roster, counter: S.counter, tournament: S.tournament });
    mutator(S);
    notify();
    return save().catch(err => {
      const b = JSON.parse(backup);
      S.games = b.games; S.roster = b.roster; S.counter = b.counter; S.tournament = b.tournament;
      notify();
      throw err;
    });
  }

  /* add one visit's mini-game shots to everyone's total. Atomic, so two phones finishing at once both count. */
  function addMinigameShots(shots, hits) {
    shots = Math.floor(shots); hits = Math.floor(hits);
    if (!(shots > 0 && shots <= 500 && hits >= 0 && hits <= shots)) return Promise.resolve();
    if (mode !== 'live' || !database) { console.info('[ruski:' + mode + '] mini game stats not sent (' + hits + '/' + shots + ')'); return Promise.resolve(); }
    return database.ref(MG_PATH).transaction(cur => ({
      shots: ((cur && cur.shots) | 0) + shots, hits: ((cur && cur.hits) | 0) + hits, updated: new Date().toISOString()
    })).catch(err => console.warn('mini game stats not saved', err));
  }

  function init() {
    const badge = { mock: 'Mock data. Nothing is saved.', readonly: 'Read-only. Writes are blocked.' }[mode];
    if (badge) {
      document.documentElement.dataset.devmode = mode;
      const b = document.createElement('span'); b.className = 'devbadge'; b.textContent = badge; b.setAttribute('role', 'status');
      document.getElementById('head').appendChild(b);
    }
    if (mode === 'mock') {
      const s = document.createElement('script'); s.src = 'js/dev/fixture.js';
      s.onload = () => apply(window.RUSKI_FIXTURE);
      s.onerror = () => { S.error = 'Could not load js/dev/fixture.js'; notify(); };
      document.head.appendChild(s);
      return;
    }
    if (!window.firebase) { S.error = 'Firebase failed to load. Check your connection and reload.'; notify(); return; }
    firebase.initializeApp(cfg.firebase);
    database = firebase.database();
    database.ref(MG_PATH).on('value', snap => { const v = snap.val() || {}; S.mg = { shots: v.shots | 0, hits: v.hits | 0 }; }, () => {});
    database.ref(cfg.dataPath).on('value', snap => apply(snap.val()), err => {
      console.error('Firebase read failed', err);
      S.error = 'Could not read the database: ' + err.message; notify();
    });
  }

  R.data = { mode, init, subscribe, commit, save, applyLocal: apply, addMinigameShots };
})(window.Ruski);
