# Firebase Idle — "The Line"

A mobile-browser idle defense game with a modern-military theme. You hold a
single fortified line: enemies advance across the field and pound your wall;
your soldiers shoot back; you grow your firepower, your wall, and your fire
support to hold longer. See [`DESIGN.md`](./DESIGN.md) for the original vision
(note: the playable build has since pivoted from the 3-ring concept to this
single-barrier "castle defense" model).

**Play it:** https://esetebanjimenez.github.io/firebase/

## The loop

- **One wall** with an HP bar stands in front of your FOB.
- **Enemies** march in from the right, reach the wall and shoot it, chipping its HP.
- **Your soldiers** on the wall shoot the nearest enemy; each kill earns **Supply**.
- A cleared wave counts as a **Day Held** — but only if the wall is still standing.
- **Supply buys three tracks** plus instant repair:
  - **Firepower** — soldier damage (your DPS).
  - **Fortify** — wall max HP (and faster passive regen).
  - **Fire Support** — an active, tappable AoE airstrike on a cooldown.
  - **Repair** — instantly restore the wall to full.
- **Repair-only failure:** if the wall is destroyed you lose no Supply — your Days
  just stall until it's repaired or slowly regenerates. The run never ends.
- **Save/load** to `localStorage` with **calculated offline progress** and a
  **SITREP** on return.

## Tech stack

- **Vite + React + TypeScript** app shell and UI.
- **PixiJS** side-view battlefield renderer (desert sky/dunes/ground, FOB, a
  3-state wall, soldiers, two enemy types, tracers, sprite explosions and an
  airstrike). Art is a bespoke commissioned set in
  `src/assets/sprites/firebase-idle/delivery` (see its `manifest.json`); the
  renderer loads it via a Vite glob, so swapping or extending the set needs no
  code change.
- **Vitest** unit tests on the simulation core.

## Architecture

```
src/
  sim/     Plain-TS simulation core — NO DOM / React / Pixi. Deterministic + tested.
    config.ts     ★ ALL balance numbers (the single tuning file)
    types.ts      SimState: wall, firepower level, fire support, enemies (lane pos)
    combat.ts     ★ single source of truth: firepower/enemy/wall/cost/support formulas
    waves.ts      wave composition + spawning
    engine.ts     step(state, dt, cfg) — the authoritative per-tick simulation
    offline.ts    offline progress (reuses the live engine, headless + coarse dt)
    actions.ts    upgrades, repair, fire support, send wave
    persistence.ts  pure (de)serialization + version gate
  game/    useGameLoop (fixed-timestep loop, UI snapshot, autosave, offline) + storage
  render/sideview/  SideRenderer + canvas + CC0 sprite loader
  ui/      App, TopBar, ControlPanel, Sitrep
```

The simulation is a 1-D model (each enemy's `pos` is its distance to the wall),
so the live game and offline progress run the exact same `step()` — offline just
fast-forwards it headlessly. All balance lives in
[`src/sim/config.ts`](./src/sim/config.ts).

## Scripts

```bash
npm install
npm run dev        # dev server
npm test           # Vitest simulation suite
npm run build      # production build (also runs in CI before deploy)
```

## Deferred (designed for, not built yet)

More enemy types (armor/arty/air) via the `EnemyType` union + per-type config,
more active abilities, multiple walls/fronts, prestige, and bespoke art. The data
model and single-config tuning are shaped so these slot in without rewrites.
