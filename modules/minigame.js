/*!
 * RuskiMiniGame - playable beer-pong hero for the Ruski tracker.
 *
 *   window.RuskiMiniGame.mount(containerEl, opts)  -> Promise<boolean>  (true = live, false = kept static hero)
 *   window.RuskiMiniGame.unmount()
 *   window.RuskiMiniGame.reset()                   -> "Rack 'em"
 *   window.RuskiMiniGame.throwBall({aim, power})   -> aim -1..1, power 0..1 (used by tests / keyboard parity)
 *   window.RuskiMiniGame.getState()
 *
 * You vs the CPU, Ruski rules: 2 shots a turn, rerack to a 3-2-1 triangle at 6 cups and a stoplight at 3,
 * two hits in one turn makes the other side yack and lose a shot, a shot off the back of the table is
 * Ginobes (the shooter's next shot is off-hand), redemption until a miss, overtime at 3 cups, then double overtime (full rack).
 * Both shots in one turn = balls back. You have to call your own reracks (the Rerack button) before your next
 * shot or you lose the rack; calling one when it isn't a rerack is Galaxy: the CPU's cups scatter until the next rerack.
 *
 * opts (all optional):
 *   caption   {value, label}     small stat drawn bottom-left (replaces the old .cap block)
 *   palette   {cup, rim, beer, ball, table, bg}   CSS colour strings; default = read from CSS variables
 *   css       true|false         auto-inject minigame.css next to this script (default true if script src known)
 *   storageKey string            localStorage key for your W-L record vs the CPU (default 'ruski.minigame.record')
 *   cpuHitRate  number | () => number   CPU's chance to hit a shot (default 0.28; the host derives it from real games)
 *   onGameOver(result)           result = {won, record: {w, l}, shots}
 *   onStats({shots, hits})       your regular (not off-hand) shots since the last report; sent at game end,
 *                                on "Rack 'em" and when the game is unmounted, so the host can keep a running hit rate
 *   onFail(err)                  called when THREE/WebGL is unavailable (host keeps the static hero)
 *
 * Uses global THREE r128 (loads it from cdnjs if missing). No physics library; hand-rolled ballistic
 * integration at a fixed 120 Hz step. Draw-call budget is about 30 (see build()).
 */
(function () {
  'use strict';
  if (window.RuskiMiniGame) return;

  var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var THREE_SRI = 'sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu';
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  var inst = null;      // the one live instance
  var token = 0;        // guards async mount against unmount/re-mount races
  var threeLoading = null;

  /* ---------------------------------------------------------------- constants (world units: cup rim = 0.8 tall) */
  var C = {
    G: 18,                       // floaty gravity so arcs read clearly on a small hero
    BR: 0.14,                    // ball radius
    RIM: 0.8, RIM_R: 0.4, BASE_R: 0.27, TUBE: 0.02,
    E_TABLE: 0.6, E_RIM: 0.45, E_WALL: 0.4,
    TABLE_W: 4.4, Z_NEAR: 4.4, Z_FAR: -5.2,
    ORIGIN: { x: 0, y: 0.75, z: 3.6 },
    ELEV: 40 * Math.PI / 180, MAX_YAW: 0.3, R_MIN: 3.5, R_MAX: 12.5,
    SPACING: 0.86, ROW_Z0: -4.3, ROW_DZ: 0.745,
    DT: 1 / 120, MIN_PULL: 14
  };
  var MIRROR = C.Z_NEAR + C.Z_FAR;                      // z' = MIRROR - z flips the far half of the table onto the near half
  C.ORIGIN = { x: 0, y: 0.75, z: 4.9 };                 // you throw from just behind your own rack
  var CPU_ORIGIN = { x: 1.55, y: 1.35, z: -5.75 };      // the little guy's throwing hand
  var CPU_P = 0.28;
  var REC_KEY = 'ruski.minigame.record';
  /* the little guy stands behind the far right corner of the table so he never overlaps the HUD and cups never hide him */
  var FIG = { x: 2.05, y: 0.15, z: -6.0, s: 1.2 };

  /* ---------------------------------------------------------------- helpers */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function coneR(y) { return C.BASE_R + (C.RIM_R - C.BASE_R) * clamp(y / C.RIM, 0, 1); }

  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (threeLoading) return threeLoading;
    threeLoading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = THREE_URL; s.async = true; s.crossOrigin = 'anonymous';
      s.integrity = THREE_SRI;   // exact file, pinned (cdnjs r128)
      s.onload = function () { window.THREE ? res(window.THREE) : rej(new Error('THREE missing after load')); };
      s.onerror = function () { threeLoading = null; rej(new Error('three.js failed to load')); };
      document.head.appendChild(s);
    });
    return threeLoading;
  }

  function ensureCss(opts) {
    if (opts.css === false || !SCRIPT_SRC || document.querySelector('link[data-rmg-css]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.setAttribute('data-rmg-css', '');
    l.href = SCRIPT_SRC.replace(/minigame\.js(\?.*)?$/, 'minigame.css');
    document.head.appendChild(l);
  }

  /* first CSS variable that holds a valid colour wins */
  var COLOR_RE = /^(#[0-9a-f]{3,8}|rgb\(|hsl\()/i;
  function tokenColor(host, override, names, fallback) {
    if (override && COLOR_RE.test(override)) return override;
    var cs = getComputedStyle(host);
    for (var i = 0; i < names.length; i++) {
      var v = cs.getPropertyValue(names[i]).trim();
      if (v && COLOR_RE.test(v)) return v;
    }
    return fallback;
  }


  /* rack formations. kind: 'full' 4-3-2-1, 'tri6' 3-2-1, 'stop3' stoplight (a straight line pointing at the shooter), 'ot3' 2-1 */
  function slots(side, kind) {
    var out = [], rows = { full: [4, 3, 2, 1], tri6: [3, 2, 1], ot3: [2, 1] }[kind];
    if (kind === 'stop3') for (var i = 0; i < 3; i++) out.push({ x: 0, z: C.ROW_Z0 + i * C.SPACING });
    else rows.forEach(function (cnt, r) {
      for (var k = 0; k < cnt; k++) out.push({ x: (k - (cnt - 1) / 2) * C.SPACING, z: C.ROW_Z0 + r * C.ROW_DZ });
    });
    if (side === 'me') out.forEach(function (p) { p.x = -p.x; p.z = MIRROR - p.z; });
    return out;
  }
  function placeCup(c) {
    c.mesh.position.set(c.x, 0, c.z);
    c.shadow.position.set(c.x + 0.05, 0.004, c.z + 0.05);
  }
  function other(side) { return side === 'me' ? 'cpu' : 'me'; }

  /* ---------------------------------------------------------------- build DOM + scene */
  function build(T, host, opts) {
    var P = opts.palette || {};
    var colors = {
      cup: tokenColor(host, P.cup, ['--rmg-cup', '--solo'], '#C8262E'),
      rim: tokenColor(host, P.rim, ['--rmg-rim', '--solo-rim'], '#F6F3EC'),
      beer: tokenColor(host, P.beer, ['--rmg-beer', '--lager'], '#D8A23A'),
      ball: tokenColor(host, P.ball, ['--rmg-ball', '--solo-rim'], '#F3EFE6'),
      table: tokenColor(host, P.table, ['--rmg-table'], '#F4F5F2'),
      edge: tokenColor(host, P.edge, ['--rmg-edge'], '#BFC4BC'),
      decal: tokenColor(host, P.decal, ['--rmg-decal'], '#1FA34A'),
      figure: tokenColor(host, P.figure, ['--rmg-figure'], '#9DB0A6'),   // neutral toy/mannequin grey-green, never a skin tone
      shirt: tokenColor(host, P.shirt, ['--rmg-shirt'], '#F4F4EF'),
      bg: tokenColor(host, P.bg, ['--rmg-bg', '--bilge'], '#0A181E'),
      yack: tokenColor(host, P.yack, ['--rmg-yack', '--yack'], '#8C8A3E')
    };

    var renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(new T.Color(colors.bg), 1);
    var canvas = renderer.domElement;
    canvas.className = 'rmg-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    var scene = new T.Scene();
    var cam = new T.PerspectiveCamera(40, 2, 0.1, 60);
    scene.add(new T.AmbientLight(0xdfe6e2, 0.55));
    var bulb = new T.PointLight(0xfff0d0, 0.75, 30); bulb.position.set(0, 5.4, -0.5); scene.add(bulb);
    var bulbMesh = new T.Mesh(new T.SphereGeometry(0.14, 8, 6), new T.MeshBasicMaterial({ color: 0xfff1c9 }));
    bulbMesh.position.copy(bulb.position); scene.add(bulbMesh);                                    // 1 draw

    var tableColor = new T.Color(colors.table);
    var tableLen = C.Z_NEAR - C.Z_FAR;
    var table = new T.Mesh(new T.BoxGeometry(C.TABLE_W, 0.3, tableLen), new T.MeshLambertMaterial({ color: tableColor, emissive: tableColor.clone().multiplyScalar(0.55) }));
    table.position.set(0, -0.15, (C.Z_NEAR + C.Z_FAR) / 2); scene.add(table);                    // 1 draw
    var edge = new T.Mesh(new T.BoxGeometry(C.TABLE_W + 0.2, 0.12, tableLen + 0.2),
      new T.MeshLambertMaterial({ color: colors.edge ? new T.Color(colors.edge) : tableColor.clone().multiplyScalar(0.55) }));
    edge.position.set(0, -0.36, (C.Z_NEAR + C.Z_FAR) / 2); scene.add(edge);                        // 1 draw

    /* soft dot texture shared by shadows, splash, aim dots */
    var dc = document.createElement('canvas'); dc.width = dc.height = 64;
    var dx = dc.getContext('2d'), gr = dx.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    dx.fillStyle = gr; dx.fillRect(0, 0, 64, 64);
    var dotTex = new T.CanvasTexture(dc);
    var sc = document.createElement('canvas'); sc.width = sc.height = 64;
    var sx = sc.getContext('2d'), sg = sx.createRadialGradient(32, 32, 4, 32, 32, 32);
    sg.addColorStop(0, 'rgba(0,0,0,.7)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    sx.fillStyle = sg; sx.fillRect(0, 0, 64, 64);
    var shTex = new T.CanvasTexture(sc);
    var shMat = new T.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false });
    var shGeo = new T.PlaneGeometry(1.15, 1.15);

    /* cup = ONE lathe mesh with vertex colours (red body, white rim, beer surface) */
    var prof = [[0, 0, 0], [.27, 0, 0], [.395, .74, 0], [.4, .76, 1], [.4, .8, 1], [.37, .8, 1], [.367, .76, 1],
      [.365, .72, 0], [.345, .62, 0], [.345, .62, 2], [0, .62, 2]];
    var cupGeo = new T.LatheGeometry(prof.map(function (p) { return new T.Vector2(p[0], p[1]); }), 14);
    var cc = [new T.Color(colors.cup), new T.Color(colors.rim), new T.Color(colors.beer)];
    var n = cupGeo.attributes.position.count, colArr = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { var c = cc[prof[i % prof.length][2]]; colArr[i * 3] = c.r; colArr[i * 3 + 1] = c.g; colArr[i * 3 + 2] = c.b; }
    cupGeo.setAttribute('color', new T.BufferAttribute(colArr, 3));
    var cupMat = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
    var ringGeo = new T.RingGeometry(0.22, 0.44, 14);
    var ringMat = new T.MeshBasicMaterial({ color: new T.Color(colors.beer), transparent: true, opacity: 0.3, side: T.DoubleSide, depthWrite: false });

    /* 10 cups a side: 'cpu' is the far rack (you shoot at it), 'me' is the near rack (the CPU shoots at it) */
    var cups = [];
    ['cpu', 'me'].forEach(function (side) {
      slots(side, 'full').forEach(function (p) {
        var grp = new T.Mesh(cupGeo, cupMat); scene.add(grp);
        var sh = new T.Mesh(shGeo, shMat); sh.rotation.x = -Math.PI / 2; scene.add(sh);
        var ring = new T.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
        var c = { side: side, x: p.x, z: p.z, tx: p.x, tz: p.z, mesh: grp, shadow: sh, ring: ring, state: 'up', t: 0, wob: 0 };
        placeCup(c); cups.push(c);
      });
    });                                                                                             // <= 40 draws with both racks up

    var ballMesh = new T.Mesh(new T.SphereGeometry(C.BR, 12, 9), new T.MeshLambertMaterial({ color: new T.Color(colors.ball), emissive: new T.Color(colors.ball), emissiveIntensity: 0.5 }));
    var outMat = new T.MeshBasicMaterial({ color: new T.Color(colors.decal).multiplyScalar(0.35), side: T.BackSide });   // dark outline so a white ball reads on the white table
    var outline = new T.Mesh(ballMesh.geometry, outMat); outline.scale.setScalar(1.22); ballMesh.add(outline);
    scene.add(ballMesh);                                                                            // 1 draw
    var ballShadow = new T.Mesh(new T.PlaneGeometry(0.6, 0.6), shMat); ballShadow.rotation.x = -Math.PI / 2; ballShadow.position.y = 0.008; scene.add(ballShadow); // 1 draw

    /* green "F" decal (Fisher) on the table between throw line and rack: one textured plane, 1 draw */
    var fam = getComputedStyle(host).getPropertyValue('--f-display').trim();
    var fc = document.createElement('canvas'); fc.width = fc.height = 256;
    var fx = fc.getContext('2d');
    fx.fillStyle = colors.decal; fx.textAlign = 'center'; fx.textBaseline = 'middle';
    fx.font = '900 230px ' + (fam ? fam + ',' : '') + "Impact,'Arial Black',sans-serif";
    fx.fillText('F', 128, 138);
    var fTex = new T.CanvasTexture(fc);
    var fMat = new T.MeshBasicMaterial({ map: fTex, transparent: true, opacity: 0.92, depthWrite: false });
    var fGeo = new T.PlaneGeometry(1.7, 1.7);
    var decal = new T.Mesh(fGeo, fMat); decal.rotation.x = -Math.PI / 2; decal.position.set(0, 0.005, MIRROR / 2); scene.add(decal);

    /* little guy behind the rack: primitives only, ~9 draws. Neutral grey-green head/hands, white tee, no hair. */
    var shirtMat = new T.MeshLambertMaterial({ color: new T.Color(colors.shirt) });
    var toyMat = new T.MeshLambertMaterial({ color: new T.Color(colors.figure) });
    var dotMat = new T.MeshBasicMaterial({ color: new T.Color(colors.bg) });
    var figGeo = {
      torso: new T.CylinderGeometry(0.42, 0.36, 1.5, 12), head: new T.SphereGeometry(0.3, 14, 10),
      arm: new T.CylinderGeometry(0.1, 0.09, 0.62, 8), hand: new T.SphereGeometry(0.11, 8, 6), eye: new T.SphereGeometry(0.035, 6, 4)
    };
    var fig = new T.Group(); fig.position.set(FIG.x, FIG.y, FIG.z); fig.scale.setScalar(FIG.s); scene.add(fig);
    var torso = new T.Mesh(figGeo.torso, shirtMat); torso.position.y = 0.35; fig.add(torso);
    var headG = new T.Group(); headG.position.set(0, 1.12, 0); fig.add(headG);          // pivots at the neck
    var head = new T.Mesh(figGeo.head, toyMat); head.position.y = 0.36; headG.add(head);
    [-0.11, 0.11].forEach(function (ex) { var e = new T.Mesh(figGeo.eye, dotMat); e.position.set(ex, 0.4, 0.27); headG.add(e); });
    function makeArm(x) {
      var g = new T.Group(); g.position.set(x, 0.98, 0); fig.add(g);                     // pivots at the shoulder, hangs along -y
      var a = new T.Mesh(figGeo.arm, shirtMat); a.position.y = -0.31; g.add(a);
      var h = new T.Mesh(figGeo.hand, toyMat); h.position.y = -0.68; g.add(h);
      return { g: g, hand: h };
    }
    var armR = makeArm(0.52), armL = makeArm(-0.52);
    var held = new T.Mesh(cupGeo, cupMat); held.scale.setScalar(0.55); held.position.set(0, 0, 0); held.visible = false; armR.hand.add(held);
    var figure = { root: fig, head: headG, armR: armR.g, armL: armL.g, held: held };

    /* splash: one Points object, pooled */
    var SP = 28, spPos = new Float32Array(SP * 3), spVel = new Float32Array(SP * 3), spLife = new Float32Array(SP);
    for (var s = 0; s < SP; s++) spPos[s * 3 + 1] = -10;
    var spGeo = new T.BufferGeometry(); spGeo.setAttribute('position', new T.BufferAttribute(spPos, 3));
    var spMat = new T.PointsMaterial({ color: new T.Color(colors.beer), size: 0.17, map: dotTex, transparent: true, depthWrite: false, alphaTest: 0.02 });
    var splash = new T.Points(spGeo, spMat); splash.frustumCulled = false; scene.add(splash);      // 1 draw

    /* aim arc: one Points object, screen-space size */
    var AIMN = 16, aimPos = new Float32Array(AIMN * 3);
    var aimGeo = new T.BufferGeometry(); aimGeo.setAttribute('position', new T.BufferAttribute(aimPos, 3)); aimGeo.setDrawRange(0, 0);
    var aimMat = new T.PointsMaterial({ color: new T.Color(colors.decal), size: 5, sizeAttenuation: false, map: dotTex, transparent: true, opacity: 0.8, depthWrite: false, alphaTest: 0.02 });
    var aim = new T.Points(aimGeo, aimMat); aim.frustumCulled = false; aim.visible = false; scene.add(aim); // 1 draw

    /* ---- DOM overlay */
    var root = el('div', 'rmg');
    root.appendChild(canvas);
    var zone = el('div', 'rmg-zone');
    zone.tabIndex = 0; zone.setAttribute('role', 'group');
    zone.setAttribute('aria-label', 'Beer pong throw area. Drag back and release to throw. With a keyboard: left and right arrows aim, up and down arrows set power, Enter throws.');
    root.appendChild(zone);

    var hud = el('dl', 'rmg-hud'), vals = {};
    [['me', 'Your cups'], ['cpu', 'CPU cups'], ['shots', 'Shots'], ['rec', 'Record']].forEach(function (d) {
      var box = el('div', 'rmg-stat'), dt = el('dt', 'rmg-k', d[1]), dd = el('dd', 'rmg-v', '0');
      box.appendChild(dt); box.appendChild(dd); hud.appendChild(box); vals[d[0]] = dd;
    });
    root.appendChild(hud);

    if (opts.caption) {
      var cap = el('div', 'rmg-caption');
      cap.appendChild(el('div', 'rmg-cap-v', String(opts.caption.value)));
      cap.appendChild(el('div', 'rmg-cap-k', String(opts.caption.label || '')));
      root.appendChild(cap);
    }
    var coarse = false; try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) { /* ignore */ }
    var msg = el('p', 'rmg-msg', (coarse ? 'Pull back and let go' : 'Drag back and release') + '. Call Rerack at 6 and 3 cups.');
    root.appendChild(msg);
    var resetBtn = el('button', 'rmg-btn rmg-reset', "Rack 'em"); resetBtn.type = 'button';
    resetBtn.setAttribute('aria-label', "Rack 'em: restart the game");
    root.appendChild(resetBtn);
    var rerackBtn = el('button', 'rmg-btn rmg-rerack', 'Rerack'); rerackBtn.type = 'button';
    rerackBtn.setAttribute('aria-label', 'Call rerack on the CPU\'s cups');
    root.appendChild(rerackBtn);

    var over = el('div', 'rmg-over'); over.hidden = true;
    over.setAttribute('role', 'dialog'); over.setAttribute('aria-label', 'Game over');
    var overTitle = el('h3', 'rmg-over-t', 'Rack cleared'), overSub = el('p', 'rmg-over-s', '');
    var again = el('button', 'rmg-btn rmg-primary', 'Play again'); again.type = 'button';
    over.appendChild(overTitle); over.appendChild(overSub); over.appendChild(again);
    root.appendChild(over);

    var live = el('div', 'rmg-sr'); live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status');
    root.appendChild(live);

    return {
      T: T, renderer: renderer, canvas: canvas, scene: scene, cam: cam, cups: cups, ballMesh: ballMesh, ballShadow: ballShadow,
      figure: figure,
      splash: { pts: splash, geo: spGeo, pos: spPos, vel: spVel, life: spLife, n: SP, mat: spMat, beer: new T.Color(colors.beer), yack: new T.Color(colors.yack) },
      aim: { pts: aim, geo: aimGeo, pos: aimPos, n: AIMN },
      dom: { root: root, zone: zone, vals: vals, msg: msg, reset: resetBtn, rerack: rerackBtn, over: over, overSub: overSub, overTitle: overTitle, again: again, live: live },
      disposables: [cupGeo, cupMat, ringGeo, ringMat, shGeo, shMat, shTex, dotTex, spGeo, spMat, aimGeo, aimMat, table.geometry, table.material, edge.geometry, edge.material,
        ballMesh.geometry, ballMesh.material, ballShadow.geometry, bulbMesh.geometry, bulbMesh.material,
        fTex, fMat, fGeo, outMat, shirtMat, toyMat, dotMat, figGeo.torso, figGeo.head, figGeo.arm, figGeo.hand, figGeo.eye]
    };
  }

  /* ---------------------------------------------------------------- game instance */
  function Game(host, opts, parts) {
    var G = this;
    G.host = host; G.opts = opts; G.p = parts; G.T = parts.T;
    DOWN = new parts.T.Vector3(); AIM = new parts.T.Vector3();
    G.recKey = opts.storageKey || REC_KEY;
    G.rec = readRecord(G.recKey);
    G.ball = { active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, rest: 0, rim: false, touched: false, side: 'me' };
    G.drag = null; G.kb = { on: false, aim: 0, power: 0.62 };
    G.raf = 0; G.running = false; G.inView = true; G.last = 0; G.acc = 0; G.clock = 0; G.sway = 1;
    G.timers = []; G.msgTimer = 0; G.firstThrow = false; G.dirty = true;
    G.listeners = [];
    G.newGame();
  }
  var GP = Game.prototype;

  function readRecord(key) {
    try { var r = JSON.parse(localStorage.getItem(key)); if (r && r.w >= 0 && r.l >= 0) return { w: r.w | 0, l: r.l | 0 }; } catch (e) { /* ignore */ }
    return { w: 0, l: 0 };
  }
  function writeRecord(key, r) { try { localStorage.setItem(key, JSON.stringify(r)); } catch (e) { /* private mode */ } }

  GP.on = function (target, type, fn, o) { target.addEventListener(type, fn, o); this.listeners.push([target, type, fn, o]); };
  GP.later = function (fn, ms) { var G = this, id = setTimeout(function () { if (!G.dead) fn(); }, ms); G.timers.push(id); return id; };

  GP.say = function (text, sticky) {
    var G = this, m = G.p.dom.msg;
    m.textContent = text; m.classList.add('rmg-show');
    G.p.dom.live.textContent = text;
    clearTimeout(G.msgTimer);
    if (!sticky) G.msgTimer = setTimeout(function () { m.classList.remove('rmg-show'); }, 2200);
  };

  GP.upCount = function (side) { return this.p.cups.filter(function (c) { return c.side === side && c.state === 'up'; }).length; };

  GP.hud = function () {
    var G = this, v = G.p.dom.vals;
    v.me.textContent = G.upCount('me'); v.cpu.textContent = G.upCount('cpu');
    v.shots.textContent = G.side === 'me' && !G.over ? G.shotsLeft + (G.offhand ? ' lefty' : '') : '–';
    v.rec.textContent = G.rec.w + '-' + G.rec.l;
  };

  /* fresh game state + both racks back to 4-3-2-1 */
  GP.newGame = function () {
    var G = this;
    G.over = false; G.phase = 'main'; G.ot = 0; G.winner = null; G.shots = 0;
    G.stat = G.stat || { shots: 0, hits: 0 };
    G.penalty = { me: 0, cpu: 0 }; G.ginobes = { me: false, cpu: false }; G.racked = { me: {}, cpu: {} };
    G.rerackDue = null; G.galaxy = false;   // rerack you're owed on the CPU's cups but haven't called; Galaxy scatter
    G.side = 'me'; G.shotsLeft = 2; G.turnShots = 2; G.turnHits = 0; G.offhand = false; G.wait = false;
    G.chug = null; G.yack = null; G.throwPose = null;
    G.setRack('me', 'full', true); G.setRack('cpu', 'full', true);
  };

  /* put a side's cups into a formation. 'full'/'ot3' reset the rack; 'tri6'/'stop3' rerack only the standing cups */
  GP.setRack = function (side, kind, instant) {
    var G = this, pos = slots(side, kind), mine = G.p.cups.filter(function (c) { return c.side === side; });
    var fresh = kind === 'full' || kind === 'ot3';
    if (fresh) mine.forEach(function (c, i) {
      c.ring.visible = false; c.t = 0; c.wob = 0; c.mesh.scale.set(1, 1, 1); c.mesh.rotation.z = 0;
      c.state = i < pos.length ? 'up' : 'gone'; c.mesh.visible = c.shadow.visible = c.state === 'up';
    });
    var up = mine.filter(function (c) { return c.state === 'up'; });
    /* back row first on both, so cups slide the shortest way */
    var far = side === 'cpu' ? 1 : -1;
    up.sort(function (a, b) { return far * (a.z - b.z) || a.x - b.x; });
    pos.sort(function (a, b) { return far * (a.z - b.z) || a.x - b.x; });
    up.forEach(function (c, i) { c.tx = pos[i].x; c.tz = pos[i].z; if (instant) { c.x = c.tx; c.z = c.tz; placeCup(c); } });
  };

  /* hand the host this visit's shots so far, then start counting again */
  GP.flushStats = function () {
    var G = this, st = G.stat;
    if (!st || !st.shots || typeof G.opts.onStats !== 'function') return;
    G.stat = { shots: 0, hits: 0 };
    try { G.opts.onStats({ shots: st.shots, hits: st.hits }); } catch (e) { console.warn(e); }
  };

  GP.reset = function () {
    var G = this;
    G.flushStats();
    G.timers.forEach(clearTimeout); G.timers = [];
    G.newGame();
    G.p.figure.held.visible = false;
    G.ball.active = false; G.drag = null; G.kb.on = false;
    G.p.dom.over.hidden = true; G.p.dom.root.classList.remove('rmg-offhand', 'rmg-yacking');
    for (var i = 0; i < G.p.splash.n; i++) { G.p.splash.life[i] = 0; G.p.splash.pos[i * 3 + 1] = -10; }
    G.p.splash.geo.attributes.position.needsUpdate = true;
    G.hud(); G.say(G.firstThrow ? 'Racked. Your throw, 2 shots.' : G.p.dom.msg.textContent, !G.firstThrow);
    G.kick();
  };

  /* player launch velocity from normalised aim (-1..1) and power (0..1) */
  function launchVel(aim, power) {
    var yaw = aim * C.MAX_YAW, range = lerp(C.R_MIN, C.R_MAX, power);
    var v = Math.sqrt(range * C.G / Math.sin(2 * C.ELEV)), h = v * Math.cos(C.ELEV);
    return { vx: h * Math.sin(yaw), vy: v * Math.sin(C.ELEV), vz: -h * Math.cos(yaw) };
  }
  /* velocity that drops the ball onto point (tx, ty, tz) from origin o at the fixed launch angle */
  function velTo(o, tx, ty, tz) {
    var dx = tx - o.x, dz = tz - o.z, D = Math.sqrt(dx * dx + dz * dz), cs = Math.cos(C.ELEV);
    var den = 2 * cs * cs * (D * Math.tan(C.ELEV) + (o.y - ty));
    var v = Math.sqrt(C.G * D * D / Math.max(den, 1e-3));
    return { vx: v * cs * dx / D, vy: v * Math.sin(C.ELEV), vz: v * cs * dz / D };
  }

  /* is the side that's up shooting its next ball off-hand? (Ginobes; blurs the table on your shots) */
  GP.syncOffhand = function () {
    var G = this;
    G.offhand = !!G.ginobes[G.side];
    G.p.dom.root.classList.toggle('rmg-offhand', G.side === 'me' && G.offhand && !G.over);
    G.hud();
  };

  GP.canThrow = function () { var G = this; return !G.over && !G.wait && G.side === 'me' && G.shotsLeft > 0 && !G.ball.active; };

  /* put the ball in the air for `side`. dry = simulate only, returns true if it would sink */
  GP.fire = function (side, v, dry) {
    var G = this, b = G.ball, o = side === 'me' ? C.ORIGIN : CPU_ORIGIN;
    b.active = true; b.side = side; b.x = o.x; b.y = o.y; b.z = o.z;
    b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.t = 0; b.rest = 0; b.rim = false; b.touched = false; b.maxBack = 0;
    if (!dry) return true;
    var wob = G.p.cups.map(function (c) { return c.wob; });
    G.dry = true;
    for (var i = 0; i < 1000 && b.active; i++) G.step(C.DT);
    var hit = G.dry === 'sunk'; G.dry = false; b.active = false;
    G.p.cups.forEach(function (c, k) { c.wob = wob[k]; });
    return hit;
  };

  GP.throwBall = function (aim, power) {
    var G = this;
    if (!G.canThrow()) return false;
    aim = clamp(+aim || 0, -1, 1); power = clamp(+power || 0, 0, 1);
    if (G.rerackDue) { G.rerackDue = null; G.say('Didn\'t call rerack. You lose the rack.'); }
    var lefty = G.ginobes.me; G.ginobes.me = false;   // Ginobes lasts one shot
    if (lefty) { aim = clamp(aim + (Math.random() - 0.5) * 0.4, -1, 1); power = clamp(power + (Math.random() - 0.5) * 0.14, 0, 1); }   // lefty: wobbly release
    G.fire('me', launchVel(aim, power));
    G.shots++; G.shotsLeft--; G.hud();
    G.ball.counts = !lefty; G.syncOffhand();   // off-hand shots are handicapped, so they don't count toward the hit rate
    if (!G.firstThrow) { G.firstThrow = true; G.p.dom.msg.classList.remove('rmg-show'); }
    G.drag = null; G.kb.on = false; G.acc = 0;
    G.kick();
    return true;
  };

  /* test hook: would this player shot sink a cup? (no state change) */
  GP.probe = function (aim, power) {
    if (this.ball.active) return null;
    return this.fire('me', launchVel(clamp(aim, -1, 1), clamp(power, 0, 1)), true);
  };

  /* CPU picks a shot that hits or misses on purpose (decided by its hit rate), found by simulating throws at a standing cup */
  GP.cpuPickShot = function (wantHit) {
    var G = this, targets = G.p.cups.filter(function (c) { return c.side === 'me' && c.state === 'up'; }), v = null;
    for (var i = 0; i < 70; i++) {
      var c = targets[(Math.random() * targets.length) | 0], j = wantHit ? 0.05 + 0.1 * (i / 70) : 0.32 + Math.random() * 0.4;
      var a = Math.random() * 6.283, long = !wantHit && Math.random() < 0.05 ? 3.5 : 0;   // now and then a miss sails off the back: Ginobes
      v = velTo(CPU_ORIGIN, c.x + Math.cos(a) * j, C.RIM + 0.05, c.z + Math.sin(a) * j + long);
      if (G.fire('cpu', v, true) === wantHit) return v;
    }
    return v;
  };

  GP.cpuShoot = function () {
    var G = this;
    if (G.over || G.side !== 'cpu' || G.shotsLeft <= 0) return;
    if (G.chug || G.yack || G.ball.active) { G.later(function () { G.cpuShoot(); }, 300); return; }
    var rate = typeof G.opts.cpuHitRate === 'function' ? G.opts.cpuHitRate() : G.opts.cpuHitRate;   // a function so it follows live data
    var lefty = G.ginobes.cpu; G.ginobes.cpu = false; G.syncOffhand();
    var p = clamp(+rate || CPU_P, 0.05, 0.9) * (lefty ? 0.5 : 1);
    var v = G.cpuPickShot(Math.random() < p);
    G.throwPose = { t: 0 }; G.kick();
    G.later(function () { G.fire('cpu', v); G.shotsLeft--; G.hud(); G.kick(); }, reduced() ? 150 : 380);
  };

  GP.startTurn = function (side, shots, lead) {
    var G = this;
    if (G.over) return;
    G.side = side; G.turnHits = 0; G.wait = false;
    var n = shots || Math.max(1, 2 - G.penalty[side]); G.penalty[side] = 0;
    G.shotsLeft = n; G.turnShots = n;
    G.syncOffhand();
    var redo = G.phase === 'redemption', lefty = G.offhand ? ' First shot off-hand (Ginobes).' : '';
    lead = lead || '';
    if (side === 'me') G.say(redo ? 'Redemption: shoot until you miss.' : lead + 'Your turn: ' + n + (n > 1 ? ' shots.' : ' shot.') + lefty, redo);
    else { G.say(redo ? 'CPU shoots for redemption until it misses…' : lead + 'CPU\'s turn: ' + n + (n > 1 ? ' shots.' : ' shot.') + lefty); G.later(function () { G.cpuShoot(); }, 1100); }
    G.hud(); G.kick();
  };

  /* rerack the side just shot at: 3-2-1 triangle at 6 cups, stoplight at 3 (main rack only) */
  GP.maybeRerack = function (side) {
    var G = this, n = G.upCount(side);
    if (G.ot === 1) return '';
    var kind = n === 6 && !G.racked[side].tri ? 'tri6' : n === 3 && !G.racked[side].stop ? 'stop3' : null;
    if (!kind) return '';
    G.racked[side][kind === 'tri6' ? 'tri' : 'stop'] = true;
    if (side === 'cpu') { G.rerackDue = kind; return ''; }   // your call: tap Rerack before your next shot
    G.setRack(side, kind); return kind === 'tri6' ? ' CPU calls rerack: triangle.' : ' CPU calls rerack: stoplight.';
    return '';
  };

  /* the Rerack button. Owed a rerack: the CPU's cups go into formation (this also ends a Galaxy).
     Not owed one: Galaxy, the CPU's cups spread out across their end until your next real rerack. */
  GP.callRerack = function () {
    var G = this;
    if (G.over) return;
    if (G.rerackDue) {
      var kind = G.rerackDue; G.rerackDue = null; G.galaxy = false;
      G.setRack('cpu', kind);
      G.say(kind === 'tri6' ? 'Rerack: triangle.' : 'Rerack: stoplight.');
    } else {
      G.galaxy = true; G.scatter('cpu');
      G.say('Galaxy! That wasn\'t a rerack. Cups spread out until the next one.');
    }
    G.hud(); G.kick();
  };

  /* Galaxy: standing cups slide to random spots on their end of the table, never touching */
  GP.scatter = function (side) {
    var G = this, up = G.p.cups.filter(function (c) { return c.side === side && c.state === 'up'; }), placed = [];
    up.forEach(function (c) {
      var x = c.x, z = c.z;
      for (var i = 0; i < 300; i++) {
        var px = (Math.random() * 2 - 1) * 1.75, pz = -4.75 + Math.random() * 3.3;
        if (placed.every(function (q) { return (q.x - px) * (q.x - px) + (q.z - pz) * (q.z - pz) > 1.1 * 1.1; })) { x = px; z = pz; break; }
      }
      if (side === 'me') { x = -x; z = MIRROR - z; }
      placed.push({ x: side === 'me' ? -x : x, z: side === 'me' ? MIRROR - z : z });
      c.tx = x; c.tz = z;
    });
  };

  GP.endShot = function (sunkCup) {
    var G = this, b = G.ball, shooter = b.side, target = other(shooter), you = shooter === 'me';
    b.active = false; G.wait = true;
    var ginobes = !sunkCup && !b.touched && (you ? b.maxBack < C.Z_FAR : b.maxBack > C.Z_NEAR);
    if (you && b.counts) { G.stat.shots++; if (sunkCup) G.stat.hits++; }
    if (ginobes) { G.ginobes[shooter] = true; G.syncOffhand(); }

    if (G.phase === 'redemption') {
      if (sunkCup && G.upCount(target) === 0) {
        G.say(you ? 'You hit them all! Overtime.' : 'CPU redeemed every cup. Overtime.', true);
        G.later(function () { G.overtime(shooter); }, 1400);
      } else if (sunkCup) {   // redemption keeps going until a miss
        var rr = G.maybeRerack(target);
        G.shotsLeft = 1;
        G.say((you ? 'Hit! Keep shooting, ' : 'CPU hits, keeps shooting. ') + G.upCount(target) + ' left.' + rr, you);
        G.later(function () { if (shooter === 'cpu') G.cpuShoot(); else { G.wait = false; G.kick(); } }, you ? 450 : 1000);
      } else G.later(function () { G.finish(G.winner); }, 700);
      G.hud(); G.kick(); return;
    }

    var note = '';
    if (sunkCup) {
      G.turnHits++;
      if (G.upCount(target) === 0) {   // rack cleared: the other side shoots for redemption until they miss
        G.winner = shooter; G.phase = 'redemption';
        G.say(you ? 'Rack cleared! CPU shoots for redemption.' : 'CPU cleared your rack. Redemption: shoot until you miss.', true);
        G.hud(); G.later(function () { G.startTurn(target, 1); }, 1500); G.kick(); return;
      }
      note = G.maybeRerack(target);
      G.say((you ? 'Splash! ' : 'CPU hits. Drink. ') + G.upCount(target) + ' left.' + note);
    } else G.say(ginobes ? (you ? 'Ginobes! Off the back. Lefty next shot.' : 'CPU Ginobes! Off-hand next shot.') : (b.rim ? 'Rim out.' : (you ? 'Miss.' : 'CPU misses.')));

    G.hud(); G.kick();
    if (G.shotsLeft > 0) { G.later(function () { if (shooter === 'cpu') G.cpuShoot(); else { G.wait = false; G.kick(); } }, you ? 450 : 900); return; }

    /* turn over. Two hits in one turn: balls back, and the other side yacks and loses a shot next turn */
    if (G.turnHits >= 2 && G.turnShots >= 2) {
      G.penalty[target] = 1;
      G.later(function () { G.doYack(target); }, 700);
      G.later(function () { G.startTurn(shooter, 2, 'Balls back! '); }, 2600);
      return;
    }
    G.later(function () { G.startTurn(target); }, 1200);
  };

  GP.doYack = function (side) {
    var G = this;
    if (side === 'cpu') { G.yack = { t: 0, spewed: false, dur: reduced() ? 1.2 : 2.0 }; G.say('Two in a row! CPU yacks and loses a shot.'); }
    else {
      var r = G.p.dom.root; r.classList.remove('rmg-yacking'); void r.offsetWidth; r.classList.add('rmg-yacking');
      G.later(function () { r.classList.remove('rmg-yacking'); }, 1700);
      G.say('CPU hit two in a row. You yack and lose a shot.');
    }
    G.kick();
  };

  GP.overtime = function (redeemer) {
    var G = this;
    G.ot++; G.phase = 'main'; G.winner = null; G.racked = { me: {}, cpu: {} }; G.rerackDue = null; G.galaxy = false;
    var kind = G.ot === 1 ? 'ot3' : 'full';   // overtime is 3 cups a side, double overtime is a full rack again
    G.setRack('me', kind, true); G.setRack('cpu', kind, true);
    G.say(G.ot === 1 ? 'Overtime: 3 cups each.' : 'Double overtime: full rack.');
    G.later(function () { G.startTurn(redeemer); }, 1300);
    G.hud(); G.kick();
  };

  GP.finish = function (winner) {
    var G = this, won = winner === 'me';
    G.over = true; G.phase = 'over'; G.wait = true;
    G.p.dom.root.classList.remove('rmg-offhand');
    if (won) G.rec.w++; else G.rec.l++;
    writeRecord(G.recKey, G.rec);
    G.hud();
    G.say(won ? 'You beat the CPU!' : 'CPU wins.', true);
    G.later(function () {
      var d = G.p.dom;
      d.overTitle.textContent = won ? 'You beat the CPU' : 'CPU wins';
      d.overSub.textContent = 'Record ' + G.rec.w + '-' + G.rec.l + (won ? '. Nobody tell the CPU.' : '. Run it back.');
      d.over.hidden = false; d.again.focus({ preventScroll: true });
      G.kick();
    }, 900);
    G.flushStats();
    if (typeof G.opts.onGameOver === 'function') { try { G.opts.onGameOver({ won: won, record: { w: G.rec.w, l: G.rec.l }, shots: G.shots }); } catch (e) { console.warn(e); } }
  };

  /* the little guy grabs a cup and chugs it: lift, hold, lower, then wipe (or cheer on the last cup) */
  GP.startChug = function () {
    var G = this, red = reduced(), last = G.upCount('cpu') === 0;
    G.p.figure.held.visible = true;
    G.chug = { t: 0, red: red, dur: red ? 1.3 : 3.0, kind: last ? 'cheer' : 'wipe' };
    G.kick();
  };

  var DOWN = null, AIM = null;
  function ss(a, b, t) { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  GP.poseFigure = function (dt) {
    var G = this, F = G.p.figure, ch = G.chug, rt = 0.05, lt = 0.05, tilt = 0, lift = 0, cupOn = false, wave = 0, m = 0, lean = 0;
    var idle = reduced() ? 0 : 1;
    if (ch) {
      ch.t += dt; var t = ch.t;
      if (ch.red) {   // shorter, simpler
        var rd = 1 - ss(1.05, 1.3, t);
        rt = 0.05 + 0.9 * ss(0, 0.2, t) * rd; m = ss(0.1, 0.3, t) * rd; tilt = -0.6 * m; cupOn = t < 1.25;
        if (t >= ch.dur) ch = G.chug = null;
      } else {
        var dn = 1 - ss(1.85, 2.25, t);
        rt = 0.05 + 0.9 * ss(0, 0.35, t) * dn; m = ss(0.35, 0.75, t) * dn;
        tilt = -0.65 * m - 0.05 * Math.sin(t * 13) * ss(0.8, 1, t) * dn;
        cupOn = t < 2.2;
        var g = ss(2.3, 2.5, t) * (1 - ss(2.85, 3.0, t));
        if (ch.kind === 'cheer') { lt = 0.05 + 2.9 * g; rt = Math.max(rt, 0.05 + 2.9 * g); m = m * (1 - g); lift = Math.abs(Math.sin((t - 2.3) * 9)) * 0.12 * g; }
        else { lt = 0.05 + 2.3 * g; wave = Math.sin(t * 22) * 0.35 * g; }
        if (t >= ch.dur) ch = G.chug = null;
      }
    }
    /* throw: wind up overhead, snap forward */
    var tp = G.throwPose;
    if (tp && !ch) {
      tp.t += dt;
      rt = 0.05 + 2.5 * ss(0, 0.28, tp.t) - 1.6 * ss(0.3, 0.45, tp.t) - 0.85 * ss(0.5, 0.9, tp.t);
      if (tp.t > 0.95) G.throwPose = null;
    }
    /* yack: double over, hands to stomach, spew toward the floor */
    var yk = G.yack;
    if (yk) {
      yk.t += dt; var y = ss(0, 0.35, yk.t) * (1 - ss(yk.dur - 0.4, yk.dur, yk.t));
      lean = 0.5 * y; tilt = Math.max(tilt, 0.45 * y); rt = Math.max(rt, 0.7 * y); lt = Math.max(lt, 0.7 * y);
      if (!yk.spewed && yk.t > 0.45) { yk.spewed = true; G.emitYack(); }
      if (yk.t >= yk.dur) G.yack = null;
    }
    if (!cupOn) F.held.visible = false;
    var sway = idle * Math.sin(G.clock * 1.3);
    /* right arm: blend from a forward swing (angle rt) to pointing shoulder->mouth (m = 1) */
    var a = rt + idle * 0.03 * sway, dx = -0.52 * m, dy = -Math.cos(a) * (1 - m) + 0.5 * m, dz = Math.sin(a) * (1 - m) + 0.3 * m, dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    F.armR.quaternion.setFromUnitVectors(DOWN.set(0, -1, 0), AIM.set(dx / dl, dy / dl, dz / dl));
    F.held.position.y = -0.44 * m;
    F.armL.rotation.x = -(lt - idle * 0.03 * sway);
    F.armL.rotation.z = -0.08 + wave;
    F.head.rotation.x = tilt + idle * 0.02 * Math.sin(G.clock * 0.9);
    F.root.rotation.x = lean;
    F.root.rotation.z = idle * 0.025 * Math.sin(G.clock * 0.8);
    F.root.scale.y = FIG.s * (1 + idle * 0.012 * Math.sin(G.clock * 2.2));
    F.root.position.y = FIG.y + lift;
  };

  GP.emitSplash = function (x, z) {
    var S = this.p.splash;
    S.mat.color.copy(S.beer);
    for (var i = 0; i < S.n; i++) {
      var a = Math.random() * 6.283, sp = 0.4 + Math.random() * 1.1;
      S.pos[i * 3] = x + Math.cos(a) * 0.12; S.pos[i * 3 + 1] = C.RIM + 0.05; S.pos[i * 3 + 2] = z + Math.sin(a) * 0.12;
      S.vel[i * 3] = Math.cos(a) * sp; S.vel[i * 3 + 1] = 3 + Math.random() * 3.2; S.vel[i * 3 + 2] = Math.sin(a) * sp;
      S.life[i] = 0.55 + Math.random() * 0.35;
    }
  };
  /* same pooled particles, yack-coloured, pouring from the little guy's mouth to the floor */
  GP.emitYack = function () {
    var S = this.p.splash, hx = FIG.x, hy = FIG.y + 1.75 * FIG.s, hz = FIG.z + 0.45;
    S.mat.color.copy(S.yack);
    for (var i = 0; i < S.n; i++) {
      S.pos[i * 3] = hx + (Math.random() - 0.5) * 0.12; S.pos[i * 3 + 1] = hy - Math.random() * 0.2; S.pos[i * 3 + 2] = hz;
      S.vel[i * 3] = (Math.random() - 0.5) * 0.7; S.vel[i * 3 + 1] = 0.6 + Math.random() * 1.2; S.vel[i * 3 + 2] = 0.5 + Math.random() * 1.1;
      S.life[i] = 0.7 + Math.random() * 0.6;
    }
    this.kick();
  };

  /* one fixed physics step. The ball only interacts with the rack it was thrown at. */
  GP.step = function (dt) {
    var G = this, b = G.ball;
    if (!b.active) return;
    b.t += dt;
    b.vy -= C.G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.maxBack = b.side === 'me' ? Math.min(b.maxBack || 0, b.z) : Math.max(b.maxBack || 0, b.z);
    var target = other(b.side);

    var cups = G.p.cups;
    for (var i = 0; i < cups.length; i++) {
      var c = cups[i]; if (c.state !== 'up' || c.side !== target) continue;
      var dx = b.x - c.x, dz = b.z - c.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > 1.0 || b.y > C.RIM + C.BR + 0.1) continue;
      var ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0;

      /* rim: torus tube, solved in the (radial, y) plane */
      var qx = d - C.RIM_R, qy = b.y - C.RIM, q = Math.sqrt(qx * qx + qy * qy), min = C.BR + C.TUBE;
      if (q < min && q > 1e-5) {
        var nh = qx / q, ny = qy / q, nx = nh * ux, nz = nh * uz;
        b.x += nx * (min - q); b.y += ny * (min - q); b.z += nz * (min - q);
        var vn = b.vx * nx + b.vy * ny + b.vz * nz;
        if (vn < 0) { var k = (1 + C.E_RIM) * vn; b.vx -= k * nx; b.vy -= k * ny; b.vz -= k * nz; c.wob = 1; b.rim = true; b.touched = true; }
        dx = b.x - c.x; dz = b.z - c.z; d = Math.sqrt(dx * dx + dz * dz);
        ux = d > 1e-4 ? dx / d : 1; uz = d > 1e-4 ? dz / d : 0;
      }
      /* cone wall: outside bounces off, inside (center under the opening) is a sink */
      if (b.y < C.RIM) {
        var r = coneR(b.y);
        if (d >= r - 0.02) {
          if (d < r + C.BR) {
            b.x = c.x + ux * (r + C.BR); b.z = c.z + uz * (r + C.BR);
            var vr = b.vx * ux + b.vz * uz;
            if (vr < 0) { b.vx -= (1 + C.E_WALL) * vr * ux; b.vz -= (1 + C.E_WALL) * vr * uz; c.wob = 1; b.touched = true; }
          }
        } else if (b.y > 0.05) {
          if (G.dry) { G.dry = 'sunk'; b.active = false; return; }
          c.state = 'sinking'; c.t = 0;
          c.ring.position.set(c.x, 0.006, c.z);
          if (c.side === 'cpu') G.startChug();
          G.emitSplash(c.x, c.z);
          b.active = false;
          G.endShot(true);
          return;
        }
      }
    }

    /* table */
    var onTable = Math.abs(b.x) <= C.TABLE_W / 2 + 0.02 && b.z <= C.Z_NEAR && b.z >= C.Z_FAR;
    if (onTable && b.y < C.BR && b.vy < 0) {
      b.y = C.BR; b.vy = -b.vy * C.E_TABLE; if (b.vy < 1.2) b.vy = 0;
      b.vx *= 0.92; b.vz *= 0.92; b.touched = true;
    }
    if (onTable && b.y <= C.BR + 0.002 && b.vy === 0) {
      var f = Math.max(0, 1 - 1.4 * dt); b.vx *= f; b.vz *= f;
      b.rest = (b.vx * b.vx + b.vz * b.vz) < 0.09 ? b.rest + dt : 0;
    }
    if (b.y < -2.5 || b.t > 6 || b.rest > 0.35) { if (G.dry) { b.active = false; return; } G.endShot(false); }
  };

  /* aim state -> {aim, power} or null */
  GP.aimState = function () {
    var G = this;
    if (!G.canThrow()) return null;
    if (G.drag && G.drag.armed) return { aim: G.drag.aim, power: G.drag.power };
    if (G.kb.on) return { aim: G.kb.aim, power: G.kb.power };
    return null;
  };

  GP.needsAnim = function () {
    var G = this;
    if (G.ball.active || G.drag || G.kb.on || G.chug || G.yack || G.throwPose) return true;
    var i, S = G.p.splash;
    for (i = 0; i < S.n; i++) if (S.life[i] > 0) return true;
    for (i = 0; i < G.p.cups.length; i++) {
      var c = G.p.cups[i];
      if (c.state === 'sinking' || c.wob > 0.01 || Math.abs(c.tx - c.x) + Math.abs(c.tz - c.z) > 0.002) return true;
    }
    return false;
  };

  GP.animate = function (dt) {
    var G = this, cups = G.p.cups, i;
    G.clock += dt;
    var slide = reduced() ? 1 : Math.min(1, dt * 9);
    for (i = 0; i < cups.length; i++) {
      var c = cups[i];
      if (c.state === 'up' && Math.abs(c.tx - c.x) + Math.abs(c.tz - c.z) > 0.002) {   // rerack slide
        c.x += (c.tx - c.x) * slide; c.z += (c.tz - c.z) * slide; placeCup(c);
      }
      if (c.state === 'sinking') {
        c.t += dt; var k = Math.min(1, c.t / 0.4), e = k * k;
        c.mesh.scale.set(1 - 0.4 * e, 1 - e, 1 - 0.4 * e); c.mesh.rotation.z = 0;
        if (k >= 1) { c.state = 'gone'; c.mesh.visible = false; c.shadow.visible = false; c.ring.visible = true; }
      } else if (c.wob > 0.01) {
        c.wob *= Math.pow(0.02, dt); c.mesh.rotation.z = Math.sin(G.clock * 34) * 0.07 * c.wob;
        if (c.wob <= 0.01) { c.wob = 0; c.mesh.rotation.z = 0; }
      }
    }
    G.poseFigure(dt);
    var S = G.p.splash, live = false;
    for (i = 0; i < S.n; i++) {
      if (S.life[i] > 0) {
        S.life[i] -= dt; S.vel[i * 3 + 1] -= 12 * dt;
        S.pos[i * 3] += S.vel[i * 3] * dt; S.pos[i * 3 + 1] += S.vel[i * 3 + 1] * dt; S.pos[i * 3 + 2] += S.vel[i * 3 + 2] * dt;
        if (S.life[i] <= 0) S.pos[i * 3 + 1] = -10; else live = true;
      }
    }
    if (live || G.splashWasLive) S.geo.attributes.position.needsUpdate = true;
    G.splashWasLive = live;

    /* camera: high enough to see both racks; gentle sway, eased out while aiming or throwing; none when reduced motion */
    var still = reduced() || G.ball.active || G.drag || G.kb.on;
    G.sway += ((still ? 0 : 1) - G.sway) * Math.min(1, dt * 4);
    var sw = reduced() ? 0 : Math.sin(G.clock * 0.5) * 0.32 * G.sway;
    G.p.cam.position.set(sw, 5.6, 9.4); G.p.cam.lookAt(sw * 0.3, 0, -0.6);

    /* ball + shadow. Between your throws it sits in your hand; on the CPU's turn it's hidden until he throws */
    var b = G.ball, bm = G.p.ballMesh, bs = G.p.ballShadow, a = G.aimState();
    if (b.active) { bm.position.set(b.x, b.y, b.z); bm.visible = true; }
    else {
      var pull = G.drag && G.drag.armed ? G.drag.power : (G.kb.on ? G.kb.power : 0);
      bm.position.set(C.ORIGIN.x, C.ORIGIN.y - 0.25 * pull, C.ORIGIN.z + 0.4 * pull);
      bm.visible = G.canThrow();
    }
    bs.visible = bm.visible && bm.position.z < C.Z_NEAR && bm.position.z > C.Z_FAR && Math.abs(bm.position.x) < C.TABLE_W / 2 && bm.position.y > 0;
    bs.position.x = bm.position.x; bs.position.z = bm.position.z; bs.scale.setScalar(1 / (1 + Math.max(0, bm.position.y - C.BR) * 0.5));

    /* aim arc (hidden when shooting lefty: you're on your own) */
    var A = G.p.aim;
    if (a && !G.offhand) {
      var v = launchVel(a.aim, a.power), y0 = C.ORIGIN.y, T = (v.vy + Math.sqrt(v.vy * v.vy + 2 * C.G * (y0 - C.BR))) / C.G, Tshow = T * 0.72;
      for (i = 0; i < A.n; i++) {
        var t = 0.05 + (Tshow - 0.05) * (i / (A.n - 1));
        A.pos[i * 3] = C.ORIGIN.x + v.vx * t; A.pos[i * 3 + 1] = y0 + v.vy * t - 0.5 * C.G * t * t; A.pos[i * 3 + 2] = C.ORIGIN.z + v.vz * t;
      }
      A.geo.attributes.position.needsUpdate = true; A.geo.setDrawRange(0, A.n); A.pts.visible = true;
    } else A.pts.visible = false;
  };

  GP.frame = function (now) {
    var G = this; G.raf = 0;
    if (!G.running) return;
    var dt = G.last ? Math.min(0.05, (now - G.last) / 1000) : 1 / 60; G.last = now;
    G.acc += dt; var n = 0;
    while (G.acc >= C.DT && n++ < 10) { G.step(C.DT); G.acc -= C.DT; }
    G.animate(dt);
    G.p.renderer.render(G.p.scene, G.p.cam);
    G.dirty = false;
    if (G.needsAnim() || !reduced()) G.raf = requestAnimationFrame(G.frameBound);
    else G.last = 0;
  };

  GP.kick = function () {
    var G = this;
    G.dirty = true;
    if (G.running && !G.raf) G.raf = requestAnimationFrame(G.frameBound);
  };

  GP.setRunning = function () {
    var G = this, run = G.inView && !document.hidden;
    if (run === G.running) return;
    G.running = run;
    if (run) { G.last = 0; G.kick(); }
    else if (G.raf) { cancelAnimationFrame(G.raf); G.raf = 0; }
  };

  GP.resize = function () {
    var G = this, w = G.host.clientWidth, h = G.host.clientHeight;
    if (!w || !h) return;
    var asp = w / h;
    G.p.renderer.setSize(w, h, false);
    G.p.cam.aspect = asp;
    G.p.cam.fov = clamp(44 * (1.5 / asp), 44, 76);   // widen on narrow heroes so neither rack crops
    G.p.cam.updateProjectionMatrix();
    G.kick();
  };

  /* ---------------------------------------------------------------- input */
  GP.bindInput = function () {
    var G = this, z = G.p.dom.zone;
    function maxPull() { return clamp(z.clientHeight * 0.8, 80, 150); }
    function update(d, e) {
      d.x = e.clientX; d.y = e.clientY;
      var mp = maxPull(), pull = d.y - d.y0;
      d.armed = pull > C.MIN_PULL;
      d.power = clamp(pull / mp, 0, 1);
      d.aim = clamp((d.x0 - d.x) / (mp * 0.8), -1, 1);
    }
    G.on(z, 'pointerdown', function (e) {
      if (!G.canThrow() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      try { z.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      G.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, armed: false, aim: 0, power: 0 };
      G.kb.on = false; e.preventDefault(); G.kick();
    });
    G.on(z, 'pointermove', function (e) {
      if (!G.drag || e.pointerId !== G.drag.id) return;
      update(G.drag, e); e.preventDefault(); G.kick();
    });
    function release(e, cancel) {
      if (!G.drag || e.pointerId !== G.drag.id) return;
      var d = G.drag; update(d, e);
      try { z.releasePointerCapture(d.id); } catch (err) { /* ignore */ }
      G.drag = null;
      if (!cancel && d.armed) G.throwBall(d.aim, d.power); else G.kick();
    }
    G.on(z, 'pointerup', function (e) { release(e, false); });
    G.on(z, 'pointercancel', function (e) { release(e, true); });
    G.on(z, 'contextmenu', function (e) { e.preventDefault(); });

    G.on(z, 'keydown', function (e) {
      if (!G.canThrow()) return;
      var k = G.kb, used = true;
      if (e.key === 'ArrowLeft') { k.aim = clamp(k.aim - 0.08, -1, 1); k.on = true; }
      else if (e.key === 'ArrowRight') { k.aim = clamp(k.aim + 0.08, -1, 1); k.on = true; }
      else if (e.key === 'ArrowUp') { k.power = clamp(k.power + 0.04, 0.1, 1); k.on = true; }
      else if (e.key === 'ArrowDown') { k.power = clamp(k.power - 0.04, 0.1, 1); k.on = true; }
      else if (e.key === 'Enter' || e.key === ' ') { if (k.on) G.throwBall(k.aim, k.power); else { k.on = true; } }
      else if (e.key === 'Escape') { k.on = false; }
      else used = false;
      if (used) { e.preventDefault(); G.kick(); }
    });
    G.on(z, 'blur', function () { G.kb.on = false; G.kick(); });

    G.on(G.p.dom.reset, 'click', function () { G.reset(); });
    G.on(G.p.dom.rerack, 'click', function () { G.callRerack(); });
    G.on(G.p.dom.again, 'click', function () { G.reset(); z.focus({ preventScroll: true }); });
  };

  /* ---------------------------------------------------------------- lifecycle */
  GP.start = function () {
    var G = this, d = G.p.dom;
    G.frameBound = function (t) { G.frame(t); };
    G.host.classList.add('rmg-host', 'rmg-on');
    G.host.appendChild(d.root);
    G.bindInput();
    G.ro = new ResizeObserver(function () { G.resize(); }); G.ro.observe(G.host);
    G.io = new IntersectionObserver(function (es) { G.inView = es[0].isIntersecting; G.setRunning(); }, { threshold: 0.05 });
    G.io.observe(G.host);
    G.on(document, 'visibilitychange', function () { G.setRunning(); });
    /* live reduced-motion toggle */
    try {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      var h = function () { G.kick(); };
      if (mq.addEventListener) { mq.addEventListener('change', h); G.listeners.push([mq, 'change', h]); }
    } catch (e) { /* ignore */ }
    G.hud(); G.resize(); G.running = false; G.setRunning();
    G.p.dom.msg.classList.add('rmg-show');
  };

  GP.destroy = function () {
    var G = this;
    G.flushStats();
    G.running = false; G.dead = true;
    if (G.raf) cancelAnimationFrame(G.raf); G.raf = 0;
    G.timers.forEach(clearTimeout); clearTimeout(G.msgTimer);
    if (G.ro) G.ro.disconnect(); if (G.io) G.io.disconnect();
    G.listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
    G.listeners = [];
    G.p.disposables.forEach(function (o) { try { o.dispose(); } catch (e) { /* ignore */ } });
    try { G.p.renderer.dispose(); G.p.renderer.forceContextLoss(); } catch (e) { /* ignore */ }
    if (G.p.dom.root.parentNode) G.p.dom.root.parentNode.removeChild(G.p.dom.root);
    G.host.classList.remove('rmg-on');   // rmg-host stays: harmless, keeps position:relative
  };

  /* ---------------------------------------------------------------- public API */
  function unmount() { if (inst) { inst.destroy(); inst = null; } token++; }

  function mount(host, opts) {
    opts = opts || {};
    if (!host || !host.appendChild) return Promise.resolve(false);
    unmount();
    var my = ++token;
    ensureCss(opts);
    return loadThree().then(function (T) {
      if (my !== token) return false;   // unmounted while loading
      var parts;
      try { parts = build(T, host, opts); }
      catch (err) { throw err; }
      inst = new Game(host, opts, parts);
      inst.start();
      return true;
    }).catch(function (err) {
      if (my === token && typeof opts.onFail === 'function') { try { opts.onFail(err); } catch (e) { /* ignore */ } }
      console.warn('[RuskiMiniGame] not started:', err && err.message ? err.message : err);
      return false;
    });
  }

  window.RuskiMiniGame = {
    mount: mount,
    unmount: unmount,
    reset: function () { if (inst) inst.reset(); },
    probe: function (o) { return inst ? inst.probe(o.aim, o.power) : null; },
    throwBall: function (o) { return inst ? inst.throwBall(o && o.aim, o && o.power) : false; },
    getState: function () {
      if (!inst) return null;
      return { side: inst.side, phase: inst.phase, ot: inst.ot, shotsLeft: inst.shotsLeft, offhand: inst.offhand, penalty: inst.penalty, rerackDue: inst.rerackDue, galaxy: inst.galaxy,
        cups: { me: inst.upCount('me'), cpu: inst.upCount('cpu') }, record: inst.rec, shots: inst.shots, over: inst.over,
        flying: inst.ball.active, running: inst.running, drawCalls: inst.p.renderer.info.render.calls };
    }
  };
})();
