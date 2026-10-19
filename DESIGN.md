# Iron Line — design

## Pitch

*Grow Empire: Rome*'s loop, turned 90° into a top-down 8-bit battlefield and
re-themed: a modern military firebase against the fantasy genre. The joke is the
matchup — riot shields and belt-fed machine guns against knights, golems and
raised skeletons — and the game plays the matchup straight.

## Pillars

1. **You decide when the fight starts.** Waves never arrive on a timer. The
   tension is in choosing to launch before you are quite ready, because the
   credits are on the field.
2. **A wave is a sequence of decisions, not one.** Deployment charges trickle
   back during the fight, so you commit a little at a time and react to what is
   walking at you.
3. **Losing costs time, never progress.** A breached wall re-arms the same wave.
   You keep every credit, the wall is rebuilt, and the same wave plan is waiting
   — so a loss is information, and the next attempt is a plan.
4. **It keeps playing without you.** Passive income compounds with your best
   wave, and automation is purchasable, so the run moves while the tab is shut.

## The loop

```
PREP ──spend credits──▶ LAUNCH ──▶ BATTLE ──┬─ field cleared ─▶ wave + 1 ─┐
  ▲                                         │                            │
  └─────── wall rebuilt, credits kept ──────┴─ wall at 0 HP ─▶ same wave ─┘
```

## Systems

### The field

One coordinate space, 192×240 "field pixels", shared by the simulation and the
renderer so neither has to translate. The wall sits across the bottom with a
gate at the centre and four tower emplacements on the parapet; enemies walk on
from the top edge; the muster point is mid-field.

### Unit AI

The brief, implemented literally:

- Player units charge the nearest enemy; with the field clear they fall back to
  the muster point and hold.
- Enemy units charge the nearest player unit; with none left they advance on the
  wall and attack it.

With one deliberate addition: **siege engines ignore your soldiers entirely**
and drive for the wall. Without them, a line of soldiers parked in mid-field
would be a permanent plug — the siege units are what force you to actually
defend the wall rather than win every fight at the muster point.

Ranged units stop at their range and fire; melee close to contact. Bodies push
each other apart, which turns a column into a firing line without pathfinding.

### How soldiers fight

**Anything on the field gets charged.** This is the rule straight from the
original brief, and every attempt to be cleverer than it has been a mistake.

The clever versions, in order. First a clamp on movement: soldiers walked into
an invisible wall and slid along it, and because the clamp released on a timer
that only reset on contact, the line crept forward with every kill until a wave
ended far from the guns. Then a rule about choice — a soldier picked a target
it could engage *from its post* — which fixed the sliding but introduced a
worse tell: only an enemy that had already stopped earned an advance, so a
soldier would stand at its line watching a freshly spawned enemy stroll all the
way down the map, and react only once it arrived. That reads as the soldiers
being asleep, and that is exactly how it was reported.

So: a soldier charges the nearest enemy, full stop. The only cap is **the edge
of the ground the guns cover**. Soldiers march to meet anything below that
edge, hold the edge when the target is above it, and do not walk into the strip
unprompted — which keeps a charge from becoming a jog to the top of the map and
leaves the siege problem intact. The edge is walked toward from either side, so
a soldier that pushed into the strip and has nothing to show for it steps back
under cover instead of standing out there. (Retreating all the way to a rear
line instead would make it oscillate: back to the line, then forward to the
edge, forever.)

**Range ends the walk.** Firing used to run while a soldier was still closing
on its post, so troops strolled across the field with rifles going off and the
halt looked arbitrary — it happened at a bookkeeping row rather than at the
moment of contact. Movement and shooting are now exclusive: a target inside
reach means stand and work. Measured over a wave, that took firing-while-walking
from 23% of attacks to none and moved where the fighting happens by five pixels.

When the field is clear, soldiers fall back to a muster block around the gate,
so an idle army is already standing where the next fight will start.

**Pressure is the release valve**, and it is mandatory rather than optional.
With a hard cap, an enemy that outranges your soldiers can stand beyond it with
impunity — an archer does this by eight pixels, a trebuchet by the length of
the strip — and the wave never resolves. (Wave 3 hung for the full time limit
the first time this shipped.) Pressure builds only while the nearest enemy
cannot be answered from covered ground *and* has itself stopped — shooting your
soldiers or shelling the wall — and it jumps when a soldier takes fire. Past
the limit, the soldier goes into the strip after it. That one rule answers
siege, archers and stragglers without a special case for any of them.

Reachability is measured as a real distance from the edge of cover, not a
comparison of rows: an enemy far off to the side is not reachable just because
it shares one. A target sitting exactly on the boundary used to flicker in and
out, resetting the release timer every other tick and silently disabling it, so
the test carries a margin and the timer decays rather than resets.

Each kind ends up holding a different part of the fight. Shield bearers have
almost no reach, so a charge carries them to contact and they are the nearest
target; riflemen stop at rifle range behind them; rocketeers stop a hundred
pixels back. Posture biases the muster block the same way, so the ordering is
already right before the first shot.

### Towers, the strip, and siege

**The parapet starts empty.** Four guns from wave 1 answered the early waves on
their own, which made deploying soldiers optional exactly where the game should
be teaching you to do it — the complaint was that you simply never needed the
gate. So the wall now has four pads and nothing in them, levels build the guns
one at a time, and the first waves are the gate's job. The emplacements are
baked into the terrain either way, so an empty pad reads as something to fill
rather than as missing art.

Spreading the guns over several levels is also what lets each level be small.
The old track handed you the whole battery at level 1 and then multiplied it;
the new one adds a gun every other level and a modest damage step in between,
which is a longer run of cheaper, smaller decisions — and the campaign reaches
further than it did before (wave 57 for the scripted auto-player, against 49).

Once built, the guns reach **almost the whole field, except a strip along the
top**, and upgrading them shaves rows off that strip. This replaced a tower *range* that
grew outward from the wall, and it is a better system for one reason: a radius
made tower level and soldier placement the same decision, and every change to
one broke the other. A strip makes tower level a question about territory
instead — how much of the top of the map is still the enemy's.

The strip is also what keeps towers from being a solved purchase. Enemies deploy
**siege engines that outrange the guns and shell the wall from inside it**: the
kingdom's *Trebuchet*, the arcane *Obelisk*, the undead *Bonethrower*. Each has
a reach long enough that it stops inside the strip, so no amount of tower
levelling brings it under fire. Siege has to be answered by going out to meet
it — deployed units, or fire support dropped on it — which is the whole point:
towers hold the ground you own, and the strip is the ground you have to
contest.

So the two purchases ask different questions. Towers: *how much of the map do I
cover?* Soldiers and abilities: *what do I do about the part I don't?*

**Siege threatens a share of the wall, not a number of hit points**, and a wave
fields at most a handful of engines. Both rules exist because the first version
did neither, and the result was measured rather than guessed: the time a full
wall survived a bombardment *shrank* as the campaign went on — fourteen seconds
at wave 13, four by wave 35 — because engine count grew with the wave budget
and per-engine damage grew with the wave's damage scale, while wall hit points
only grew with what the player bought. Siege had stopped being a problem to
solve and become a timer that ran out before anything could be done about it.

Each engine now takes a fixed percentage of the wall's maximum off per shell,
and `siegeAllowance` caps engines per wave at four. Together they hold the
clock near a minute at every wave measured, which is the number that matters:
long enough to clear the escort and walk a firing line up the field, short
enough that ignoring the bombardment loses the wall. Wall levels still answer
everything else that reaches the parapet.

`siege.test.ts` asserts all of it — that every army fields siege, that it parks
out of reach at *any* tower level, that the clock stays near a minute from wave
13 to 35, that the engine cap holds to wave 60, and that soldiers sent out
actually destroy it.

### The counter triangle

Every weapon deals one of three damage classes and every enemy body is one of
three classes, and the two taxonomies are deliberately different:

| Weapon | Strong against | Weak against |
| --- | --- | --- |
| Kinetic — Rifleman, tower guns | Elusive | Armoured |
| Explosive — Rocketeer, Artillery, Barrage | Armoured | Swarm |
| Sustained — Machine Gunner, Napalm | Swarm | Elusive |

A symmetric taxonomy — one class per unit, attacker class versus defender
class — is tidier and does not fit this game. The anchor of your line is a
Shield Bearer that deals almost no damage, so "heavy beats massed infantry"
cannot be expressed as a damage multiplier on your side at all. Weapons have a
damage class, enemies have a body class, and the matrix connects them in the
direction the player actually chooses: what to deploy against what is coming.
The Shield sits outside it and counters skirmishers structurally, by closing
and soaking.

The table is stored as one strong and one weak matchup per damage class rather
than a free 3x3 of numbers, so the shape *is* the rule: a mistyped table cannot
quietly produce a weapon that is good against everything. A test asserts the
cycle — each body class answered by exactly one weapon and punishing exactly
one.

The multiplier is applied at the single function every point of damage passes
through, and *before* armour. Armour is flat subtraction, so applying it first
would let a heavy's plating eat the rocket bonus meant to beat it.

**What the multiplier could not fix on its own.** Measured, the right soldier
lost to a plain rifleman in nine of twelve contested waves even with the
triangle live. Three things were drowning it: the counters cost two deployment
charges against the rifleman's one, the scripted player levelled the rifleman
highest, and shapes were too impure to reward a specialist. The multiplier was
never the problem — the economy around it was. Every soldier now costs one
charge, so the deployment decision is tactical rather than a price tier, and
with that the right tool wins seven of ten contested waves.

### Wave shapes

A wave rolls a shape, which biases how its budget is spent: an armoured column,
a horde, a skirmish line, or a mixed force. The budget itself stays outside the
roll — total strength for a wave is fixed and knowable, and only the spend
varies. That split is what makes a wave a tactical problem rather than a
lottery.

Shapes are tendencies, not monocultures. A column of nothing but armour is
answered with one unit and never fields siege; the heavy pass takes from the
favoured class 85% of the time. Measured across forty runs, by threat:

| Shape | Armour | Swarm | Elusive |
| --- | --- | --- | --- |
| Column | 70% | 17% | 13% |
| Horde | 25% | 68% | 6% |
| Skirmish | 25% | 13% | 62% |
| Mixed | 56% | 22% | 21% |

That mix is weighted by hit points rather than bodies on purpose. By headcount
a column is fifteen knights behind thirty-nine skeletons, which makes the label
read as a lie; by threat it is overwhelmingly armour, which is what the player
meets.

Shapes hold off until wave 8. A pure armoured column is a dice roll rather than
a tactical problem while the explosive answer is still hundreds of credits out
of reach, and losing to a roll you had no tool for teaches nothing.

### A run's own campaign

Wave composition is random, but for a long time it was the *same* random: the
planner seeded itself from a constant in config, so every player in every
playthrough met the same waves in the same order, and starting over handed you
the campaign you had just finished. The seed belongs to the run now — drawn
when a run starts, carried in the save, and required rather than defaulted by
`planWave`, because a default is exactly how the constant crept in and is how
it would come back.

What must not change is determinism *inside* a run. The preview is a promise:
the wave you are shown is the wave you fight, and re-fighting a lost wave hands
back the fight you lost rather than rerolling it, which is the only reason
planning against the preview is worth doing. So the roll keys on (run seed,
wave number) and never on the attempt.

The budget is deliberately not part of the roll. Total strength for a given
wave is fixed and knowable; what varies is how it is spent. That split is what
lets a wave be a tactical problem rather than a lottery — and it is what the
intel and composition work builds on.

### Difficulty: making the curve cost something

Measured, a scripted player that brings the right counters cleared **eighty
waves at 1.00 attempts per wave** — it never lost a single one — while holding
eight to sixteen times the price of its cheapest upgrade in the bank.

The cause is structural rather than a number being wrong. There are eleven
upgrade tracks, each with its own geometric cost curve, and a curve only steepens
for the track you spend on. So one wave's bounty buys eight to twenty-seven
power steps spread across eleven curves, while the enemy gets exactly one wave
of scaling. The player outruns the game by construction.

Two levers were swept against attempts-per-wave. Cutting bounty produced walls —
at 1.05 growth the run stalls dead at wave 25 — because a player who is behind
and also poor can never catch up. Steepening enemy hit points produced friction
without walls, so that is the lever: early growth 1.14 → 1.18, late growth
1.23 → 1.30, and the late stage starting at wave 12 rather than 15.

| | before | after |
| --- | --- | --- |
| Attempts per wave, to wave 20 | 1.05 | 1.30 |
| Attempts per wave, to wave 40 | 1.05 | 1.27 |
| Worst losing streak | 0 | 4 |

A losing streak is the idle loop working, not a wall: credits are kept on a
loss, so every failed attempt still funds the upgrade that eventually breaks
through. What a streak must not do is last forever, which is what cutting
bounty caused.

### Intel: what you know before you commit

| Rung | Adds | Reads as |
| --- | --- | --- |
| L0 | Army, total strength, payout | "Kingdom Army · 554k hp of trouble" |
| L1 | Shape, and what answers it | "Armoured column — wants explosives" |
| L2 | Which kinds are coming | "Knights, Rams, Archers — numbers unknown" |
| L3 | How many in total | "65 enemies" |
| L4 | The exact order of battle | "9x Knight, 3x Battering Ram, …" |

**Strength is never for sale.** The budget is the constant half of a wave —
fixed and knowable — and what varies is how it is spent, so the composition is
what intel sells. A player who could not see how big a wave was would have
nothing to judge at all.

What is actually being sold is *advance notice*. Without a scrap of intel you
still learn what a wave is made of when it walks on; what you cannot do is fit
the parapet and pick your soldiers for it beforehand, and that is the only
moment the choice is worth anything. It is also why re-fitting a gun is free:
charging for it would punish acting on the thing you just bought.

The first rung is priced to land around wave 3-4, because the gun pads arrive
early and fitting them is guesswork without the shape. The ladder is finite —
four rungs and the track stops selling — and the order is deliberate: shape
first, because it is the rung that names a counter and therefore the one that
changes what the player does. Kinds tell you what to bring, the count tells you
how much, and the exact order of battle tells you how to split the charges.

The reveal rule lives in `src/sim/intel.ts` rather than in the snapshot
builder. What a player knows before they commit decides what they can do, which
makes it a game rule and not a rendering concern.

Measured: a scripted player that buys intel reaches wave 40 in 54 attempts
against 58 for one that never does, having paid for the ladder on the way. The
instrument's parapet fitting is gated on the first rung for the same reason —
reading the plan directly would measure a player who can see through walls.

### The parapet is part of the triangle

The guns used to be fixed kinetic, and they do most of a wave's killing —
turning them off drops a wave's margin from 45-71% to 0-32%. So the largest
share of the player's output answered every wave equally, and diluted every
decision they made. Typing the guns turns that dominance into the thing the
decision moves.

Three can be bolted into a pad, one per damage class:

| Emplacement | Class | Answers | Character |
| --- | --- | --- | --- |
| MG Emplacement | Sustained | Hordes | Quarter-second cadence, single target |
| Grenade Launcher | Kinetic | Skirmish lines | Lobbed airburst, modest splash |
| Rocket Launcher | Explosive | Armoured columns | One heavy warhead every two seconds |

Range is deliberately shared. How far the guns reach is a property of the wall,
and the strip they cannot cover is where siege lives; giving one gun more reach
would hand it the siege problem, which is meant to be answered by going out
there.

**You fit a pad by pointing at it.** Tapping a gun pad on the wall opens a
picker over it; the list in the panel is an abstraction over the same four
objects, kept for when a thumb is not precise enough. The picker anchors on the
pad rather than on wherever the tap landed, so it appears in the same place
however accurate you were, and a tap anywhere else closes it — there is no way
to get stuck in it.

**Levels are per gun type, placement is per pad.** Upgrading the MG lifts every
MG on the wall. Re-fitting is free and only between waves, so the parapet is
chosen against the wave you can see while what limits you is how far each gun's
own track has been levelled — you can always answer a column, but your rocket
level may be a long way behind your MG.

**Cadence beat the coefficient, so the guns needed targeting rules.** With the
counter multiplier alone, fitting the shape's counter *lost* to leaving every
pad on the MG: a quarter-second gun has near-perfect uptime and wastes almost
nothing, while a two-second rocket pours most of a warhead into a skeleton.
Rate of fire beat the matchup every time. So each gun aims its own way — the MG
takes whatever is closest to the wall, the grenade launcher the best-packed
cluster, the rocket the heaviest thing it can see. That is a mechanic rather
than a bigger number, which is what the measurements had been pointing at all
along: refitting went from 2.6 points *worse* than never refitting to 2.4
points better.

### Why tactics are still a margin more than a decision

The counter triangle was built to make deployment a choice. Measured at the
frontier a player actually lives on — upgrade, fight the wave you are stuck
on, repeat — bringing the shape's counter instead of plain riflemen flips the
result in **one attempt out of forty**, and is worth **0.3 percentage points**
of leftover wall on average. Sometimes it is worse: the worst case measured
was twenty-one points *down*.

Four levers were tried against that number, and none of them moved it:

- **The multiplier.** From 1.5x up to 2.4x. Separation between units widens on
  columns and hordes, but skirmish waves stay flat whatever the number.
- **Unit stats.** The Rocketeer was strictly the best unit on every shape,
  including the hordes it is supposed to lose to, because range 100 and a
  30-pixel splash beat a 0.65x penalty. Cutting the splash fixed that — and
  simply moved dominance to the Machine Gunner.
- **Shape purity and threat.** Both were real bugs and both are fixed (below).
  Neither changed the frontier number.
- **Tower scaling.** Turning the guns off drops a wave's margin from 45-71% to
  0-32%, so the parapet does most of the killing — and tower guns are fixed
  kinetic, so that damage is the same whatever you deploy. Cutting tower growth
  dilutes less but re-opens the difficulty curve: at 1.13 the scripted player
  stalls at wave 12.

The structural reason is that a wave's outcome is the sum of many sources —
the parapet, the screen, the chosen soldier, fire support — so a 50% modifier
on one component of one source is a small share of the whole. Making the
choice decisive needs a *qualitative* counter rather than a larger
coefficient: armour-piercing that ignores armour outright, suppression that
halts a horde, resistance that makes the wrong weapon fail rather than
underperform. That is a mechanic, not a tuning pass, and it is the open
question.

What the triangle does deliver today is texture: the right soldier wins a wave
more comfortably, and no soldier is dominant across all three shapes.

### Shapes differ in what they field, not how hard they hit

A point of budget buys far more hit points as armour than as skirmishers, so
at a flat budget a column carried 121% of a mixed wave's threat and a horde
60%. The shape was a difficulty label: a horde was a breather whatever you
brought, a column dangerous whatever you brought — which is the opposite of
what a shape is for.

Threat is now scaled per shape, and deliberately not the budget: the field
caps how many bodies a wave can hold, so buying more of them moved threat from
60% to only 64%. Scaling hit points instead brings every shape within 92-109%
of a mixed wave.

**What this does not fix.** Outcomes are close to bimodal — a wave ends with
roughly 60-75% of the wall standing, or with none of it. With exponential
scaling the band where a fight is genuinely close is about one wave wide, so a
counter worth 1.5x damage rarely flips a result; it decides how comfortably a
wave is won, and buys perhaps a wave or two of progress. Measured on a
flip-the-outcome metric, the deployment choice changes the result in only zero
to two of every nine to thirteen shaped waves. Making tactics decide more than
that needs the cliff softened, which is a deeper change than a scaling pass.

### Written waves

Most waves come from the budget planner, which makes good generic fights but
cannot teach. A lesson needs a specific wave at a specific moment, with a name
on the launch button and a sentence waiting if you lose it.

**Wave 6, "The Charge"**, is the first: nine skirmishers — fast, durable and
hard-hitting — behind four militia. Riflemen alone lose it; they cannot kill
enough of the charge before it arrives, wherever they stand. The same credits
spent on a Shield Bearer win it, because the shield stands in front and absorbs
while the rifles keep working.

Both halves of that claim are tested in `lesson.test.ts`. The numbers were not
guessed: a sweep over skirmisher count, hit points and damage against shield hit
points and charge cost found which combinations actually teach. The teaching
band is narrow, because deployment charges are the real constraint at wave 6 —
with more skirmishers nothing buyable saves the wall, and with fewer the rifles
win on their own. Settling it took moving two numbers: the skirmishers became
durable rather than merely fast (and cost the planner more), and the Shield
Bearer became a genuine body rather than a slightly tougher rifleman.

The lesson has been broken twice by tuning done elsewhere — both times by
towers getting stronger, which quietly made the wave winnable with rifles alone
— and once it survived only on the default seed. A wave that teaches on seed 1
and not on seed 5 is luck, not design, so the test now makes the claim across
eight seeds.

### Deployment charges

A global pool (3 at the start, upgradeable) that refills one charge at a time.
Riflemen and shield bearers cost one; machine gunners and rocketeers cost two.
This is the game's main pacing knob: how much force you can project per wave,
and how fast it comes back.

Each kind gets its own button, and pressing it deploys that kind immediately.
There is no select-then-deploy step: mid-fight the decision is *which soldier,
now*, and making that one press rather than two is the difference between
reacting to a wave and watching it.

### Soldier levels

Soldiers are not improved by global stat tracks. Each kind carries its own
level, and a level raises that kind's hit points, damage and a little of its
speed — for that kind alone. Specialising in riflemen is cheap and leaves your
rocketeers where they were; spreading investment costs more and keeps every
answer available. "Armour +1" applied to everyone was a shopping list; "Rifleman
L7" is a statement about how you fight.

### Visible rank

An upgrade you cannot see is a number in a menu. Every level is therefore worn:

- **Ten colours** — iron, bronze, tan, silver, gold, jade, azure, violet,
  crimson, obsidian. Metals first, then the rarity ladder every player reads
  without being taught.
- **Five gear steps** — the base weapon, then pieces that accumulate: night
  vision, a vest, a scope, a pack (and helms, pauldrons and crests for the
  fantasy kinds).
- A level advances the colour; every tenth level earns another piece of kit and
  **resets the colour to iron**, so a new piece arrives unmistakably plain and
  then climbs again.

Ten colours over five pieces is **fifty visibly distinct ranks**, which means
the first fifty levels of a soldier each change what you see. The colour paints
the *gear*, never the body, so the kind is still legible at a glance: a silver
rifleman is obviously a rifleman.

**Enemies wear the same ladder.** An enemy's rank comes from how far its kind
has scaled past its debut wave, so a wave-30 skeleton is visibly a different
proposition from a wave-3 skeleton, and the colour means the same thing on both
sides of the field. This was the answer to a real problem: a wave-40 militia used
to be pixel-identical to a wave-1 militia while having hundreds of times the hit
points. The difficulty curve was invisible.

### Drawing units

Bodies are built, not drawn. `render/body.ts` assembles a unit from parts —
torso, shoulder pads, helmet with a visor strip, arms, pack, hood, siege frame —
sized by that kind's own `radius`. A skeleton, a knight and a bone giant are one
construction at three sizes rather than three hand-drawn buckets, which is what
lets 21 kinds have 21 silhouettes instead of six.

Colour comes from a five-slot ramp: a lit front, a mid-tone body, a shaded
underside, an accent for visors and trim, and an outline. The shade slot is what
stops a unit reading as a flat disc with a rim.

Each body is built in the four poses of a walk cycle — feet together, left lead,
together, right lead — with the figure lifting on the passing frames, the arms
swinging opposite each other, and the shoulders rolling. The cycle advances with
distance covered rather than with time, so a plodding golem and a scurrying
ghoul are paced by their own speed without either needing special timing. Firing
kicks a shooter back along its aim for a moment, and the dead leave a body that
settles and fades instead of blinking out.

Gear (`render/gear.ts`) is drawn live on top, along the unit's aim, in the rank
colour. Because the battlefield and the UI's icons call the same two functions,
a deploy button cannot drift from the soldier that walks out of the gate.

### Fire support

Ground-targeted and telegraphed. A cast does not damage anything on the spot —
it puts hazards on the ground that the engine resolves a beat later:

- **Artillery Strike** — one heavy shell, short cooldown.
- **Mortar Barrage** — six shells walked across a wide area over several seconds.
- **Napalm** — burning ground that keeps damaging whatever walks through it.

The telegraph is honest: enemies can and do walk out of a barrage.

### Enemy design

Each army is a different problem:

- **Kingdom** — numbers and armour. Teaches you that armour blunts
  small-calibre fire.
- **Arcane** — ranged damage behind very tough constructs. Teaches you that
  reaching the back line matters.
- **Undead** — individually trivial, endless, and self-replenishing while the
  necromancers live. Teaches you to kill the right thing, not the nearest thing.

All three field siege, each in its own idiom, so no army can be answered with
towers alone.

Wave composition is budget-driven: a point budget grows with the wave, is spent
first on a few heavies and then on numbers, drawn only from kinds that have
debuted by that wave. Bosses arrive every tenth wave on a reduced budget,
because the boss *is* the wave.

### Economy

Credits come from kills (kept win or lose) and from passive garrison income.
Upgrades are the standard geometric price curve, and — this is the part that
matters — **power is geometric too**. An early build with linear power against
geometric prices stalled dead at wave 14 in simulation; compounding both, and
letting bounty scale with enemy HP, is what makes a long run possible.

Enemy stats scale in two stages: gently early, then steeply from wave 15. The
player compounds across the wall, the towers, the charge pool and a level track
per soldier kind, while the enemy only has stats and numbers, and numbers are
capped by what the field can hold — without the second stage, wave 40 was a
formality.

### Balance method

`src/sim/__tests__/balance.test.ts` runs a scripted player: it buys the cheapest
useful thing, spends every charge the moment it has one, and drops abilities on
crowds. Every balance claim in this document is something that test checks — the
opening is not winnable on guns alone, naive play reaches wave 20, towers alone
run out of road, no wave can stall, and a wave deep into a run still takes real
time to clear.

## Architecture

```
src/sim/      pure TypeScript: the whole game, no DOM
  config.ts   global curves, field geometry, abilities, idle layer   ─┐ the only
  roster.ts   per-unit stat blocks, both sides, and the factions     ─┘ balance files
  engine.ts   the authoritative tick: AI, movement, combat, waves
  waves.ts    deterministic wave planning and unit construction
  derive.ts   every derived number, so nothing can disagree
src/render/   canvas renderer: string-art sprites, baked terrain, FX
src/game/     the React bridge: fixed-timestep loop, snapshots, saves
src/ui/       the shell: status, controls, shop, reports
```

The simulation never imports from the renderer or React, which is what lets the
entire game be tested headlessly and lets the renderer be rewritten without
touching a rule.

## Planned: the finite campaign

Today difficulty is a multiplier. Enemy hit points and damage scale per wave on
a curve, and until ranks were added none of that was visible. The direction is
to make escalation something you can **count and see** instead:

1. **Difficulty by composition, not multiplication.** A wave gets harder because
   it fields more bodies, heavier kinds, and higher-ranked versions of them —
   each of which is on screen. The per-wave stat curve shrinks to a residual or
   disappears.
2. **Ranks become a planner decision.** Instead of deriving an enemy's rank from
   the wave number, the wave planner *buys* rank: a crimson knight costs more
   budget points than an iron one and hits proportionally harder. Rank is then
   authored difficulty with a known multiplier per step, and the budget curve is
   the single difficulty dial.
3. **A campaign that ends.** Count is capped — the field holds about ninety
   bodies before they are shoulder to shoulder, and ninety unscaled enemies is
   roughly eighty times wave one, against the five and a half orders of
   magnitude the current curve spans. Rank multiplies that back up, but not
   without limit. That is a feature: it gives the run a designed length of
   roughly forty to sixty waves.
4. **Flatter player curves to match.** Geometric power across four command
   tracks and four soldier ladders outruns anything bounded. Costs and gains
   both come down, so a level is a smaller, more frequent decision.

This is a rebalance of nearly everything in `config.ts`, so it is a deliberate
step rather than a tweak. `balance.test.ts` is the safety net: it plays the game
and fails if the curve stops making sense.

## Planned: veterancy

A campaign that ends is what makes prestige worth having — with unbounded
scaling there is never a reason to stop climbing.

- **Earning.** Veterancy is banked against a **high-water mark**, not a count of
  boss kills: points owed are a function of the furthest wave ever cleared, and
  a reset pays only the difference. Re-clearing wave 10 forever pays nothing,
  which closes the obvious farm loop.
- **Spending.** Permanent carry-over between runs: starting credits, a head
  start a few waves in, flat percentages on the wall, the towers and the
  soldiers, an extra deployment charge (the most *felt* upgrade in the game),
  keeping a unit kind unlocked — and content that only prestige opens, such as a
  fifth soldier or a fourth ability.
- **Where it lives.** The restart button already exists and already confirms, so
  prestige is that same gesture: "restart and bank N veterancy". Veterancy sits
  outside the run state so a reset preserves it.
- **Showing it.** Veterancy should be visible on the field the way levels are —
  a permanent rank floor, so a veteran company looks like one from the first
  wave of a new run.

## Known gaps / next

- No audio.
- Enemy variety is per-army, not per-wave-modifier (no "armoured wave", "fast
  wave" affixes yet).
- Units are drawn direction-agnostically, with the kit rotated to the unit's aim
  rather than four-facing bodies. At 16–30 pixels it reads, but real facings
  would read better.
