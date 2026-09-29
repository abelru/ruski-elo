# Porting notes: single file to multiple files

The redesign (look, replay, celebration, mini-game, tournament balls) was ported from `preview.html` into the real app.
`main` had one 3,100-line `index.html`; this branch splits it. Data shape, Firebase path and admin features are unchanged.

## Structure decision: classic deferred `<script>` tags, one `window.Ruski` namespace

No build step, no bundler, no ES modules. Reasons:

- GitHub Pages at playruski.org serves files as-is, so relative paths just work, and `index.html` still opens from `file://`
  (ES modules are blocked there by CORS).
- The Firebase compat SDK and EmailJS are already globals, so a shared global namespace is the honest fit.
- Files run in a fixed order (see the `<script defer>` list in `index.html`); each one registers itself on `Ruski`
  and only calls other files at run time, so there are no circular-import problems between pages, router and admin.
- The pure files (`elo.js`, `stats.js`, `replay.js`) have no DOM access and also `module.exports`, so `tools/elo-diff.mjs` runs the same code in Node.

```
index.html           markup shell: header, nav rail / bottom bar, footer, script + style tags
css/                 tokens, base (shell), components, pages (incl. desktop layout), tournament, motion (order matters)
js/config.js         Firebase config, EmailJS key, sign-up link
js/util.js           $, esc (HTML escaping), toast, store, formatting
js/elo.js            rules + ELO math (pure)  <- the weekday fix lives here (dayKey)
js/stats.js          records, rankings, seasons, home highlights (pure)
js/replay.js         seeded replay reconstruction (pure)
js/ui.js             signal flags, rack glyph, sheets, in-page confirm
js/data.js           the ONLY Firebase code + dev modes + commit()/rollback
js/router.js         hash router + "wake" page transitions
js/views/*.js        home, rankings, seasons, players (+profile), rules, admin, game (replay), submit, shared
js/celebration.js    submit celebration
js/tournament.js     felt theme + bouncing balls
js/hero.js           mounts modules/minigame.js on Home
js/main.js           boot
js/dev/fixture.js    mock data, loaded only by ?mock=1
modules/             minigame.js + minigame.css (the playable hero)
tools/elo-diff.mjs   old-vs-new ELO regression against the live data
```

## Dev modes (never on by accident)

- `?readonly=1` reads the live database, blocks every write, logs `[ruski:readonly] write blocked`.
- `?mock=1` uses `js/dev/fixture.js`, no network, only on localhost / 127.0.0.1 / file: (ignored on playruski.org).
- Both show a yellow badge in the header. Their Submit draft is stored under a separate localStorage key.
- All writes go through `Ruski.data.commit()` -> `save()`; there is no other `set()` in the code base.

## What changed in behavior (on purpose)

- Multi-game ELO bonus is keyed by calendar day (from the date string; handles both stored formats) instead of weekday name. Applied in `calculateELO` and the home highlights.
  `node tools/elo-diff.mjs` proves the rest of the math is byte-identical to the old code.
- Freshman-submit countdown removed.
- No `alert`/`confirm`: toasts and in-page sheets. Names are never put into inline handlers; all HTML built from data goes through `esc()`.
- Rankings/Players still come from the roster (as before). Admin edit now recomputes `nakedMile` from the edited cups.
- Submit: the record is identical to the old one. New: optional past date, duplicate-player guard, warnings before save. The save waits for the database (8s cap), then celebrates; a rejected write rolls back and offers a retry.
- Cold links to `#game/<id>` and `#players/<name>` work.

## Known issues carried over (not changed)

- Admin password is still the literal check in `js/views/admin.js` (`'bbsucks'`), visible to anyone reading the source. The real fix is Firebase Auth + database rules.
- Import JSON only replaces what the page holds in memory, exactly like the old `importData()`; it is saved by the next write. One-line fix if wanted: call `Ruski.data.save()` in `importBackup`.
- Every write replaces the whole `fisherRuskiData` object (two phones saving at once can overwrite each other).
- EmailJS is loaded and initialised as before, but nothing sends mail (the old app never did either).
- "Last updated" uses the page's Last-Modified header (deploy time on GitHub Pages).

## Third-party scripts

Firebase 9.22.0 compat, EmailJS (pinned to 3.12.1, was floating `@3`) and three.js r128 (loaded lazily by the mini-game) carry SRI hashes and `crossorigin`.
Google Fonts CSS cannot be hash-pinned. When you bump a version, recompute:
`curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A`.
