#!/usr/bin/env python3
"""Pack keyed Firebase Idle frames onto the art-brief canvases."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path("/workspace/assets/sprites/firebase-idle")
ART = Path("/workspace/artifacts/imagine_images")
OUT = ROOT / "delivery"


def despill(im: Image.Image) -> Image.Image:
    a = np.array(im.convert("RGBA")).astype(np.int16)
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    excess = np.minimum(r, b) - g
    halo = (al > 0) & (excess > 24)
    cut = np.clip(excess - 12, 0, 255)
    r = np.where(halo, np.clip(r - cut, 0, 255), r)
    b = np.where(halo, np.clip(b - cut, 0, 255), b)
    # Strong magenta halos become transparent instead of gray crumbs.
    kill = (al > 0) & (excess > 70) & (g < 80)
    al = np.where(kill, 0, al)
    out = np.dstack([r, g, b, al]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def metrics(im: Image.Image) -> dict | None:
    a = np.array(im.convert("RGBA"))
    al = a[:, :, 3]
    ys, xs = np.where(al > 16)
    if len(xs) == 0:
        return None
    top, bot = int(ys.min()), int(ys.max())
    left, right = int(xs.min()), int(xs.max())
    span = max(1, bot - top)
    cut = bot - max(3, int(span * 0.08))
    fxs = xs[ys >= cut]
    foot_x = float(np.median(fxs))
    y0 = top + 0.28 * span
    y1 = top + 0.70 * span
    mxs = xs[(ys >= y0) & (ys <= y1)]
    if len(mxs) < 10:
        torso = float(right - left)
        anchor_x = foot_x
    else:
        torso = float(np.percentile(mxs, 90) - np.percentile(mxs, 10))
        anchor_x = float(np.median(mxs))
    return {
        "top": top,
        "bot": bot,
        "left": left,
        "right": right,
        "foot_x": anchor_x,
        "h": bot - top + 1,
        "torso": max(8.0, torso),
    }


def place_feet(
    im: Image.Image,
    scale: float,
    canvas: int = 512,
    foot_y: int = 488,
    center_x: int = 256,
) -> Image.Image:
    im = im.convert("RGBA")
    nw = max(1, int(round(im.width * scale)))
    nh = max(1, int(round(im.height * scale)))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    m = metrics(im)
    sheet = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    if m is None:
        return sheet
    paste_x = int(round(center_x - m["foot_x"]))
    paste_y = int(round(foot_y - m["bot"]))
    sheet.alpha_composite(im, (paste_x, paste_y))
    return sheet


def opaque_bounds(im: Image.Image) -> tuple[int, int, int, int] | None:
    a = np.array(im.convert("RGBA"))
    ys, xs = np.where(a[:, :, 3] > 12)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def clips(im: Image.Image, margin: int = 2) -> bool:
    b = opaque_bounds(im)
    if b is None:
        return False
    x0, y0, x1, y1 = b
    w, h = im.size
    return x0 < margin or y0 < margin or x1 > w - margin or y1 > h - margin


def fit_character_set(frames: list[Image.Image], target_h: int) -> tuple[list[Image.Image], float]:
    """One scale for the whole set so standing height lands near target_h."""
    ref = metrics(frames[0])
    if ref is None:
        return frames, 1.0
    scale = target_h / ref["h"]
    placed = [place_feet(im, scale) for im in frames]
    for _ in range(8):
        if not any(clips(p) for p in placed):
            break
        scale *= 0.94
        placed = [place_feet(im, scale) for im in placed]
    return placed, scale


def match_scale(frames: list[Image.Image], ref_torso: float, ref_h: float, target_h: int) -> list[Image.Image]:
    """Match torso thickness to the reference sheet, then hit target height."""
    torsos = [metrics(im)["torso"] for im in frames if metrics(im)]
    heights = [metrics(im)["h"] for im in frames if metrics(im)]
    torso = float(np.median(torsos))
    height = float(np.median(heights))
    # Torso match relative to how tall the reference reads.
    scale = (ref_torso / torso) * (target_h / ref_h)
    # If torso match would wildly change height, trust height more.
    predicted_h = height * scale
    if predicted_h > target_h * 1.18 or predicted_h < target_h * 0.82:
        scale = target_h / height
    placed = [place_feet(im, scale) for im in frames]
    for _ in range(8):
        if not any(clips(p) for p in placed):
            break
        scale *= 0.94
        placed = [place_feet(im, scale) for im in placed]
    return placed


def gun_tip(im: Image.Image) -> tuple[int, int] | None:
    a = np.array(im.convert("RGBA"))
    al = a[:, :, 3]
    ys, xs = np.where(al > 40)
    if len(xs) == 0:
        return None
    top, bot = int(ys.min()), int(ys.max())
    span = max(1, bot - top)
    # Barrel sits anywhere on the forward half, including a low machine-gun.
    y0 = top + 0.12 * span
    y1 = top + 0.82 * span
    mask = (ys >= y0) & (ys <= y1)
    if not np.any(mask):
        return int(xs.max()), int(np.median(ys))
    sel_x = xs[mask]
    sel_y = ys[mask]
    i = int(np.argmax(sel_x))
    return int(sel_x[i]), int(sel_y[i])


def add_muzzle(body: Image.Image, flash: Image.Image) -> Image.Image:
    tip = gun_tip(body)
    if tip is None:
        return body
    flash = flash.convert("RGBA")
    b = opaque_bounds(flash)
    if b:
        flash = flash.crop(b)
    flash.thumbnail((78, 78), Image.Resampling.LANCZOS)
    sheet = body.copy()
    px = tip[0] - flash.width // 2 + 6
    py = tip[1] - flash.height // 2
    # Clip the flash to the canvas instead of letting a long barrel push it off.
    canvas = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
    tmp = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
    tmp.paste(flash, (px, py))
    canvas.alpha_composite(tmp)
    sheet.alpha_composite(canvas)
    return sheet


def key_top_color(path: Path, tol: float = 46, feather: float = 36) -> Image.Image:
    im = Image.open(path).convert("RGB")
    a = np.array(im).astype(np.int16)
    bg = np.median(a[:12, :, :].reshape(-1, 3), axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    alpha = np.clip((dist - tol) / max(1.0, feather), 0.0, 1.0)
    alpha[dist < tol] = 0
    rgba = np.dstack([np.array(im), (alpha * 255).astype(np.uint8)])
    return Image.fromarray(rgba, "RGBA")


def largest_component(im: Image.Image, min_area: int = 80) -> Image.Image:
    a = np.array(im.convert("RGBA"))
    alpha = a[:, :, 3] > 16
    h, w = alpha.shape
    seen = np.zeros_like(alpha, dtype=bool)
    best = None
    best_area = 0
    # Flood fill on a downscaled mask would be faster; images are modest.
    ys, xs = np.where(alpha)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if seen[y, x]:
            continue
        stack = [(y, x)]
        seen[y, x] = True
        cells = []
        while stack:
            cy, cx = stack.pop()
            cells.append((cy, cx))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < h and 0 <= nx < w and alpha[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(cells) > best_area:
            best_area = len(cells)
            best = cells
        if best_area > min_area and len(cells) < min_area:
            continue
    if not best or best_area < min_area:
        return im
    keep = np.zeros((h, w), dtype=bool)
    yy, xx = zip(*best)
    keep[np.array(yy), np.array(xx)] = True
    a[:, :, 3] = np.where(keep, a[:, :, 3], 0)
    return Image.fromarray(a, "RGBA")


def fit_bottom(
    im: Image.Image,
    size: tuple[int, int],
    scale: float,
    bottom_margin: int = 8,
) -> Image.Image:
    im = im.convert("RGBA")
    nw = max(1, int(round(im.width * scale)))
    nh = max(1, int(round(im.height * scale)))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    m = opaque_bounds(im)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    if m is None:
        return canvas
    x0, y0, x1, y1 = m
    content_w = x1 - x0
    paste_x = (size[0] - content_w) // 2 - x0
    paste_y = size[1] - bottom_margin - y1
    canvas.alpha_composite(im, (paste_x, paste_y))
    return canvas


def make_seamless(im: Image.Image, band: int = 36) -> Image.Image:
    """Roll the seams to the middle and blur only that cross, then roll back."""
    from PIL import ImageFilter

    rgb = im.convert("RGB")
    w, h = rgb.size
    rolled = Image.fromarray(np.roll(np.roll(np.array(rgb), h // 2, 0), w // 2, 1))
    blurred = np.array(rolled.filter(ImageFilter.GaussianBlur(radius=7))).astype(np.float32)
    base = np.array(rolled).astype(np.float32)
    yy = np.abs(np.arange(h) - h // 2)[:, None]
    xx = np.abs(np.arange(w) - w // 2)[None, :]
    wy = np.clip(1.0 - yy / band, 0.0, 1.0)
    wx = np.clip(1.0 - xx / band, 0.0, 1.0)
    weight = np.maximum(wy, wx).astype(np.float32)
    out = base * (1.0 - weight[..., None]) + blurred * weight[..., None]
    out = np.roll(np.roll(out, -(h // 2), 0), -(w // 2), 1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")


def tile_horizontal(im: Image.Image, overlap_frac: float = 0.14) -> Image.Image:
    arr = np.array(im.convert("RGBA")).astype(np.float32)
    h, w, _ = arr.shape
    ov = max(8, int(w * overlap_frac))
    t = np.linspace(0.0, 1.0, ov, dtype=np.float32).reshape(1, ov, 1)
    left = arr[:, :ov]
    wrapped = arr[:, -ov:][:, ::-1]
    la = left[:, :, 3:4] / 255.0
    wa = wrapped[:, :, 3:4] / 255.0
    alpha = wa * (1.0 - t) + la * t
    color = (wrapped[:, :, :3] * wa * (1.0 - t) + left[:, :, :3] * la * t) / np.maximum(alpha, 1e-4)
    out = arr.copy()
    out[:, :ov, :3] = color
    out[:, :ov, 3:4] = alpha * 255.0
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def row_strip(frames: list[Image.Image], label: str) -> Image.Image:
    w = sum(f.width for f in frames)
    h = max(f.height for f in frames)
    sheet = Image.new("RGBA", (w, h + 28), (28, 24, 20, 255))
    x = 0
    for frame in frames:
        sheet.alpha_composite(frame, (x, 28))
        x += frame.width
    draw = ImageDraw.Draw(sheet)
    draw.text((8, 6), label, fill=(236, 226, 206, 255))
    return sheet


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    soldier_idle = [despill(Image.open(ROOT / f"soldier/idle/idle-{i}.png")) for i in (1, 2)]
    soldier_fire = [despill(Image.open(ROOT / f"soldier/shoot/shoot-{i}.png")) for i in (1, 2)]
    enemy_a_walk = [despill(Image.open(ROOT / f"enemy-a/walk/walk-{i}.png")) for i in range(1, 5)]
    enemy_a_fire = [despill(Image.open(ROOT / f"enemy-a/shoot/shoot-{i}.png")) for i in (1, 2)]
    enemy_a_hit = [despill(Image.open(ROOT / "enemy-a/hit/clean.png"))]
    enemy_b_walk = [despill(Image.open(ROOT / f"enemy-b/walk/walk-{i}.png")) for i in range(1, 5)]
    enemy_b_fire = [despill(Image.open(ROOT / f"enemy-b/shoot/shoot-{i}.png")) for i in (1, 2)]
    enemy_b_hit = [despill(Image.open(ROOT / "enemy-b/hit/clean.png"))]

    soldier_idle_p, s_scale = fit_character_set(soldier_idle, 440)
    ref_m = metrics(soldier_idle[0])
    assert ref_m is not None
    soldier_fire_p = match_scale(soldier_fire, ref_m["torso"], ref_m["h"], 440)

    a_ref = metrics(enemy_a_walk[0])
    assert a_ref is not None
    enemy_a_walk_p, _ = fit_character_set(enemy_a_walk, 440)
    enemy_a_fire_p = match_scale(enemy_a_fire, a_ref["torso"], a_ref["h"], 440)
    enemy_a_hit_p, _ = fit_character_set(enemy_a_hit, 414)

    b_ref = metrics(enemy_b_walk[0])
    assert b_ref is not None
    enemy_b_walk_p, _ = fit_character_set(enemy_b_walk, 460)
    enemy_b_fire_p = match_scale(enemy_b_fire, b_ref["torso"], b_ref["h"], 460)
    enemy_b_hit_p, _ = fit_character_set(enemy_b_hit, 430)

    flash = despill(Image.open(ROOT / "fx/muzzle/fx-1.png"))
    soldier_fire_p[1] = add_muzzle(soldier_fire_p[1], flash)
    enemy_a_fire_p[1] = add_muzzle(enemy_a_fire_p[1], flash)
    enemy_b_fire_p[1] = add_muzzle(enemy_b_fire_p[1], flash)

    named = {
        "soldier_idle_1.png": soldier_idle_p[0],
        "soldier_idle_2.png": soldier_idle_p[1],
        "soldier_fire_1.png": soldier_fire_p[0],
        "soldier_fire_2.png": soldier_fire_p[1],
        "enemyA_walk_1.png": enemy_a_walk_p[0],
        "enemyA_walk_2.png": enemy_a_walk_p[1],
        "enemyA_walk_3.png": enemy_a_walk_p[2],
        "enemyA_walk_4.png": enemy_a_walk_p[3],
        "enemyA_fire_1.png": enemy_a_fire_p[0],
        "enemyA_fire_2.png": enemy_a_fire_p[1],
        "enemyA_hit.png": enemy_a_hit_p[0],
        "enemyB_walk_1.png": enemy_b_walk_p[0],
        "enemyB_walk_2.png": enemy_b_walk_p[1],
        "enemyB_walk_3.png": enemy_b_walk_p[2],
        "enemyB_walk_4.png": enemy_b_walk_p[3],
        "enemyB_fire_1.png": enemy_b_fire_p[0],
        "enemyB_fire_2.png": enemy_b_fire_p[1],
        "enemyB_hit.png": enemy_b_hit_p[0],
    }

    # Walls share the source pixel scale so rubble stays shorter than the intact rampart.
    wall_raw = {
        "wall_intact.png": largest_component(despill(key_top_color(ART / "fd9398bd-4842-497f-8dc0-c879dfa68835.jpg"))),
        "wall_damaged.png": largest_component(despill(key_top_color(ART / "65348c5c-e5a9-4bbe-8709-28de682c0d8c.jpg"))),
        "wall_broken.png": largest_component(despill(key_top_color(ART / "4cc779e1-7b60-47ba-8024-9994a4f08c4f.jpg"))),
    }
    intact_b = opaque_bounds(wall_raw["wall_intact.png"])
    assert intact_b is not None
    intact_h = intact_b[3] - intact_b[1]
    intact_w = intact_b[2] - intact_b[0]
    wall_scale = min((384 - 36) / intact_w, (640 - 110) / intact_h)
    for name, im in wall_raw.items():
        named[name] = fit_bottom(im, (384, 640), wall_scale, bottom_margin=10)

    fob = largest_component(despill(key_top_color(ART / "51e90e34-3cf3-45a5-80fa-770f141b7fe5.jpg")))
    fb = opaque_bounds(fob)
    assert fb is not None
    fob_scale = min((512 - 40) / (fb[2] - fb[0]), (640 - 80) / (fb[3] - fb[1]))
    named["fob.png"] = fit_bottom(fob, (512, 640), fob_scale, bottom_margin=12)

    # FX: whole processed cells already share a scale. Just resize.
    def cell_resize(src: Path, size: int) -> Image.Image:
        im = despill(Image.open(src))
        return im.resize((size, size), Image.Resampling.LANCZOS)

    for i in range(1, 7):
        named[f"explosion_{i}.png"] = cell_resize(ROOT / f"fx/explosion/explosion-{i}.png", 256)
        named[f"airstrike_{i}.png"] = cell_resize(ROOT / f"fx/airstrike/airstrike-{i}.png", 512)
    named["muzzle_flash_1.png"] = cell_resize(ROOT / "fx/muzzle/fx-1.png", 128)
    named["muzzle_flash_2.png"] = cell_resize(ROOT / "fx/muzzle/fx-2.png", 128)
    named["dust_impact_1.png"] = cell_resize(ROOT / "fx/dust/fx-1.png", 128)
    named["dust_impact_2.png"] = cell_resize(ROOT / "fx/dust/fx-3.png", 128)

    expl_sheet = Image.new("RGBA", (256 * 6, 256), (0, 0, 0, 0))
    air_sheet = Image.new("RGBA", (512 * 6, 512), (0, 0, 0, 0))
    for i in range(6):
        expl_sheet.alpha_composite(named[f"explosion_{i+1}.png"], (i * 256, 0))
        air_sheet.alpha_composite(named[f"airstrike_{i+1}.png"], (i * 512, 0))
    named["explosion_sheet.png"] = expl_sheet
    named["airstrike_sheet.png"] = air_sheet

    # Backgrounds.
    sky = Image.open(ART / "ba049012-470b-45bb-9c0f-b5e3bd8ece06.jpg").convert("RGB")
    sw, sh = sky.size
    crop_w = int(sh * 2)
    left = max(0, (sw - crop_w) // 2)
    sky = sky.crop((left, 0, left + crop_w, sh)).resize((1024, 512), Image.Resampling.LANCZOS)
    named["bg_sky.png"] = sky

    def dune_band(path: Path, tol: float) -> Image.Image:
        keyed = key_top_color(path, tol=tol, feather=42)
        b = opaque_bounds(keyed)
        assert b is not None
        crop = keyed.crop((0, b[1], keyed.width, keyed.height))
        crop = tile_horizontal(crop, overlap_frac=0.16)
        scale = 1536 / crop.width
        nh = max(1, int(round(crop.height * scale)))
        tiled = crop.resize((1536, nh), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (1536, 256), (0, 0, 0, 0))
        if nh > 256:
            tiled = tiled.crop((0, nh - 256, 1536, nh))
            nh = 256
        canvas.alpha_composite(tiled, (0, 256 - nh))
        return canvas

    named["bg_dunes_far.png"] = dune_band(ART / "4923bc61-9249-4a3a-9016-898b1985f258.jpg", tol=52)
    named["bg_dunes_near.png"] = dune_band(ART / "299f1fba-c402-4692-a886-058a447dacb0.jpg", tol=58)

    ground = Image.open(ART / "508dc56a-a580-4c70-bb7b-51b85c51514c.jpg").convert("RGB")
    ground = ground.resize((256, 256), Image.Resampling.LANCZOS)
    ground = make_seamless(ground, band=34)
    named["ground_tile.png"] = ground

    record = []
    for name, im in named.items():
        path = OUT / name
        im.save(path, "PNG")
        record.append({"file": name, "size": list(im.size), "mode": im.mode})

    # QC boards on a flat dusk ground so transparent pixels stay readable.
    def board(groups: list[tuple[str, list[Image.Image]]]) -> Image.Image:
        rows = []
        width = 0
        for label, frames in groups:
            strip = row_strip(frames, label)
            rows.append(strip)
            width = max(width, strip.width)
        height = sum(r.height for r in rows)
        sheet = Image.new("RGBA", (width, height), (42, 36, 28, 255))
        y = 0
        for strip in rows:
            sheet.alpha_composite(strip, (0, y))
            y += strip.height
        return sheet

    chars = board(
        [
            ("soldier idle / fire", [named[n] for n in (
                "soldier_idle_1.png", "soldier_idle_2.png", "soldier_fire_1.png", "soldier_fire_2.png"
            )]),
            ("raider walk / fire / hit", [named[n] for n in (
                "enemyA_walk_1.png", "enemyA_walk_2.png", "enemyA_walk_3.png", "enemyA_walk_4.png",
                "enemyA_fire_1.png", "enemyA_fire_2.png", "enemyA_hit.png",
            )]),
            ("brute walk / fire / hit", [named[n] for n in (
                "enemyB_walk_1.png", "enemyB_walk_2.png", "enemyB_walk_3.png", "enemyB_walk_4.png",
                "enemyB_fire_1.png", "enemyB_fire_2.png", "enemyB_hit.png",
            )]),
        ]
    )
    chars.save(OUT / "_qc_characters.png")

    props = board(
        [
            ("wall + fob", [named["wall_intact.png"], named["wall_damaged.png"], named["wall_broken.png"], named["fob.png"]]),
        ]
    )
    props.save(OUT / "_qc_props.png")

    fx = board(
        [
            ("explosion", [named[f"explosion_{i}.png"] for i in range(1, 7)]),
            ("airstrike", [named[f"airstrike_{i}.png"].resize((256, 256), Image.Resampling.LANCZOS) for i in range(1, 7)]),
            ("muzzle / dust", [
                named["muzzle_flash_1.png"].resize((128, 128), Image.Resampling.NEAREST),
                named["muzzle_flash_2.png"].resize((128, 128), Image.Resampling.NEAREST),
                named["dust_impact_1.png"].resize((128, 128), Image.Resampling.NEAREST),
                named["dust_impact_2.png"].resize((128, 128), Image.Resampling.NEAREST),
            ]),
        ]
    )
    fx.save(OUT / "_qc_fx.png")

    # Environment preview: sky, far dunes, near dunes, tiled ground.
    env = Image.new("RGB", (1024, 512), (0, 0, 0))
    env.paste(named["bg_sky.png"], (0, 0))
    far = named["bg_dunes_far.png"]
    near = named["bg_dunes_near.png"]
    # Tile dunes across the preview width.
    layer = Image.new("RGBA", (1024, 512), (0, 0, 0, 0))
    for x in range(-100, 1024, 700):
        layer.alpha_composite(far.resize((700, 117), Image.Resampling.LANCZOS), (x, 250))
    for x in range(0, 1024, 512):
        layer.alpha_composite(near.resize((512, 128), Image.Resampling.LANCZOS), (x, 340))
    ground_tile = named["ground_tile.png"]
    floor = Image.new("RGB", (1024, 140))
    for x in range(0, 1024, 256):
        for y in range(0, 140, 256):
            floor.paste(ground_tile, (x, y))
    env.paste(layer.convert("RGB"), (0, 0), layer)
    env.paste(floor, (0, 372))
    env.save(OUT / "_qc_env.png")

    # 2x2 ground proof
    g2 = Image.new("RGB", (512, 512))
    for x in (0, 256):
        for y in (0, 256):
            g2.paste(ground_tile, (x, y))
    g2.save(OUT / "_qc_ground_tile.png")

    manifest = {
        "style": (
            "flat 2D vector cartoon game art, bold clean dark outlines, soft cel shading, "
            "slight 3/4 side view, chunky stylized proportions, mobile tower-defense art "
            "in the style of Clash Royale / Grow Empire, saturated but earthy desert palette, "
            "crisp and readable at small size"
        ),
        "facing": "right",
        "background": "transparent PNG",
        "files": record,
        "notes": [
            "Character frames are 512x512. Feet sit 24px above the bottom edge. Horizontal anchor is the foot contact, not the weapon tip.",
            "soldier_fire_2, enemyA_fire_2, and enemyB_fire_2 include a composited muzzle flash. Aim frames are body-only so the body scale matches idle/walk.",
            "Separate muzzle_flash, dust_impact, explosion, and airstrike frames are included for layering.",
            "Wall states share one scale. Broken is a lower rubble pile on the same ground line. Canvas 384x640, pivot bottom-center.",
            "FOB canvas is 512x640, pivot bottom-center.",
            "bg_dunes_far and bg_dunes_near are 1536x256, transparent above the dune band, with the side edges crossfaded so they tile.",
            "ground_tile is 256x256. A narrow blur hides the tile seam; faint ripple lines can still meet softly.",
            "bg_sky is an opaque 1024x512 dusk gradient.",
        ],
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("wrote", len(record), "files")
    for item in record:
        if item["file"].endswith(("_1.png", "intact.png", "fob.png", "sky.png", "tile.png")) or "hit" in item["file"]:
            b = opaque_bounds(named[item["file"]]) if named[item["file"]].mode == "RGBA" else None
            print(f"  {item['file']:24} {item['size']} bounds={b}")


if __name__ == "__main__":
    main()
