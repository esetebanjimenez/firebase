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
