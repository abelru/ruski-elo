# 🍺 Fisher Ruski Tracker

**The Game of Games.** A live ELO tracker, leaderboard, and rulebook for Ruski — the Fisher dorm's beer pong tournament — running at [**playruski.org**](https://playruski.org).

> ⚓ *Sink cups. Climb the ranks. Avoid the Naked Mile.* ⚓

---

## 🏆 What's in the boat

- **Home** — live stats, weekly/monthly/yearly highlights, and the Nautical Leaderboards:
  - 🎣 **Captain's Table** — top Admiral (highest ELO), Sharpshooter (most cups), Champion (best win rate), and Rising Tide (biggest single-game ELO gain)
  - ⚓ **Fred's Locker** — the flip side: Overboard, Landlubber, Scallywag, and Anchor
  - 🚣 **Legendary Regattas** — the most competitive and most brutal games on record
- **Submit** — log a new game (team size, winner, cups, yacks, redemption/overtime) straight into the tracker
- **Rankings** — full ELO leaderboard, all-time
- **Seasons** — ELO resets fresh every season while all-time rankings stay intact
- **Players** — every Fisher's career stats and profile
- **Rules** — the official Ruski rulebook, including a fully-worked breakdown of the ELO formula
- **Admin** — game moderation, roster management, and tournament mode toggle

## ⚙️ How the ELO actually works

Every game changes your ELO (starting at 1000, no floor or ceiling) based on:

| Component | What it does |
|---|---|
| **Cup Points** | Regular cup = 10, Redemption = 20, Overtime = 15 |
| **Performance Multiplier** | Hit more than your "fair share" (10 ÷ team size) and your cup points get amplified; fall short and they shrink |
| **Win/Loss Adjustment** | Winners get a flat bonus; underperforming losers take an extra hit |
| **Clutch Bonus** | Winning with a redemption or overtime cup pays off |
| **Yack Penalty** | -15 per yack, no exceptions |
| **Naked Mile Penalty** | Hit zero cups in a game? That's -100, straight up |
| **Multi-Game Bonus** | Playing multiple games in one day scales your gains |

Full math and worked examples live on the in-app **Rules** page — one source of truth, no more mismatched formulas.

## 🛠️ Under the hood

Still dependency-light: no build step, no bundler, just static files (see [`PORTING.md`](PORTING.md) for why).

```
index.html        markup shell
css/              tokens, base, components, pages, tournament, motion
js/               config, util, elo, stats, replay, ui, data (Firebase), router, views/, celebration, tournament, hero, main
modules/          the playable mini-game on the Home hero
tools/elo-diff.mjs  old-vs-new ELO regression against the live data
```

- **Firebase Realtime Database**: games, roster, counter and tournament flag in one object, synced live to every visitor. Only `js/data.js` talks to it.
- **EmailJS**: loaded and initialised; nothing sends mail yet
- **three.js r128**: lazy-loaded for the Home hero only
- **GitHub Pages**: static hosting, deployed straight from `main` (see `CNAME` for the custom domain)

## 🚀 Running it locally

No install, no build, no dependencies to pull:

```bash
git clone https://github.com/abelru/ruski-elo.git
cd ruski-elo
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`. It connects to the live Firebase database, so submit/admin actions are real writes. To stay safe, add `?mock=1` (fake local data, nothing saved) or `?readonly=1` (real data, writes blocked).

## 📜 The Ruski rulebook, abridged

- **Naked Mile**: never hit a cup in a game? You're running one. Tri/quad hits don't save you.
- **Redemption**: after the last cup falls, the losing team gets a shot at the remaining cups before the game's official.
- **Overtime**: 6 cups (3 per player), sudden death — and if the losing team runs the table, it's Double Overtime.
- **Special Calls**: Sapuku, Ginobes, Bows, Dance Cups — see the in-app Rules page for the full breakdown of every call, forfeit, and edge case.

## 🌊 Deploying

Push to `main` — GitHub Pages rebuilds automatically and playruski.org updates within a minute or two. That's it. No CI, no pipeline, just the tide going out and coming back in.

---

*Please use Fisher names.* 🍺
