/* Pieces shared by several pages: game rows, page heads, cached rankings, the loading view. */
(function (R) {
  'use strict';
  const { $, esc, mk, fmtDate } = R.util;
  const { flag, glyphSvg, rackSvg } = R.ui;
  const { getReplay } = R.replay;
  const ST = R.stats, S = R.state;

  const teamName = (g, t) => g.teams[t].length <= 2 ? g.teams[t].map(p => p.name).join(' & ') : g.teams[t][0].name + ' +' + (g.teams[t].length - 1);
  const teamNameFull = (g, t) => g.teams[t].map(p => p.name).join(', ');
  const shortDate = g => ST.gameDate(g).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const longDate = g => ST.gameDate(g).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  /* Rankings are needed by several pages per render; recompute only when the data changed. */
  let rankedRev = -1, rankedCache = [];
  function ranked() {
    if (rankedRev !== S.rev) { rankedCache = ST.rankedPlayers(S.roster, S.games); rankedRev = S.rev; }
    return rankedCache;
  }

  function gameRow(g, opts = {}) {
    let margin = '', tail = '';
    try {
      const r = getReplay(g), last = r.snaps[r.snaps.length - 1];
      margin = last.left[g.winningTeam - 1];
    } catch (e) { margin = null; }
    const w = g.winningTeam - 1;
    const anyRed = g.teams.some(t => t.some(p => (p.redemptionCups || 0) > 0));
    const yacks = g.teams.reduce((a, t) => a + t.reduce((b, p) => b + (p.yacks || 0), 0), 0);
    const nm = g.teams.some(t => t.some(p => p.nakedMile));
    const chips = [];
    if (g.hadOvertime) chips.push('<span class="tok ot">OT</span>');
    else if (anyRed) chips.push('<span class="tok red">Redemption</span>');
    if (nm) chips.push(`<span class="tok nm">${flag('O')}Naked Mile</span>`);
    if (yacks) chips.push(`<span class="tok yack">Yack ×${yacks}</span>`);
    if (opts.player) {
      const f = R.elo.findPlayer(g, opts.player), won = f && f.team === g.winningTeam;
      tail = `<span class="fig">${f ? (f.data.cups || 0) : 0}<small class="${won ? 'up' : 'down'}">${won ? 'Win' : 'Loss'} · cups</small></span>`;
    } else if (margin !== null) {
      tail = `<span class="fig">${margin}<small>${margin === 1 ? 'cup' : 'cups'} left</small></span>`;
    }
    return `<a class="grow-game" href="#game/${g.id}" data-push data-game="${g.id}">
      <span class="gbox">${glyphSvg(g, opts.big ? 40 : 28)}</span>
      <span class="grow"><span class="who">${esc(teamName(g, w))} <span class="beat">beat</span> ${esc(teamName(g, 1 - w))}</span>
        <span class="sub"><span class="t-meta">${esc(g.name || shortDate(g))}${g.name ? ' · ' + esc(shortDate(g)) : ''} · ${g.size}v${g.size}</span>${chips.join('')}</span></span>
      ${tail}</a>`;
  }

  const pageHead = (title, meta) => `<div class="pagehead"><h1 class="t-title">${esc(title)}</h1>${meta ? `<span class="t-meta">${meta}</span>` : ''}</div>`;
  const emptyCard = text => `<div class="card empty">${rackSvg(0).replace('<svg', '<svg class="empty-rack"')}<p>${esc(text)}</p></div>`;

  /* Shown until the first database snapshot arrives (or fails). */
  function loadingView() {
    const el = mk('');
    if (S.error) {
      el.innerHTML = `<div class="empty loading"><h1 class="t-section">Can’t reach the database</h1><p style="margin:8px 0 16px">${esc(S.error)}</p><button class="btn" id="retry">Reload</button></div>`;
      $('#retry', el).addEventListener('click', () => location.reload());
    } else {
      el.innerHTML = `<div class="empty loading" role="status">${rackSvg(0).replace('<svg', '<svg class="empty-rack"')}<p>Racking up…</p></div>`;
    }
    return { el, heading: 'Loading', loading: true };
  }
  R.views.loading = loadingView;

  R.shared = { teamName, teamNameFull, shortDate, longDate, ranked, gameRow, pageHead, emptyCard, fmtDate };
})(window.Ruski);
