/* Game detail + animated replay (#game/<id>).
   Playback state is a pure function of the event index (RP.snaps[i]), so scrubbing never has to replay animations.
   Cups live on a CSS-3D table plane: each cup is a billboard (counter-rotated) standing on it, wet rings lie flat.
   Reconstruction itself is in js/replay.js. */
(function (R) {
  'use strict';
  const { $, $$, esc, mk, reduceMotion, signed, hash01, store, toast } = R.util;
  const { flag } = R.ui;
  const { teamName, teamNameFull, longDate } = R.shared;
  const { getReplay } = R.replay;
  const DB = R.state;

const TABLE_H = 1.7, END_M = 0.1;
const BLOBS = [
  'M12 38C6 22 22 8 40 12C52 2 74 6 80 20C96 24 98 44 84 54C74 66 52 64 40 60C26 68 8 56 12 38Z',
  'M8 34C10 16 34 10 46 16C60 6 84 14 90 32C96 46 80 62 62 58C50 68 28 66 18 56C8 52 6 42 8 34Z',
  'M14 30C22 12 44 14 54 10C72 8 92 22 86 40C82 58 62 60 48 62C30 66 10 54 14 30Z',
  'M6 36C8 20 28 14 40 20C48 8 70 8 78 22C94 20 98 40 86 50C80 62 60 60 50 56C36 66 12 58 6 36Z',
  'M16 40C10 26 26 12 44 18C58 8 80 16 84 30C92 38 90 54 74 56C62 64 40 66 30 58C22 56 18 48 16 40Z'
];
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  replay: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6.500 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M7 5h2v14H7zM20 5v14L10 12z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M15 5h2v14h-2zM4 5l10 7L4 19z"/></svg>'
};
const cupXY = (t, c) => [c.x, t === 0 ? (TABLE_H / 2 - END_M - c.d) : (-TABLE_H / 2 + END_M + c.d)];

R.views.game = function (r) {
  const id = +r.arg, gi = DB.games.findIndex(g => g.id === id);
  const el = mk('');
  if (gi < 0) {
    el.innerHTML = `<div class="empty"><h1 class="t-section">Game not found</h1><p style="margin:8px 0 16px">It may have been deleted.</p><a class="btn" href="#home">Home</a></div>`;
    return { el, heading: 'Game' };
  }
  const g = DB.games[gi];
  let RP;
  try { RP = getReplay(g); } catch (e) {
    /* A legacy record the reconstruction can't digest: never lose the box score because of it. */
    console.error('Replay failed for game', g.id, e);
    el.innerHTML = `<div class="gd-head"><h1 class="t-title">${esc(g.name || 'Game #' + g.id)}</h1><span class="t-meta">${esc(longDate(g))}</span></div>
      <p class="t-meta">The replay could not be built for this game. Box score:</p>
      <table class="tbl"><thead><tr><th>Player</th><th class="n">Cups</th><th class="n">Red</th><th class="n">OT</th><th class="n">Yack</th></tr></thead><tbody>${g.teams.map((t, ti) => t.map(p => `<tr><td>${esc(p.name)}${ti + 1 === g.winningTeam ? ' (W)' : ''}</td><td class="n">${p.cups || 0}</td><td class="n">${p.redemptionCups || 0}</td><td class="n">${p.overtimeCups || 0}</td><td class="n">${p.yacks || 0}</td></tr>`).join('')).join('')}</tbody></table>`;
    return { el, heading: 'Game #' + g.id };
  }
  const M = RP.meta, movers = R.elo.eloMovers(DB.games, gi);
  const stamp = JSON.stringify(DB.games.slice(0, gi + 1));   // the replay and its ELO card only depend on this game and the ones before it
  const last = RP.events.length - 1, isNew = r.q.get('new') === '1';
  const shotNo = []; RP.events.reduce((n, e, i) => (shotNo[i] = n + (e.type === 'shot' ? 1 : 0)), 0);
  const totalShots = shotNo[last];
  const w = g.winningTeam - 1;
  const anyNM = g.teams.some(t => t.some(p => p.nakedMile));
  const S = { idx: 0, playing: false, timer: 0, speed: +store('ruski-speed') || 1, hl: null, mounted: null };
  const title = g.name || 'Game #' + g.id;

  const legendChip = (t, p) => `<button class="pchip t${t + 1}" data-p="${esc(p.name)}" aria-pressed="false" ><span class="n"><span class="dot"></span><span class="ell">${esc(p.name)}</span>${p.nakedMile ? `<span class="nmflag" hidden>${flag('O')}</span>` : ''}</span><span class="c" data-c="${esc(p.name)}">0 cups</span></button>`;
  el.innerHTML = `
    <div class="gd-head"><h1 class="t-title">${esc(title)}</h1>
      <span class="t-meta">${esc(longDate(g))} · ${g.size}v${g.size}</span>
      ${g.hadOvertime ? '<span class="tok ot">OT</span>' : ''}${anyNM ? `<span class="tok nm">${flag('O')}Naked Mile</span>` : ''}</div>
    <div class="split game"><div class="col-a">
    <div class="strip-hdr"><span class="phase" id="ph">MAIN</span><span class="score num" id="sc" aria-label="Cups left"></span><span class="t-meta num" id="shotn"></span></div>
    <div class="frame">
      <div class="scene" id="scene" aria-hidden="true">
        <div class="tbl3d"><div class="floor"></div><div class="top"><div class="mid"></div><svg class="fdecal" viewBox="0 0 100 100" aria-hidden="true"><path d="M27 10h50v17H46v15h27v16H46v32H27z" fill="var(--rmg-decal)"/></svg></div>
          <div class="layer" id="cups"></div><div class="layer" id="puddles"></div><div class="layer" id="balls"></div></div>
        <div class="teamtag top"><span class="marker">${esc(M.teamLabel[1])}</span></div>
        <div class="teamtag bot"><span class="marker">${esc(M.teamLabel[0])}</span></div>
        <div id="flash"></div>
      </div>
      <div class="caption" id="cap" aria-live="polite"></div>
      <div class="recon"><span class="t-meta">Reconstructed from the box score. Shot order is illustrative.</span>${M.approx ? '<span class="tok" title="The box score did not add up to a full rack, so a few cups were adjusted">Adjusted</span>' : ''}</div>
      <div class="controls">
        <button class="ib" id="bprev" aria-label="Previous shot">${ICON.prev}</button>
        <button class="ib" id="bplay" aria-label="Play">${ICON.play}</button>
        <button class="ib" id="bnext" aria-label="Next shot">${ICON.next}</button>
        <div class="scrub"><div class="ticks" id="ticks"></div><input type="range" id="scrub" min="0" max="${last}" step="1" value="0" aria-label="Replay position"></div>
        <button class="speed" id="bspeed" aria-label="Playback speed">1x</button>
      </div>
    </div>
    <div class="gd-actions"><button class="btn" id="bshare">Share</button><button class="btn" id="brematch">Rematch</button><button class="btn quiet" id="belo">Show ELO</button></div></div>
    <div class="col-b"><div class="legend" id="legend">${[0, 1].map(t => `<div class="lteam"><h3><span class="marker">${esc(M.teamLabel[t])}</span></h3>${g.teams[t].map(p => legendChip(t, p)).join('')}</div>`).join('')}</div>
    <div class="elocard" id="elo" aria-live="polite"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px"><div class="ban">${esc(teamName(g, w))} ${g.teams[w].length === 1 ? 'wins' : 'win'}</div>
      <div style="text-align:right"><div class="t-hero up num" style="font-size:44px">${signed(Math.max(...movers.map(m => m.delta)))}</div><div class="t-meta">biggest swing</div></div></div>
      <ul class="ledger" style="margin-top:8px">${movers.slice().sort((a, b) => b.won - a.won || b.delta - a.delta).map(m => {
        const reasons = [];
        if (m.won && (m.p.redemptionCups || 0) > 0) reasons.push('<span class="tok red">Clutch</span>');
        if (m.won && (m.p.overtimeCups || 0) > 0) reasons.push('<span class="tok ot">OT clutch</span>');
        if (m.p.yacks) reasons.push(`<span class="tok yack">Yack ×${m.p.yacks}</span>`);
        if (m.p.nakedMile) reasons.push(`<span class="tok nm">${flag('O')}Naked Mile</span>`);
        return `<li><span class="grow"><span class="t-card" style="display:block">${esc(m.name)}</span><span class="t-meta num">${m.before} → ${m.after}</span>${reasons.length ? `<span class="sub" style="display:flex;gap:4px 12px;margin-top:4px;flex-wrap:wrap">${reasons.join('')}</span>` : ''}</span><span class="d num ${m.delta >= 0 ? 'up' : 'down'}">${signed(m.delta)}</span></li>`; }).join('')}</ul></div>
    <div class="section"><h2 class="t-section">Box score</h2><table class="tbl" style="margin-top:8px"><thead><tr><th>Player</th><th class="n">Cups</th><th class="n">Red</th><th class="n">OT</th><th class="n">Yack</th><th class="n">ELO</th></tr></thead><tbody>
      ${[0, 1].map(t => `<tr><td colspan="6" style="padding-top:14px" class="t-meta">${esc(teamNameFull(g, t))}${t === w ? ' <span class="tok win" style="margin-left:6px">Winner</span>' : ''}</td></tr>` + g.teams[t].map(p => {
        const m = movers.find(x => x.name === p.name), extra = [p.doubles ? p.doubles + ' double' + (p.doubles > 1 ? 's' : '') : '', p.tris ? p.tris + ' tri' : '', p.quads ? p.quads + ' quad' : ''].filter(Boolean).join(', ');
        return `<tr><td><a href="#players/${encodeURIComponent(p.name)}" data-push style="display:block;min-height:44px;padding-top:10px"><b>${esc(p.name)}</b>${extra ? `<span class="t-meta" style="display:block;line-height:1.1">${extra}</span>` : ''}</a></td><td class="n">${p.cups || 0}</td><td class="n">${p.redemptionCups || 0}</td><td class="n">${p.overtimeCups || 0}</td><td class="n">${p.yacks || 0}</td><td class="n"><b class="${m.delta >= 0 ? 'up' : 'down'}">${signed(m.delta)}</b></td></tr>`; }).join('')).join('')}
    </tbody></table></div></div></div>`;

  const scene = $('#scene', el), layer = $('#cups', el), pud = $('#puddles', el), ballsL = $('#balls', el), flashL = $('#flash', el);
  const map = {}; let tw = 340, ro = null, ballAnims = new Set();

  function fitScene() { tw = Math.round(Math.max(230, Math.min(scene.clientWidth * 0.76, 380))); scene.style.setProperty('--tw', tw + 'px'); }
  function mount(sn, animate) {
    layer.innerHTML = ''; ballsL.innerHTML = ''; for (const k in map) delete map[k];
    sn.racks.forEach((rk, t) => rk.cups.forEach(c => {
      const pos = document.createElement('div'); pos.className = 'pos';
      pos.innerHTML = `<div class="cup${sn.rackSet === 'ot' ? ' ot' : ''}${animate ? ' enter' : ''}"><div class="ring"></div><div class="bb"><div class="b"></div><div class="r"></div></div></div>`;
      const [x, y] = cupXY(t, c); pos.style.setProperty('--x', x); pos.style.setProperty('--y', y);
      layer.appendChild(pos); map[c.id] = { pos, cup: pos.firstChild };
    }));
    S.mounted = sn.rackSet;
  }
  function flash(text, cls) {
    const d = document.createElement('div'); d.className = 'phasecard ' + (cls || ''); d.textContent = text; flashL.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }
  function launchBall(ev, idx) {
    if (reduceMotion()) return;
    const startY = ev.team === 0 ? TABLE_H / 2 + 0.07 : -TABLE_H / 2 - 0.07, sx = (hash01(idx) - .5) * .16;
    let ex, ey;
    if (ev.aimId) { [ex, ey] = cupXY(ev.aimTeam, { x: ev.aimX, d: ev.aimD }); }
    else { const cy = ev.aimTeam === 0 ? TABLE_H / 2 - END_M - .18 : -TABLE_H / 2 + END_M + .18; ex = (hash01(idx + 3) - .5) * .4; ey = cy + (hash01(idx + 7) - .5) * .26; }
    const dur = Math.max(170, 520 / S.speed);
    const b = document.createElement('div'); b.className = 'ballw'; b.innerHTML = '<div class="sh"></div><div class="bl"></div>';
    ballsL.appendChild(b);
    const a = b.animate([{ transform: `translate3d(${sx * tw}px,${startY * tw}px,2px)` }, { transform: `translate3d(${ex * tw}px,${ey * tw}px,2px)` }], { duration: dur, easing: 'cubic-bezier(.33,0,.67,1)', fill: 'forwards' });
    const arc = tw * (.2 + hash01(idx + 1) * .06), bl = b.lastChild;
    bl.animate([{ transform: 'rotateX(-56deg) translateY(0)', easing: 'cubic-bezier(.2,.7,.4,1)' }, { transform: `rotateX(-56deg) translateY(${-arc}px)`, offset: .5, easing: 'cubic-bezier(.6,0,.8,.4)' }, { transform: 'rotateX(-56deg) translateY(0)' }], { duration: dur });
    ballAnims.add(a);
    let gone = false;
    setTimeout(() => { if (!gone && b.isConnected) { gone = true; ballAnims.delete(a); b.remove(); } }, dur + 1400 / S.speed);   // safety net if onfinish never fires
    a.onfinish = () => {
      if (gone) return; gone = true;
      ballAnims.delete(a);
      const linger = ev.kind === 'tri' || ev.kind === 'quad' ? 700 / S.speed : ev.removed.length ? 40 : 260 / S.speed;
      setTimeout(() => { b.style.transition = 'opacity .2s'; b.style.opacity = 0; setTimeout(() => b.remove(), 220); }, linger);
    };
  }
  function renderPuddles(sn) {
    const have = pud.children.length;
    if (sn.puddles.length < have) pud.innerHTML = '';
    for (let i = pud.children.length; i < sn.puddles.length; i++) {
      const p = sn.puddles[i], pos = document.createElement('div'); pos.className = 'pos';
      pos.style.setProperty('--x', ((p.k % 5) - 2) * 0.13 + (p.team ? .04 : -.04));
      pos.style.setProperty('--y', p.team === 0 ? TABLE_H / 2 + 0.1 : -TABLE_H / 2 - 0.1);
      pos.innerHTML = `<svg class="puddle" viewBox="0 0 100 70" style="transform:rotate(${p.shape * 37}deg)"><path d="${BLOBS[p.shape]}" fill="currentColor"/></svg>`;
      pud.appendChild(pos);
    }
  }
  const legendEls = {}; $$('.pchip', el).forEach(b => { legendEls[b.dataset.p] = b; });
  function buildTicks() {
    const t = $('#ticks', el); let html = '';
    RP.events.forEach((e, i) => {
      const left = (last ? i / last * 100 : 0).toFixed(2);
      if (e.type === 'phase') html += `<i class="${e.label === 'OVERTIME' ? 'ot' : 'red'}" style="left:${left}%"></i>`;
      else if (e.type === 'shot' && e.yack) html += `<i class="yk" style="left:${left}%"></i>`;
      else if (e.type === 'shot' && S.hl && e.name === S.hl && e.removed.length) html += `<i class="hl" style="left:${left}%"></i>`;
    });
    t.innerHTML = html;
  }
  function show(i, o = {}) {
    i = Math.max(0, Math.min(last, i)); const prev = S.idx; S.idx = i;
    const sn = RP.snaps[i], ev = RP.events[i], animate = !!o.animate;
    if (S.mounted !== sn.rackSet) mount(sn, animate && sn.rackSet === 'ot');
    const removing = new Set(animate && ev.type === 'shot' ? ev.removed : []);
    const dly = (.44 / S.speed).toFixed(2) + 's';
    let winId = null;
    if (ev.type === 'end') for (let k = last; k >= 0; k--) { const e = RP.events[k]; if (e.type === 'shot' && e.removed.length) { winId = e.removed[e.removed.length - 1]; break; } }
    sn.racks.forEach((rk, t) => rk.cups.forEach(c => {
      const m = map[c.id]; if (!m) return;
      const [x, y] = cupXY(t, c); m.pos.style.setProperty('--x', x); m.pos.style.setProperty('--y', y);
      m.cup.style.setProperty('--sd', removing.has(c.id) ? dly : '0s');
      m.cup.classList.toggle('sunk', !c.up);
      m.cup.classList.toggle('redem', sn.redemTeam === t && c.up);
      m.cup.classList.toggle('dim', sn.phase === 'FINAL' && c.up);
      m.cup.classList.toggle('win', c.id === winId);
    }));
    renderPuddles(sn);
    if (!animate) { ballsL.innerHTML = ''; ballAnims.clear(); }
    if (animate && ev.type === 'shot') { launchBall(ev, i); if (ev.rerack !== null) flash('Rerack', 'sm'); }
    if (ev.type === 'phase' && (animate || o.flash)) flash(ev.label === 'OVERTIME' ? 'Overtime' : 'Redemption', ev.label === 'REDEMPTION' ? 'red' : '');
    if (ev.type === 'end') {
      const v = document.createElement('div'); v.className = 'victory'; v.textContent = 'Winner';
      v.style.cssText = w === 0 ? 'bottom:24%' : 'top:22%'; flashL.appendChild(v); setTimeout(() => v.remove(), 2000);
    }
    const ph = $('#ph', el); ph.textContent = sn.phase === 'FINAL' ? 'FINAL' : sn.phase; ph.className = 'phase' + (sn.phase === 'REDEMPTION' ? ' red' : sn.phase === 'OVERTIME' ? ' ot' : '');
    $('#sc', el).innerHTML = `${sn.left[0]}<em>–</em>${sn.left[1]}`;
    $('#shotn', el).textContent = `Shot ${shotNo[i]} of ${totalShots}`;
    $('#cap', el).textContent = sn.caption;
    const sc = $('#scrub', el); sc.value = i; sc.setAttribute('aria-valuetext', `Shot ${shotNo[i]} of ${totalShots}`);
    Object.keys(legendEls).forEach(n => {
      const h = sn.hits[n], b = legendEls[n], parts = [h.reg + ' cups'];
      if (h.red) parts.push(h.red + ' red'); if (h.ot) parts.push(h.ot + ' OT'); if (h.tq) parts.push(h.tq + ' tri/quad'); if (h.yacks) parts.push(h.yacks + ' yack' + (h.yacks > 1 ? 's' : ''));
      $('[data-c]', b).textContent = parts.join(' · ');
      const shooting = animate && ev.type === 'shot' && ev.name === n;
      b.classList.toggle('shoot', !!(sn.shooter && RP.meta.T[sn.shooter.team][sn.shooter.pi].name === n && S.playing));
      if (shooting && ev.yack) { b.classList.remove('yacking'); void b.offsetWidth; b.classList.add('yacking'); setTimeout(() => b.classList.remove('yacking'), 750); }
      const f = $('.nmflag', b); if (f) f.hidden = ev.type !== 'end';
      b.style.borderStyle = (ev.type === 'end' && f) ? 'dashed' : '';
    });
    $('#elo', el).classList.toggle('in', i === last);
    updatePlayBtn();
  }
  function updatePlayBtn() {
    const b = $('#bplay', el), atEnd = S.idx >= last && !S.playing;
    b.innerHTML = S.playing ? ICON.pause : atEnd ? ICON.replay : ICON.play;
    b.setAttribute('aria-label', S.playing ? 'Pause' : atEnd ? 'Replay' : 'Play');
  }
  function schedule() {
    clearTimeout(S.timer); if (!S.playing) return;
    S.timer = setTimeout(() => {
      if (S.idx >= last) { S.playing = false; updatePlayBtn(); return; }
      show(S.idx + 1, { animate: true });
      if (S.idx >= last) { S.playing = false; updatePlayBtn(); } else schedule();
    }, RP.events[S.idx].dur / S.speed);
  }
  function play() {
    if (S.idx >= last) show(0);
    S.playing = true; updatePlayBtn(); schedule();
  }
  function pause() { S.playing = false; clearTimeout(S.timer); $$('.pchip.shoot', el).forEach(b => b.classList.remove('shoot')); updatePlayBtn(); }
  const toggle = () => S.playing ? pause() : play();
  const step = d => { pause(); show(S.idx + d, { animate: false, flash: true }); };

  scene.addEventListener('click', toggle);
  $('#bplay', el).addEventListener('click', toggle);
  $('#bprev', el).addEventListener('click', () => step(-1));
  $('#bnext', el).addEventListener('click', () => step(1));
  $('#scrub', el).addEventListener('input', e => { pause(); show(+e.target.value); });
  const spd = [0.5, 1, 2, 4]; $('#bspeed', el).textContent = S.speed + 'x';
  $('#bspeed', el).addEventListener('click', e => { S.speed = spd[(spd.indexOf(S.speed) + 1) % 4]; store('ruski-speed', S.speed); e.currentTarget.textContent = S.speed + 'x'; if (S.playing) schedule(); });
  $('#belo', el).addEventListener('click', () => { pause(); show(last); $('#elo', el).scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' }); });
  $('#legend', el).addEventListener('click', e => {
    const b = e.target.closest('.pchip'); if (!b) return;
    S.hl = S.hl === b.dataset.p ? null : b.dataset.p;
    $$('.pchip', el).forEach(x => x.setAttribute('aria-pressed', x.dataset.p === S.hl)); buildTicks();
  });
  $('#bshare', el).addEventListener('click', async () => {
    const text = `${teamName(g, w)} beat ${teamName(g, 1 - w)}. Watch the replay.`;
    try { if (navigator.share) await navigator.share({ title, text, url: location.href }); else { await navigator.clipboard.writeText(location.href); toast('Link copied'); } }
    catch (e) { if (e && e.name !== 'AbortError') toast('Could not share from this browser'); }
  });
  $('#brematch', el).addEventListener('click', () => { R.submit.rematch(g); R.router.go('#submit', 'replace'); });
  const onKey = e => {
    if (R.router.current().view !== 'game' || R.ui.isSheetOpen()) return;
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (e.key === ' ' && !typing && t.tagName !== 'BUTTON' && t.tagName !== 'A') { e.preventDefault(); toggle(); }
    else if (!typing && e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (!typing && e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  };
  document.addEventListener('keydown', onKey);

  const api = { start() { if (reduceMotion()) { show(last); } else { show(0); play(); } } };
  R.replayApi = api;
  return {
    el, heading: title, api,
    onShown() {
      ro = new ResizeObserver(fitScene); ro.observe(scene); fitScene();
      buildTicks(); show(0);
      if (reduceMotion()) show(last);
      else if (!isNew) setTimeout(() => { if (R.router.current().el === el && S.idx === 0 && !S.playing) play(); }, 480);
    },
    cleanup() { pause(); if (ro) ro.disconnect(); document.removeEventListener('keydown', onKey); ballAnims.forEach(a => a.cancel()); if (R.replayApi === api) R.replayApi = null; },
    onData() {
      const ni = DB.games.findIndex(x => x.id === id);
      if (ni < 0 || JSON.stringify(DB.games.slice(0, ni + 1)) !== stamp) R.router.route({ force: true, instant: true });
    }
  };
};
})(window.Ruski);
