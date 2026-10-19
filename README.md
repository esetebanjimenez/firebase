# Iron Line

An 8-bit, top-down **idle incremental defense game**. You command a modern
military force holding the bottom of the map — a wall with a gate in the middle,
towers on the parapet — against three fantasy armies that do not stop coming.

**Play it:** https://esetebanjimenez.github.io/firebase/

Rifles, machine guns, rockets and artillery against levies, knights, battering
rams, golems, wraiths and the necromancers raising more of them.

## The loop

1. **Prep.** Spend credits. The wall gets tougher, the towers hit harder, the
   deployment pool gets deeper and recharges faster, and fire support unlocks
   and levels up. Soldiers improve **one kind at a time**: a Rifleman level
   buys riflemen more hit points, damage and a little speed — and nothing for
   your rocketeers. Every level is **visible on the soldier**: ten rank colours
   cycling across five pieces of earned kit, so the first fifty levels each
   change what walks out of the gate. Enemies wear the same ladder, which is how
   you tell a wave-30 skeleton from a wave-3 one.
2. **Launch.** You decide when the wave comes — nothing starts without you.
   Enemies pour in from the top and head for the wall.
3. **Fight.** Towers shoot what comes into range. Each soldier kind has its own
   button, and pressing one puts that soldier through the gate immediately — a
   charge per rifleman or shield bearer, two for a gunner or a rocketeer.
   Charges come back one at a time, so a wave is a sequence of decisions, not
   one big one. Tap the ground to call in artillery, a mortar barrage, or
   napalm.
4. **Resolve.** Clear the field and the next wave is tougher. Let the wall reach
   0 HP and you re-fight the same wave. Either way **every credit you earned is
   yours** and the wall is rebuilt to full.

Your soldiers charge the nearest enemy, and fall back to the muster point in
mid-field when nothing is left to fight. Enemies charge your soldiers, and press
the wall when there are none — except siege engines, which ignore your soldiers
entirely and drive straight for the wall.

## The three armies

| Army | Shows up | What it does |
| --- | --- | --- |
| **Kingdom Army** | wave 1 | Levies and archers, then armoured knights, battering rams and catapults. A Royal Champion leads the boss waves. |
| **Magical Army** | wave 4 | Imps and casters hurling bolts from range, behind stone golems that soak everything. The Archmage drops splash from across the field. |
| **Necromancer Army** | wave 7 | Endless cheap bodies — skeletons, zombies, ghouls — plus wraiths, and necromancers that raise more skeletons until you kill them. Bone Giants anchor the boss waves. |

From wave 16 on, two armies can attack together. Every tenth wave brings a boss.

## The idle half

- The **garrison earns credits whether you are playing or not**, at a rate that
  compounds with the furthest wave you have cleared.
- Time away is credited when you come back, capped at 8 hours.
- **Auto-deploy** spends charges on your selected soldier kind for you;
  **auto-launch** sends the next wave as soon as you are back in prep. Buy both
  and the run advances while you watch.

## Controls

- **LAUNCH WAVE** — start the wave you have been preparing for.
- **One button per soldier** — pressing it deploys that kind on the spot, for
  the charges shown on the button. Each button carries that kind's own level and
  its own sprite, the same one that walks out of the gate.
- **Ability buttons** — arm fire support, then **press and drag on the field** to
  place the strike and release to call it in.
- **Defense / Troops / Support** tabs — the shop. The Troops tab is where a
  soldier kind takes its next level. Everything is buyable mid-battle too, which
  is often the right move.

## Tech

- **Vite + React + TypeScript**, no game engine and no art assets: the sprites
  are string-art baked into canvases at startup, and the battlefield is one
  `<canvas>` drawn at a 192×240 virtual resolution and upscaled with smoothing
  off.
- **`src/sim/` is pure TypeScript** — no DOM, no React, no renderer. It is the
  whole game: the engine, the roster, the wave planner, the economy. The UI
  renders a snapshot of it; the renderer reads it.
- **Deterministic**: wave plans derive from the seed and the wave number, so the
  "next wave" preview *is* the wave you fight, and a lost wave is a rematch
  rather than a reroll.
- **Saved to `localStorage`**, with the battlefield cleared on save — progress
  lives in credits, levels, unlocks and the wave number.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # the simulation's test suite
npm run typecheck
npm run build      # tsc -b && vite build
```

Balance lives in exactly two files: `src/sim/config.ts` (global curves, field
geometry, abilities, the idle layer) and `src/sim/roster.ts` (per-unit stat
blocks for both sides). `src/sim/__tests__/balance.test.ts` plays the game with
a scripted player and fails if the curve stops making sense.

See [`DESIGN.md`](./DESIGN.md) for the design and the reasoning behind it.
