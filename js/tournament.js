/* Tournament Day: felt theme + bouncing ping-pong balls behind the content.
   The switch lives in the database (S.tournament); this file only paints it. The last value is cached in
   localStorage purely so the first paint on a return visit doesn't flash the wrong theme. */
(function (R) {
  'use strict';
  const { $, reduceMotion, hash01, store } = R.util;

function set(on, quiet) {
  const root = document.documentElement;
  if (on) root.dataset.theme = 'tournament'; else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]').content = on ? '#0B6B2D' : '#060806';
  if (!quiet) store('ruski-tournament', !!on);
  if (on) bounceStart(); else bounceStop();
  if (!quiet) R.hero.remount();
}
const Bounce = { balls: [], raf: 0, last: 0, on: false };
function bounceFloor() { return innerHeight - (innerWidth >= 1024 ? 0 : 60); }
function bouncePlace(b) {
  const q = b.sq, sx = 1 + .22 * q, sy = 1 - .26 * q;
  b.el.style.transform = `translate3d(${b.x - b.r}px,${b.y - b.r + b.r * (1 - sy)}px,0) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
}
function bounceStart() {
  const box = $('#bounce'); if (!box) return;
  bounceStop(); box.innerHTML = ''; Bounce.balls = []; Bounce.on = true;
  const W = innerWidth, F = bounceFloor(), n = W < 600 ? 7 : W < 1024 ? 10 : 14, still = reduceMotion();
  for (let i = 0; i < n; i++) {
    const r = Math.round(5 + hash01(i * 3 + 1) * 9);          // 10-28px balls
    const el = document.createElement('i'); el.style.width = el.style.height = 2 * r + 'px';
    const b = { el, r, x: (i + .5) / n * W + (hash01(i + 2) - .5) * 30, y: still ? F - r : F * (.15 + hash01(i + 9) * .6), vx: (hash01(i + 5) - .5) * 160, vy: (hash01(i + 7) - .5) * 200, sq: 0 };
    box.appendChild(el); Bounce.balls.push(b); bouncePlace(b);
  }
  if (!still) { Bounce.last = performance.now(); Bounce.raf = requestAnimationFrame(bounceTick); }
}
function bounceStop() { Bounce.on = false; if (Bounce.raf) cancelAnimationFrame(Bounce.raf); Bounce.raf = 0; const box = $('#bounce'); if (box) box.innerHTML = ''; }
function bounceTick(now) {
  Bounce.raf = 0; if (!Bounce.on || document.hidden) return;
  const dt = Math.min(.033, (now - Bounce.last) / 1000); Bounce.last = now;
  const W = innerWidth, F = bounceFloor(), G = 1500;
  Bounce.balls.forEach((b, i) => {
    b.vy += G * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); } else if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
    if (b.y > F - b.r) {
      b.y = F - b.r; b.sq = Math.min(1, b.vy / 900);
      b.vy = -b.vy * .74;                                        // lose a quarter of the energy per bounce
      if (-b.vy < 260) {                                         // too tired to bounce: jump again
        const h = F * (.25 + Math.random() * .5); b.vy = -Math.sqrt(2 * G * h); b.vx = (Math.random() - .5) * 220;
      }
    }
    b.sq = Math.max(0, b.sq - dt * 9);
    bouncePlace(b);
  });
  Bounce.raf = requestAnimationFrame(bounceTick);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && Bounce.on && !Bounce.raf && !reduceMotion()) { Bounce.last = performance.now(); Bounce.raf = requestAnimationFrame(bounceTick); } });
let bounceRT; addEventListener('resize', () => { if (!Bounce.on) return; clearTimeout(bounceRT); bounceRT = setTimeout(bounceStart, 200); });

  function hint() { if (store('ruski-tournament') === true) set(true, true); }
  R.data.subscribe(s => { if (s.loaded && (document.documentElement.dataset.theme === 'tournament') !== !!s.tournament) set(s.tournament); });
  R.tournament = { set, hint };
})(window.Ruski);
