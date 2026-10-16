# Firebase Idle

A mobile-browser idle tower-defense game with a modern-military theme. You
command a firebase that holds against endless waves. This repository is the
**first playable vertical slice** — see [`DESIGN.md`](./DESIGN.md) for the full
game vision.

## What's in the slice

- One firebase with **three concentric defensive rings** — outer (wire & mines),
  middle (trenches & MGs), inner (bunkers & mortars). Only the outer ring is live
  at the start; the others are built with Supply.
- **Infantry waves** on a fixed timer, plus a **Send next wave** button.
- **Days Held** as the main progress counter (one resolved wave = one day).
- **Supply** earned per kill; spent on ring upgrades and repairs.
- **Soft failure:** an enemy crossing a ring breaches it (it stops firing until
  repaired, keeping its upgrade level). An enemy reaching the core is a full
  breach — lose some Supply, Days Held pauses, and the innermost built ring
  self-restores. The run never ends.
- **Save/load** to `localStorage` and **calculated offline progress** with a
  **SITREP** screen on return.
- Portrait layout: battlefield on top, thumb-reach controls on the bottom.

## Tech stack

- **Vite + React + TypeScript** for the app shell and UI.
- **PixiJS** for the battlefield canvas renderer — a thin WebGL sprite layer that
  just draws the simulation's state. (Chosen over Phaser: our sim owns the game
  loop already, so Phaser's scene/physics/tween machinery would overlap and bloat
  the bundle for a mobile-first game.)
- **Vitest** for unit tests on the simulation core.

Placeholder art is colored shapes; `src/render/sprites.ts` is a swappable factory
so pixel-art textures drop in later without touching game logic.

## Architecture

```
src/
  sim/     Plain-TS simulation core — NO DOM / React / Pixi. Deterministic + unit-tested.
    config.ts     ★ ALL balance numbers (the single tuning file)
    types.ts      SimState data model (extensible unions for future enemies/rings)
    rng.ts        seeded deterministic PRNG (state carried in SimState)
    combat.ts     ★ single source of truth: ring DPS, enemy HP, wave size, costs
    waves.ts      wave composition + spawning
    engine.ts     step(state, dt, cfg) — the authoritative per-tick simulation
    offline.ts    calculated offline progress (reuses combat.ts formulas)
    actions.ts    player transitions: buyUpgrade / repairRing / sendNextWave
    persistence.ts  pure (de)serialization + save migration
  game/    Glue between sim and React/Pixi
    useGameLoop.ts  fixed-timestep loop, UI snapshot, autosave, offline on load
    storage.ts      localStorage wrapper (never throws)
  render/  PixiJS battlefield
    BattlefieldCanvas.tsx / renderer.ts / sprites.ts
  ui/      React UI (portrait shell, top bar, control panel, SITREP)
```

**Key architectural rule:** the simulation core is pure TypeScript with no
rendering or DOM dependencies, so the exact same logic powers both live play and
offline progress. Live play steps the engine per frame from a fixed-timestep
accumulator; offline progress is a closed-form resolver (the design doc's
"calculated, not simulated" model), but both derive every number from the shared
`combat.ts` formulas, so they can't drift apart.

## Tuning

All balance lives in [`src/sim/config.ts`](./src/sim/config.ts): wave interval and
sizes, enemy HP/speed/bounty scaling, per-ring DPS, upgrade/repair cost curves,
breach penalties, and the offline wave cap. A `weapon × enemy` effectiveness
matrix (all `1.0` for the slice) is the hook for later counter-matching
(armor → ATGM, drones → air defense) with no engine changes.

## Scripts

```bash
npm install
npm run dev        # dev server
npm test           # run the Vitest simulation suite
npm run typecheck  # tsc project check
npm run build      # production build
npm run preview    # serve the production build
```

## Deferred (designed for, not built yet)

Armor/drones and counter-matching, night cycle, recon/Intel, resupply convoys,
auto-repair, FOBs, counter-battery, offensive raids, active artillery/airstrikes,
prestige/Veterancy, commanders, PWA install, and an export/import save string.
The data model (string-union enemy/ring types, per-type config, a single Supply
pool behind `actions.ts`, save `version` migrations) is shaped so these slot in
without rewrites.
