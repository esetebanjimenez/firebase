# Firebase Idle — Isometric Art Brief (for AI image generation)

Goal: re-skin the game in a **2:1 isometric 3/4 view** (the "Grow Empire: Rome"
look) instead of the current flat side-on set. This is an *art-projection*
change — every asset must be drawn at one shared isometric camera angle so the
pieces composite into a coherent battlefield.

Keep the **modern-military faction** (desert soldier vs. raider vs. heavy brute —
same characters as today, just re-drawn for the iso angle). Terrain is a **green
grassy battlefield** (GER-style), not desert.

Deliver the same way as the last set: a `delivery/` folder of transparent PNGs
plus a `manifest.json` listing each `file` + `size`. Filenames below are the
targets; I'll wire the renderer to them.

---

## Global rules (apply to EVERY asset — this is what makes iso work)

**Projection & camera (paste into every prompt):**
> true 2:1 isometric game art (classic dimetric, ~30° camera tilt looking down),
> flat 2D vector cartoon style, bold clean dark outlines, soft cel shading,
> chunky stylized proportions, mobile strategy art in the style of Grow Empire /
> Clash of Clans, saturated but natural palette, crisp at small size

**Hard requirements:**
- **One shared isometric angle** for everything (tiles, buildings, walls,
  characters). If assets are drawn at different angles they won't line up.
- **Light from the top-left**, consistent across all assets (so shading matches).
- **Transparent background** (PNG alpha). If the tool can't, use flat magenta
  `#FF00FF` for keying. **No baked ground shadow** — the engine adds contact
  shadows (a soft shadow *on* a tile is fine for buildings; characters: none).
- **Consistent canvas + pivot per category** (sizes below). Pivot notes matter
  for placing assets on the iso grid.
- **Characters face screen front-right (down-right / "south-east")** in 3/4 —
  the engine mirrors them to face down-left for the opposing side. All frames of
  a character share one canvas, scale and foot position (lock a reference first).
- **Palette:** friendly = desert tan + olive, blue team accent, clean; enemies =
  rust-red / dark / ragged (raider) and red-armor orc-green (brute). Grass =
  natural greens with dirt/path browns.

**Consistency workflow:** generate one reference per character/structure, then
feed it back (Midjourney `--cref`, SD img2img / IP-Adapter, DALL·E "same …") for
every other frame/state; keep the same seed + the projection phrase.

---

## P0 — Isometric terrain tiles

Diamond tiles for a **2:1 iso grid**. Canvas **256×128** (a 2:1 diamond; the art
fills the diamond, corners transparent). Must tile seamlessly when laid in an iso
grid. Pivot = the diamond's center.

- `tile_grass` — lush green grass (the default field).
- `tile_grass_2` — a grass variant (subtle patches/flowers) to break repetition.
- `tile_dirt` — packed dirt / worn path.
- `tile_rock` — rocky/rubble ground (near the wall).
- *(optional)* `tile_water` + `tile_water_edge_n/e/s/w` — a stream and its four
  bank edges, GER's river. Nice-to-have.

**Prompt:**
> A single seamless 2:1 isometric ground tile of lush green grass, diamond
> shaped, {PROJECTION PHRASE}, top-down 3/4, tileable on an isometric grid,
> transparent corners, no objects.

## P0 — Scatter props (small iso decor, loose on the grass)

Transparent PNGs ~**128×128**, pivot bottom-center (they sit on a tile).
- `prop_tree_1`, `prop_tree_2` — stylized iso trees.
- `prop_bush`, `prop_rock`, `prop_grass_tuft` — small filler.
- *(optional)* `prop_bridge` — a short wooden bridge spanning the stream.

---

## P1 — Isometric structures (3/4 boxes — you see the top + two faces)

All drawn on the **same iso grid**, light top-left, pivot = **bottom-center of
the footprint** (the tile the piece stands on). The wall runs along one iso axis
(lower-left ↔ upper-right).

### The wall is ONE cohesive sprite (not tiled segments)

The renderer draws the whole rampart as a **single piece** so it reads as one
continuous structure with no seams — the gate and the end tower are **baked into
the art**. (The engine detects `wall_line_intact`; if it's absent it falls back
to the old tiled segments below. Placeholder `wall_line_*` ship now — replace
them with the real art at the same filenames/canvas and it just works.)

- **Wall line, 3 states** — one long iso rampart (stacked sandbags + concrete +
  timber), running lower-left → upper-right, with a **reinforced gate in the
  middle** and a **tall guard tower capping the upper-right end**. Canvas
  **1280×512**, pivot **bottom-center**, light top-left, transparent bg.
  - `wall_line_intact`, `wall_line_damaged` (cracked, scorched, partly slumped),
    `wall_line_broken` (collapsed into a low rubble line on the **same footprint**;
    the tower may survive, battered).
  - Note on rise: at true 2:1 a full-width wall would climb more than 512px, so
    frame it with a **gentler rise** (≈300px over the 1280 width) and let the art
    carry the perspective — the engine scales it by width and anchors it at the
    base, it does not force a 2:1 slope on this sprite.
  - Note on framing: the engine spans the wall across the whole viewport and
    overhangs the left edge, so draw the **near (lower-left) end reaching the
    canvas's left edge** (minimal transparent margin there) — the rampart should
    look like it runs off-screen — with the **tower capping the far (upper-right)
    end** inside the canvas.
- `fob` — the HQ keep behind the wall: a sandbag command bunker with antenna and
  a blue flag, iso 3/4, ~2×2 tile footprint. Canvas **512×512**.

**Prompt (wall line):**
> A single long 2:1 isometric fortification rampart running from lower-left to
> upper-right — stacked sandbags, concrete blocks and timber bracing, a reinforced
> gate in the middle and a tall guard tower capping the upper-right end,
> {PROJECTION PHRASE}, you see the top walkway and the front face, standing on flat
> ground, transparent background, pivot at the base. (Then "pristine" / "cracked,
> scorched, partly destroyed" / "collapsed into a low rubble line on the same
> footprint".)

### Fallback — tiled wall segments (optional, only if you don't do the line)

- **Wall segment, 3 states** — a straight iso rampart section, tileable end-to-end.
  Canvas **256×384**: `wall_intact`, `wall_damaged`, `wall_broken`.
- `wall_tower` — taller guard tower capping the ends. Canvas **256×448**.
- `wall_gate` — a gate segment. Canvas **256×384**.

(These are what the current set delivered; the delivered segment art is not a
clean seamless tile, which is why the single `wall_line_*` sprite is preferred.)

---

## P2 — Characters (3/4 iso, facing front-right)

Canvas **256×256**, character ~210px tall, **feet ~16px above the bottom**
(bottom-center pivot). **3/4 view facing screen front-right (down-right)**; the
engine mirrors for down-left. All frames of a character share canvas/scale/foot
position. Light top-left.

For each of **soldier** (friendly), **enemyA** (raider), **enemyB** (heavy
brute) — same roster and palette as the current set, re-drawn at the iso angle:
- `*_idle_1`, `*_idle_2` — standing/ready, slight breathing shift.
- `*_walk_1`…`*_walk_4` — walk cycle advancing down-right.
- `*_fire_1`, `*_fire_2` — stopped, firing toward lower-right (`_2` adds a muzzle
  flash).
- `*_hit` — flinch/death.

Filenames: `soldier_idle_1`, …, `enemyA_walk_1`, …, `enemyB_fire_2`, etc. (The
soldier only needs idle + fire; enemies need the full walk/fire/hit set.)

**Prompt (soldier):**
> A cartoon modern-military soldier in desert tan-and-olive fatigues and helmet,
> blue armband, holding an assault rifle, drawn in 2:1 isometric 3/4 view facing
> front-right (down-right), standing on the ground — {PROJECTION PHRASE} — full
> body, centered, feet near the bottom, transparent background, no shadow.

---

## Reuse from the current set (no need to regenerate)

The existing **FX** read fine at any angle — keep using them:
`explosion_1..6`, `airstrike_1..6`, `muzzle_flash_1..2`, `dust_impact_1..2`.
Drop them into the new `delivery/` unchanged (or leave them where they are).

---

## Delivery checklist

- [ ] Every file a transparent PNG at the sizes above (or flat-magenta to key).
- [ ] **One shared 2:1 isometric angle + top-left light** across the whole set.
- [ ] Tiles tile seamlessly on the iso grid; structures/characters pivot at the
      base; characters all face front-right with a locked per-character canvas.
- [ ] `delivery/` + `manifest.json` (file + size per asset), same as last time.

**Minimum set to flip to iso:** `tile_grass` (+1 variant), `tile_dirt`,
`wall_intact/damaged/broken`, `fob`, and the three characters' frames. Towers,
gate, water, trees and extra props can follow.

---

### Note on the engine side (my job, after the art lands)
I'll rebuild the renderer onto an isometric grid: project tile (col,row) →
screen with the 2:1 transform, lay the ground, place the wall along one iso axis
with the FOB as the keep, march enemies down the lane toward it, and depth-sort
everything by tile so near objects overlap far ones. The simulation and balance
don't change — only how the same `SimState` is drawn.
