/* Rules: the full rulebook and ELO write-up, restyled as accordions. The wording is the old Rules page, unchanged. */
(function (R) {
  'use strict';
  const { mk } = R.util;
  const { pageHead } = R.shared;

  const RULES_HTML = `
<details class="acc" open><summary>Overview</summary><div class="bd">
<p>Ruski is a fast-paced, strategic, drinking pong game. Teams of any even number of players compete to hit cups and manage turns, drinking, and formations.</p>
<ul>
<li><strong>Standard 2v2 game:</strong> 10 cups per side, each 16 oz, filled with 1.5 12-oz beers.</li>
<li><strong>Scaling:</strong> For larger games, cup/beer counts scale linearly:
<ul>
<li>3v3 → 45 beers</li>
<li>4v4 → 60 beers</li>
<li>8v8 → 120 beers, etc.</li>
</ul>
</li>
</ul>
</div></details>
<details class="acc"><summary>Starting the Game</summary><div class="bd">
<ul>
<li><strong>First Shot – Eye-to-Eye:</strong>
<ul>
<li>Opposing players make eye contact and count to 3.</li>
<li>Shoot while maintaining eye contact.</li>
<li>Repeat until one player hits a cup and the other team misses.</li>
</ul>
</li>
</ul>
</div></details>
<details class="acc"><summary>Turns &amp; Shooting</summary><div class="bd">
<ul>
<li><strong>Cup Hit & Sequence:</strong> When a cup is hit, it is removed. The other teammate shoots next.</li>
<li><strong>Drinking Times:</strong>
<ul>
<li>First cup hit by a team: 1 minute to drink.</li>
<li>Subsequent cups: 3 minutes each.</li>
<li>If a player drinks multiple cups in a turn, each cup gets its individual time plus a 1-minute pause between cups.</li>
</ul>
</li>
<li><strong>Balls Back:</strong>
<ul>
<li>Defense allowed: you can catch or swat a bouncing ball.</li>
<li>Bounce shots (off table/floor) are dead.</li>
<li>Accidental wall bounces are allowed.</li>
</ul>
</li>
<li><strong>Tri/Quad:</strong>
<ul>
<li>If a ball balances between 2 or more cups, all cups it touches are removed and drank.</li>
<li>Called a Tri (3 cups) or Quad (4 cups).</li>
<li>Tri/Quad does NOT count as hitting a cup for "naked mile" purposes.</li>
</ul>
</li>
</ul>
</div></details>
<details class="acc"><summary>Formations &amp; Reracks</summary><div class="bd">
<ul>
<li><strong>Triangle Formation (4-3-2-1):</strong>
<ul>
<li>When a triangle is possible, teams must call rerack immediately after hitting a cup.</li>
<li>Failing to call rerack before hitting another cup results in losing the rack.</li>
</ul>
</li>
<li><strong>Special Formations:</strong>
<ul>
<li>Tits Formation: 4 back + 2 sides → team must remove shirts.</li>
<li>Arrow Formation: Cup pointing at a player → that player must shotgun.</li>
</ul>
</li>
</ul>
</div></details>
<details class="acc"><summary>Special Calls</summary><div class="bd">
<ul>
<li><strong>Sapuku:</strong> Can be called immediately after a cup is hit. Opposing team drinks unhit cups until next rerack.</li>
<li><strong>Other Calls:</strong>
<ul>
<li>Ginobes: Airball off back of table → must shoot off-hand next turn.</li>
<li>Bows: Shooting with elbow over table → shot invalid, no shot back.</li>
<li>Dance Cups: Ball hits non-game/stray cup → everyone must dance.</li>
</ul>
</li>
</ul>
</div></details>
<details class="acc"><summary>Turn Losses</summary><div class="bd">
<ul>
<li>Yacking or not finishing a cup in allotted time → lose next turn.</li>
<li>Player must finish the cup before shooting again.</li>
</ul>
</div></details>
<details class="acc"><summary>Naked Mile</summary><div class="bd">
<ul>
<li>If a player never hits a single cup during a game, they must run a naked mile.</li>
<li>Tri/Quad hits do NOT count as hitting a cup.</li>
</ul>
</div></details>
<details class="acc"><summary>Redemption &amp; Overtime</summary><div class="bd">
<ul>
<li><strong>Redemption:</strong>
<ul>
<li>After last cup is hit, losing team attempts to hit remaining cups.</li>
<li>Shots follow the same rules as the main game.</li>
</ul>
</li>
<li><strong>Overtime:</strong>
<ul>
<li>Standard game: 30 beers (15 per side).</li>
<li>Overtime: 6 cups, 3 per player (4.5 beers each).</li>
<li>If overtime is completed and the losing team hits all cups → Double Overtime: full 30-beer game set up again.</li>
<li>First team to hit game-winning cup retains balls back if applicable.</li>
</ul>
</li>
</ul>
</div></details>
<details class="acc"><summary>General Rules</summary><div class="bd">
<ul>
<li><strong>Gentleman's Game:</strong> Silence unless the shooter wants conversation or singing.</li>
<li><strong>Song Rule:</strong> Each player picks a redemption song and sticks to it forever. Shooter can shoot whenever during the song; hitting a cup restarts the song.</li>
<li><strong>Yacks & Turn Penalties:</strong> Missing or failing to drink → next turn lost.</li>
<li><strong>Defense:</strong> Allowed only for catching/swats. No bounce shots.</li>
<li><strong>No elbow-over-table shooting, no shooting on song change</strong></li>
</ul>
</div></details>
<details class="acc"><summary>Seasons</summary><div class="bd">
<ul>
<li>A season runs <strong>July 1 through June 30</strong>.</li>
<li>Season ELO starts fresh at 1000 for every player on July 1.</li>
<li>All-time ELO on the Rankings page is never reset.</li>
</ul>
</div></details>
<details class="acc"><summary>ELO Rating System</summary><div class="bd">
<p>Fisher Ruski uses a comprehensive ELO system that rewards individual performance, teamwork, and consistency.</p>

<h3 class="t-card">Base Formula</h3>
<p class="formula">
ELO Change = (Cup Points × Performance Multiplier) + Win/Loss Adjustment + Clutch Bonus − Yack Penalty − Naked Mile Penalty, then × Multi-Game Multiplier
</p>
<p>All players start at 1000 ELO. There is no ceiling, floor, or decay — it's a pure running total of every game's ELO change.</p>

<h3 class="t-card">Component Breakdown</h3>
<ul>
<li><strong>Cup Points (All players):</strong>
<ul>
<li>Regular Cup: 10 points each</li>
<li>Redemption Cup: 20 points each</li>
<li>Overtime Cup: 15 points each</li>
</ul>
</li>
<li><strong>Performance Multiplier (applied to Cup Points):</strong>
<ul>
<li>Your "fair share" of a 10-cup rack is 10 ÷ team size (1v1: 10, 2v2: 5, 3v3: 3.33, 4v4: 2.5)</li>
<li>Multiplier = 1 + ((Total Cups Hit − Fair Share) × 0.15)</li>
<li>Hit exactly your fair share → 1.0× (no change). Hit more → amplified. Hit less → reduced, and can even go negative if you're far under your fair share.</li>
</ul>
</li>
<li><strong>Win/Loss Adjustment:</strong>
<ul>
<li>Winners: flat +20 ÷ team size (1v1: +20, 2v2: +10, 3v3: +6.7, 4v4: +5)</li>
<li>Losers: 0, unless you hit fewer cups than your fair share — then an extra penalty of (Total Cups Hit − Fair Share) × 15 applies</li>
</ul>
</li>
<li><strong>Yack Penalty (All players):</strong>
<ul>
<li>Each Yack: -15 points</li>
</ul>
</li>
<li><strong>Naked Mile Penalty (All players):</strong>
<ul>
<li>Hit zero total cups in a game: flat -100 points, regardless of win/loss</li>
</ul>
</li>
<li><strong>Clutch Bonus (Winners only):</strong>
<ul>
<li>Sank any Redemption Cup: +15 points</li>
<li>Sank any Overtime Cup: +10 more points (stacks with the Redemption bonus)</li>
</ul>
</li>
<li><strong>Multi-Game Bonus (All players, per calendar day):</strong>
<ul>
<li>1st game of the day: standard calculation (×1.00)</li>
<li>2nd game of the day: ×1.05 (+5%)</li>
<li>3rd+ game of the day: ×1.10 (+10%)</li>
<li>Encourages tournament play and consistency</li>
</ul>
</li>
</ul>

<h3 class="t-card">Example Calculations</h3>
<div class="ex">
<strong>Winner Scenario:</strong> 2v2 game, you won, hit 6 regular cups + 1 redemption cup, 0 yacks, this is your 2nd game today
<br><br>
<strong>Calculation:</strong>
<ul>
<li>Cup Points: (6 × 10) + (1 × 20) = 80 points</li>
<li>Fair Share: 10 ÷ 2 = 5 cups. You hit 7, which is 2 above fair share.</li>
<li>Performance Multiplier: 1 + (2 × 0.15) = 1.30 → 80 × 1.30 = 104 points</li>
<li>Win/Loss Adjustment: 20 ÷ 2 = 10 points</li>
<li>Clutch Bonus: +15 (redemption cup on a win)</li>
<li>Subtotal: 104 + 10 + 15 = 129 points</li>
<li>Multi-Game Bonus (2nd game): 129 × 1.05 = 135.45 points</li>
</ul>
<strong>Final ELO Change: +135 points</strong>
</div>

<div class="ex">
<strong>Loser Scenario:</strong> 2v2 game, you lost, hit 2 regular cups, 1 yack, this is your 1st game today
<br><br>
<strong>Calculation:</strong>
<ul>
<li>Cup Points: 2 × 10 = 20 points</li>
<li>Fair Share: 10 ÷ 2 = 5 cups. You hit 2, which is 3 below fair share.</li>
<li>Performance Multiplier: 1 + (-3 × 0.15) = 0.55 → 20 × 0.55 = 11 points</li>
<li>Win/Loss Adjustment: you're under your fair share, so -3 × 15 = -45 points</li>
<li>Yack Penalty: 1 × -15 = -15 points</li>
<li>Subtotal: 11 - 45 - 15 = -49 points</li>
<li>Multi-Game Bonus: none (1st game of the day)</li>
</ul>
<strong>Final ELO Change: -49 points</strong>
</div>

<div class="ex">
<strong>Naked Mile Scenario:</strong> 2v2 game, you lost, hit 0 cups, 0 yacks, this is your 1st game today
<br><br>
<strong>Calculation:</strong>
<ul>
<li>Cup Points: 0 points</li>
<li>Fair Share: 5 cups. You hit 0, which is 5 below fair share.</li>
<li>Performance Multiplier applies to 0 Cup Points, so it contributes 0 either way</li>
<li>Win/Loss Adjustment: -5 × 15 = -75 points</li>
<li>Naked Mile Penalty: -100 points (hit zero total cups)</li>
<li>Subtotal: -75 - 100 = -175 points</li>
</ul>
<strong>Final ELO Change: -175 points</strong>
</div>

<h3 class="t-card">Starting ELO</h3>
<p>All players begin at 1000 ELO. Rankings are relative and evolve based on performance over time — there is no cap, floor, or decay.</p>
</div></details>
`;

  R.views.rules = function () {
    const el = mk(''); el.classList.add('narrow', 'rules');
    el.innerHTML = pageHead('Rules', 'Official Fisher Ruski Rules') + RULES_HTML;
    return { el, heading: 'Rules' };
  };
})(window.Ruski);
