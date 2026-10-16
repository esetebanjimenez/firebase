# Firebase Idle — Art Brief (for AI image generation)

This is the asset list for replacing the placeholder CC0 sprites with real art,
written so you can paste each prompt into an AI image generator (Midjourney,
DALL·E, Stable Diffusion, Ideogram, etc.). The game is a **side-view** mobile
defense game ("Grow Empire" style): a walled position on the left, a horde
advancing from the right that stops and shoots the wall.

Read the **Global rules** first — they're what make generated art usable in an
engine. Then generate the **P0 characters** (biggest visual payoff), then P1, P2.

Filenames are flexible — generate the poses listed and the sprites will be wired
in to match.

---

## Global rules (apply to EVERY asset)

**Style (paste this phrase into every prompt, unchanged, for consistency):**
> flat 2D vector cartoon game art, bold clean dark outlines, soft cel shading,
> slight 3/4 side view, chunky stylized proportions, mobile tower-defense art
> in the style of Clash Royale / Grow Empire, saturated but earthy desert
> palette, crisp and readable at small size

**Technical requirements (non-negotiable for in-engine use):**
- **Transparent background** (PNG with alpha). If the tool can't do alpha,
  render on a **flat solid magenta (#FF00FF) background** so it can be keyed out.
  Do **not** bake a drop shadow — the engine adds shadows.
- **Full side profile, facing RIGHT.** (Enemies are mirrored in code, so draw
  everyone facing right.) No front-facing, no back views.
- **Consistent canvas + pivot across all frames of one character.** Every frame
  of a character must be the **same image size**, with the character's **feet on
  the same baseline** (bottom-center) and the **same horizontal center and
  scale**, so frames don't jitter when swapped. This is the #1 failure mode of
  AI sprite frames — enforce it (same seed / reference image per character).
- **Resolution:** deliver each frame as a **512×512 transparent PNG** (characters
  ~440px tall within it, feet ~24px from the bottom). We downscale in-engine
  (units render ~40–80px tall).
- **Readable silhouette:** recognizable by shape alone. Big weapon, chunky body.

**Palette anchors:**
- Friendly (defenders): desert tan `#CBB185`, olive `#6B7A3A`, clean, blue team
  accent `#4A86C7`, dark outline `#241A10`.
- Enemy (attackers): rust red `#B5432F`, grimy dark `#3A241C`, ragged, red accent
  `#E5533C`. Must read clearly as the opposing, hostile faction.
- Terrain: sand `#B98A4E` / `#8A6436`, dusk sky `#2A3A52` → `#CF9B6A`.

**How to keep a character consistent across frames (important):**
1. Generate one **character reference** first (a clean standing pose) to lock the
   design. 2. For every other pose, feed that image back as a style/character
   reference (Midjourney `--cref`, SD img2img / IP-Adapter, DALL·E "same
   character") and change only the pose. 3. Keep the same style phrase + seed.

---

## P0 — Characters (do these first)

### 1. Friendly Soldier (defender) — faces RIGHT
Modern-military rifleman who mans the wall and fires to the right. Desert
fatigues (tan/olive), helmet, visible rifle. Friendly, heroic, clean.

Poses (4 frames, same canvas/pivot):
- `soldier_idle_1`, `soldier_idle_2` — standing at the ready, slight breathing
  shift between the two (weapon lowered/half-raised).
- `soldier_fire_1` — rifle shouldered, aiming right.
- `soldier_fire_2` — same, firing: muzzle flash + slight recoil kick.

**Prompt:**
> A cartoon modern-military soldier in desert tan-and-olive fatigues and helmet,
> holding an assault rifle, standing in full side profile facing RIGHT, aiming
> his rifle to the right — {flat 2D vector cartoon game art, bold clean dark
> outlines, soft cel shading, slight 3/4 side view, chunky stylized proportions,
> mobile tower-defense art in the style of Clash Royale / Grow Empire, saturated
> but earthy desert palette, crisp and readable at small size} — full body,
> centered, feet at the bottom, transparent background, no shadow.

(Generate the idle and firing variants from the same reference; for `fire_2` add
"firing his rifle with a bright muzzle flash and recoil".)

### 2. Enemy Infantry — Variant A ("Raider") — faces RIGHT (mirrored in game)
Hostile attacker that advances, then halts at a distance and shoots the wall.
Ragged militia look, rust-red and dark, menacing but still toy-soldier cartoon
(no gore). Distinct silhouette from the friendly soldier.

Poses (6 frames, same canvas/pivot):
- `enemyA_walk_1` … `enemyA_walk_4` — a 4-frame walk cycle advancing right.
  (2 frames minimum if 4 is hard.)
- `enemyA_fire_1`, `enemyA_fire_2` — stopped, firing a rifle to the right
  (aim + muzzle-flash frame).
- `enemyA_hit` — recoiling/flinching (used on hit/death).

**Prompt:**
> A cartoon enemy militia fighter in ragged rust-red and dark grimy clothing with
> a rifle, hostile and menacing but toy-soldier style (no gore), full side
> profile facing RIGHT, mid-stride walking right — {STYLE PHRASE} — full body,
> centered, feet at the bottom, transparent background, no shadow.

(Same character reference for walk/fire/hit frames; change only the pose.)

### 3. Enemy Infantry — Variant B ("Heavy/Brute") — faces RIGHT
A second enemy skin for variety: bigger, slower-looking bruiser (heavier build,
maybe a light machine gun or a riot shield). Same hostile palette. Same pose set
as Variant A (`enemyB_walk_1..4`, `enemyB_fire_1/2`, `enemyB_hit`).

**Prompt:** as Variant A but "a large heavy-set enemy brute, broad shoulders,
carrying a bulky machine gun".

---

## P1 — The position (sells the setting)

### 4. The Wall / Barrier — side elevation, 3 damage states
A defensive rampart segment seen from the side (the thing enemies shoot). Sandbags
+ concrete + wood. It has an HP bar drawn above it in-engine, so leave headroom.
Canvas **384×640** transparent PNG, wall standing on the bottom edge (pivot
bottom-center), **facing/readable from the right** (the side enemies attack).

- `wall_intact` — solid, clean, sandbags stacked, a firing step.
- `wall_damaged` — cracked, a few sandbags burst, scorch marks (~50% wrecked).
- `wall_broken` — rubble pile, mostly collapsed (shown when HP hits 0).

**Prompt:**
> A side-view fortified defensive wall segment made of stacked sandbags, concrete
> and wooden beams, a desert firebase rampart, viewed from the side — {STYLE
> PHRASE} — standing on flat ground, centered, transparent background, no shadow.
> (Then: "…pristine and intact" / "…cracked and partially destroyed, burst
> sandbags, scorch marks" / "…collapsed into a rubble pile".)

### 5. FOB / HQ building — side elevation + flag
The home base behind the wall, far left. A sandbag command bunker / HQ with a
flagpole and friendly flag. Canvas **512×640** transparent PNG, sitting on the
ground (pivot bottom-center), reads from the right.

**Prompt:**
> A side-view desert military command bunker / forward operating base: sandbag
> walls, a low concrete HQ, antenna and a flagpole with a blue flag — {STYLE
> PHRASE} — standing on flat ground, centered, transparent background, no shadow.

---

## P2 — Environment & FX (polish; the engine draws passable versions today)

### 6. Background layers (parallax, side-scroll depth)
Wide transparent PNGs, tiling horizontally where noted:
- `bg_sky` — a dusk desert sky gradient, 1024×512 (can be a flat gradient image;
  engine can also do this in code).
- `bg_dunes_far` — distant hazy dune/mountain silhouette band, 1536×256,
  transparent above, tileable horizontally.
- `bg_dunes_near` — nearer dunes, slightly more detail/contrast, 1536×256,
  tileable.
- `ground_tile` — seamless desert sand ground texture, 256×256, tileable in all
  directions (foreground floor the units stand on).

**Prompt (dunes):**
> Seamless side-scrolling parallax layer of distant desert sand dunes at dusk, a
> soft silhouette band, {STYLE PHRASE}, horizontally tileable, transparent sky
> above, no characters.

### 7. FX sprite sheets (transparent frames)
- `explosion` — a chunky cartoon explosion, **6 frames** 256×256 (expanding
  orange/yellow fireball + smoke), for kills and strikes.
- `muzzle_flash` — small bright burst, 1–2 frames, 128×128.
- `dust_impact` — a small dust/debris puff where bullets hit the wall, 2 frames
  128×128.
- `airstrike` (optional) — a big incoming blast for the Fire Support ability,
  6-frame 512×512 sheet.

**Prompt (explosion):**
> A 6-frame cartoon explosion animation sprite sheet on a transparent background,
> chunky stylized orange and yellow fireball expanding into smoke, {STYLE
> PHRASE}, each frame in its own equal cell, laid out in one row.

---

## Delivery checklist

- [ ] Every file a **transparent PNG** (or flat-magenta for keying).
- [ ] Characters all **face right**, **512×512**, **same baseline/scale per
      character**.
- [ ] One consistent **style** across the whole set (reuse the style phrase +
      a locked character reference).
- [ ] Clear team read: friendly = tan/olive/clean, enemy = rust/dark/ragged.
- [ ] Send them over (zip or a folder) and they'll be wired into
      `src/render/assets/` and the sprite loader.

**Minimum viable set to transform the look:** #1 Soldier (4), #2 Enemy A (6),
#4 Wall (3), #5 FOB (1). That alone replaces everything that currently looks
"placeholder." Enemy B, background, and FX can follow.
