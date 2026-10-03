/* Team wheel: the "Pick teams" button on Home. Pick how many are playing, enter names, then spin.
   Each spin lands on one player and drops them on the next team (Team 1, Team 2, Team 1, …); the last
   player is placed automatically. "Log this game" carries the teams into the Log form. */
(function (R) {
  'use strict';
  const { $, $$, esc, reduceMotion } = R.util;
  const { openSheet, closeSheet } = R.ui;
  const NAMES_KEY = 'ruski-wheel-names';
  const SIZES = [1, 2, 3, 4];   // players per team

  function lastNames() { try { return JSON.parse(localStorage.getItem(NAMES_KEY)) || []; } catch (e) { return []; } }
  function keepNames(n) { try { localStorage.setItem(NAMES_KEY, JSON.stringify(n)); } catch (e) { /* private mode */ } }
  function rand(n) {   // uniform 0..n-1, crypto when available
    if (window.crypto && crypto.getRandomValues) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
    return Math.floor(Math.random() * n);
  }

  /* ---- step 1: how many people */
  function open() {
    const s = openSheet(`<h2>Pick teams</h2><p class="sheet-body">How many people are playing?</p>
      <div class="wheel-sizes">${SIZES.map(n => `<button class="btn quiet" data-n="${n}"><b>${n * 2}</b><span>${n}v${n}</span></button>`).join('')}</div>`, { label: 'Pick teams' });
    s.addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (b) names(+b.dataset.n); });
  }

  /* ---- step 2: who's playing */
  function names(size) {
    const prev = lastNames(), count = size * 2;
    const s = openSheet(`<h2>Who's playing?</h2><p class="sheet-body">${count} players, ${size}v${size}.</p>
      <datalist id="wheel-roster">${(R.state.roster || []).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="wheel-names">${Array.from({ length: count }, (_, i) => `<input class="input" list="wheel-roster" autocomplete="off" maxlength="40" aria-label="Player ${i + 1}" placeholder="Player ${i + 1}" data-i="${i}">`).join('')}</div>
      <p class="wheel-err t-meta" role="alert"></p>
      <div class="actions"><button class="btn quiet" data-a="back">Back</button><button class="btn primary" data-a="go" disabled>Spin for teams</button></div>`, { label: 'Who is playing' });
    const inputs = $$('input', s), go = $('[data-a="go"]', s), err = $('.wheel-err', s);
    inputs.forEach((inp, i) => { if (prev[i]) inp.value = prev[i]; });
    function check() {
      const v = inputs.map(x => x.value.trim()), filled = v.every(Boolean);
      const dup = v.find((n, i) => n && v.findIndex(m => m.toLowerCase() === n.toLowerCase()) !== i);
      err.textContent = dup ? `${dup} is in there twice.` : '';
      go.disabled = !filled || !!dup;
      return v;
    }
    check();
    s.addEventListener('input', check);
    s.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { const i = +e.target.dataset.i; if (inputs[i + 1]) inputs[i + 1].focus(); else if (!go.disabled) go.click(); } });
    s.addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'back') open();
      else if (!go.disabled) { const v = check(); keepNames(v); wheel(size, v); }
    });
  }

  /* ---- step 3: the wheel */
  const R0 = 100;   // wheel radius in SVG units
  const pt = (deg, r) => { const a = deg * Math.PI / 180; return [(Math.sin(a) * r).toFixed(2), (-Math.cos(a) * r).toFixed(2)]; };   // clockwise from 12 o'clock
  function wheelSvg(list) {
    const n = list.length, step = 360 / n;
    let out = '';
    list.forEach((name, i) => {
      const a0 = i * step, a1 = a0 + step, mid = a0 + step / 2, [x0, y0] = pt(a0, R0), [x1, y1] = pt(a1, R0);
      const label = name.length > 11 ? name.slice(0, 10) + '…' : name;
      const flip = mid > 180, tr = flip ? `rotate(${(mid + 90).toFixed(2)}) translate(${-R0 * 0.58},0)` : `rotate(${(mid - 90).toFixed(2)}) translate(${R0 * 0.58},0)`;
      out += `<g class="slice s${i % 4}" data-i="${i}"><path d="M0 0L${x0} ${y0}A${R0} ${R0} 0 ${step > 180 ? 1 : 0} 1 ${x1} ${y1}Z"/>` +
        `<text transform="${tr}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text></g>`;
    });
    return `<svg class="wheel-disc" viewBox="-104 -104 208 208" aria-hidden="true"><g class="spin">${out}<circle class="hub" r="13"/></g></svg>`;
  }

  function wheel(size, players) {
    const s = openSheet(`<h2>Spin for teams</h2>
      <div class="wheel"><div class="wheel-pin" aria-hidden="true"></div>${wheelSvg(players)}</div>
      <div class="wheel-teams">${[0, 1].map(t => `<div class="wheel-team"><div class="t-meta">Team ${t + 1}</div><ol data-t="${t}">${'<li class="open"></li>'.repeat(size)}</ol></div>`).join('')}</div>
      <p class="wheel-msg" role="status" aria-live="polite">Spin to pick the first player.</p>
      <div class="actions"><button class="btn quiet" data-a="names">Edit names</button><button class="btn primary" data-a="spin">Spin</button></div>`, { label: 'Team wheel' });
    const spinG = $('.spin', s), msg = $('.wheel-msg', s), btn = $('[data-a="spin"]', s);
    const teams = [[], []], left = players.map((_, i) => i);
    let turn = 0, busy = false;
    const step = 360 / players.length;

    function place(i) {
      const t = turn % 2; turn++;
      teams[t].push(players[i]);
      left.splice(left.indexOf(i), 1);
      $(`.slice[data-i="${i}"]`, s).classList.add('taken', 't' + t);
      const li = $(`ol[data-t="${t}"] li.open`, s); li.classList.remove('open'); li.textContent = players[i];
      return t;
    }
    function done() {
      busy = false;
      msg.textContent = 'Teams are set: ' + teams[0].join(' & ') + ' vs ' + teams[1].join(' & ') + '.';
      btn.textContent = 'Log this game'; btn.dataset.a = 'log'; btn.disabled = false;
      $('[data-a="names"]', s).textContent = 'Spin again'; $('[data-a="names"]', s).dataset.a = 'again';
    }
    function spin() {
      if (busy || left.length < 2) return;
      busy = true; btn.disabled = true;
      const pick = left[rand(left.length)];
      const target = pick * step + step * (0.2 + 0.6 * Math.random());   // land somewhere inside the slice, not dead centre
      const cur = spinG._rot || 0, extra = reduceMotion() ? 0 : 360 * (4 + rand(2));
      const rot = cur + extra + ((((-target - cur) % 360) + 360) % 360);
      spinG._rot = rot;
      spinG.style.transition = reduceMotion() ? 'none' : 'transform 3.2s cubic-bezier(.12,.66,.1,1)';
      spinG.style.transform = `rotate(${rot}deg)`;
      msg.textContent = 'Spinning…';
      const land = () => {
        const t = place(pick);
        msg.textContent = `${players[pick]} → Team ${t + 1}`;
        if (left.length === 1) { const last = left[0], lt = place(last); msg.textContent += `. ${players[last]} → Team ${lt + 1}.`; setTimeout(done, 900); }
        else { busy = false; btn.disabled = false; }
      };
      if (reduceMotion()) setTimeout(land, 200); else setTimeout(land, 3250);
    }
    s.addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'spin') spin();
      else if (a.dataset.a === 'names') names(size);
      else if (a.dataset.a === 'again') wheel(size, players);
      else if (a.dataset.a === 'log') {
        R.submit.rematch({ size, teams: teams.map(t => t.map(name => ({ name }))) });
        closeSheet(); R.router.go('#submit', 'replace');
      }
    });
  }

  R.teamWheel = { open };
})(window.Ruski);
