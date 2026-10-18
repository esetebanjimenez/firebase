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

With one deliberate addition: **siege engines (battering rams, catapults) ignore
your soldiers entirely** and drive for the wall. Without them, a line of
soldiers parked in mid-field would be a permanent plug — the siege units are
what force you to actually defend the wall rather than win every fight at the
muster point.

Ranged units stop at their range and fire; melee close to contact. Bodies push
each other apart, which turns a column into a firing line without pathfinding.

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

### Fire support

Ground-targeted and telegraphed. A cast does not damage anything on the spot —
it puts hazards on the ground that the engine resolves a beat later:

- **Artillery Strike** — one heavy shell, short cooldown.
- **Mortar Barrage** — six shells walked across a wide area over several seconds.
- **Napalm** — burning ground that keeps damaging whatever walks through it.

The telegraph is honest: enemies can and do walk out of a barrage.

### Enemy design

Each army is a different problem:

- **Kingdom** — numbers and armour, and the only army with dedicated siege.
  Teaches you that armour blunts small-calibre fire.
- **Arcane** — ranged damage behind very tough constructs. Teaches you that
  reaching the back line matters.
- **Undead** — individually trivial, endless, and self-replenishing while the
  necromancers live. Teaches you to kill the right thing, not the nearest thing.

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
opening is winnable on towers alone, naive play reaches wave 20, towers alone
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

## Known gaps / next

- No audio.
- No prestige layer: a run eventually plateaus rather than resetting into a
  multiplier.
- Enemy variety is per-army, not per-wave-modifier (no "armoured wave", "fast
  wave" affixes yet).
- The renderer draws units direction-agnostically with a procedural weapon mark
  rather than four-facing sprites; at this scale it reads, but real facings
  would read better. The same sprite-plus-mark is what the deploy buttons show,
  so UI icons can never drift from the battlefield.
