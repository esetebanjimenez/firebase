# Firebase Idle — High-Level Design

An idle/incremental tower-defense game themed around modern warfare. You command a firebase that holds against endless waves while the threat keeps evolving.

**Core fantasy:** your base holds, but the threat keeps evolving.

---

## Platform & Presentation

- **Target:** mobile browser first; desktop browser as a centered tall column.
- **Orientation:** portrait.
- **Perspective:** top-down with a slight 3/4 angle and tall sprites. Rings read as concentric circles, and air units hover visibly above the ground with drop shadows.
- **Input:** tap-only, no precision dragging. Plays identically on touch and mouse.
- **Layout:**
  - Top half: the firebase, rings centered, waves entering from the edges. Readable without zooming.
  - Bottom half: thumb-reach controls (upgrade tabs, wave forecast, strike buttons).

---

## Art Direction

Simple, colorful pixel art in the spirit of Babel Legacy. Toy-soldier / tabletop-miniature tone: war kept abstract and playful, no gore or real-conflict imagery.

- **Tile size:** 16×16 or 24×24 base tiles; units slightly taller for the 3/4 angle.
- **Rendering:** nearest-neighbor scaling at integer multiples so pixels stay crisp.
- **Palette:** a fixed set of ~16–32 colors.
  - Warm earth tones for terrain; saturated colors reserved for things that need attention.
  - Push brighter than realism (e.g., sandy desert base with vivid accents) so military gear doesn't turn muddy olive and gray.
- **Color as information:**
  - Friendly structures in one hue family (e.g., blues/greens).
  - Enemies in a contrasting family (e.g., reds/oranges).
  - A distinct accent per threat type so infantry, armor, and drones read differently at a glance.
- **Silhouettes:** every unit recognizable by shape alone. Tanks wide and heavy, infantry as small clusters, drones as tiny shapes with shadows beneath.
- **Juice:** chunky oversized explosions, screen shake on big strikes, Supply number pop-ups. Satisfying feedback over detail.

---

## Core Loop

1. Waves arrive on a fixed interval; emplacements auto-fire.
2. Kills earn **Supply**.
3. Supply buys upgrades.
4. Main progress number: **Days Held**. Every 10 days brings a harder wave tier with a boss assault.

### Days Held
- **One resolved wave = one day.** Days Held measures the defense's strength, not just elapsed time.
- Waves spawn on a fixed interval. A **"Send next wave"** button lets strong players speed up, while idle players still progress on the timer.
- Offline progress = time away ÷ wave interval.
- The night cycle (mid game) fits as alternating day and night waves.

### Start of a Run
- **Only the outer ring (wire and mines) is live.** Trenches and bunkers exist but don't fire until built with Supply.
- Building out the base is a core early satisfaction, and the rings are taught one at a time.
- Tuning target: the first trench build is affordable within the first one or two waves. A slow start is fine; a dead start is not.

### Breaches (soft failure)
- An enemy that crosses a held ring **drops that ring**: it stops firing until repaired with Supply.
- **Upgrade levels are kept.** A breach never erases investment.
- If all three rings fall: lose some Supply, Days Held pauses, and the inner ring comes back on its own. The run never ends.
- Repair doubles as a Supply sink, and fallen rings are easy to read visually.

---

## Early Game

- **Defensive rings**, each with its own upgrade track:
  - Outer: wire and mines
  - Middle: trenches and machine guns
  - Inner: bunkers and mortars
- **Counter-matching:** different wave types stress different rings and require different counters.
  - Infantry → machine guns
  - Armor → ATGMs
  - Drones → air defense (arrives later)
- **Active play (optional):** artillery and airstrike call-ins on cooldown. Speeds up early progress before automation takes over.

## Mid Game

- **Resupply:** convoys and helicopters deliver Supply on a timer. Main idle-income lever.
- **Recon:** spend **Intel** to see further into the wave forecast and pre-build counters. Shifts play from reacting to planning.
- **Day/night cycle:** alternating day and night waves; night waves get stealth bonuses until thermals and illumination rounds are unlocked.
- **Auto-repair:** engineers slowly restore fallen rings without spending Supply manually.

## Late Game

All late-game twists **add new layers** on top of existing systems. They do not invalidate earlier builds.

- **Drone era:** a new air layer of cheap drone swarms, countered by jammers, cheap interceptors, and electronic warfare.
- **Forward operating bases:** deploy additional firebases outward. Several bases share one supply pool; the game grows from one base into a network.
- **Counter-battery duel:** enemy artillery targets emplacements directly. Requires radar and counter-fire.
- **Offensive raids:** surplus Supply funds raids on enemy staging areas, thinning future waves.

---

## Prestige: Rotation

- Rotating out resets the run and awards **Veterancy**.
- Veterancy buys permanent perks: faster build times, starting rings, commander unlocks.
- **Commanders** give each run its own flavor:
  - Engineer: cheap fortifications, faster repairs and auto-repair
  - Artillery officer: strong strikes
  - EW specialist: early drone counters
- Commanders could share a universe with Battlepack's generals.

---

## Technical Direction

- **UI layer:** React (same stack as Battlepack: TanStack Start, deployed on Vercel).
- **Battlefield renderer:** a canvas renderer inside the React app.
  - PixiJS: lightweight sprites and effects.
  - Phaser: more built in (scenes, tweens, particles), larger bundle.
- **Simulation:** plain TypeScript, separate from rendering, so offline progress can reuse the same logic.
- **Offline progress:** calculated, not simulated, since browsers suspend background tabs.
  - Save a timestamp; compute results on return (waves resolved = time away ÷ wave interval).
  - Show a **SITREP** screen with days held, supply earned, and any fallen rings to repair.
  - Use a simplified "holds or falls back" model rather than replaying waves.
- **Saves:** localStorage or IndexedDB, plus an export/import save string as a backup against wiped browser data.
- **PWA:** support add-to-home-screen so it feels like an app.
- **Performance:** drone swarms are the heaviest moment on low-end phones. Use pooled sprites and cap visible units (e.g., 50 shown, 300 counted).

---

## Open Questions

- Resource and upgrade economy: costs, scaling curves, number of currencies.
- Wave and enemy roster: unit types, tier progression, boss designs.
- Unlock pacing: when each mid- and late-game system arrives.
- Prestige math: Veterancy earn rate and perk costs.
- Final palette and tile size (16×16 vs 24×24).
- Shared universe with Battlepack: lore and commander overlap, if any.
