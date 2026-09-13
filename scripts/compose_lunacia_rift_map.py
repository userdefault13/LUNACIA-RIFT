#!/usr/bin/env python3
"""Compose Lunacia Rift 1500x800 map from Origins 7-deep-forest PvE layers."""
from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

W, H = 1500, 800
LANE_Y = {"top": 130, "mid": 400, "bot": 670}
LANE_PATH_HALF = 36  # ~72px tall band
FOREST_GAP_XS = [420, 750, 1080]
FOREST_GAP_HALF = 50
SRC = "/workspace/axie-origins-asset-kit/Assets/OriginsKit/PvE/Backgrounds/story/7-deep-forest"
OUT_DIR = "/workspace/lunacia-rift/assets/map"
OUT = os.path.join(OUT_DIR, "lunacia_rift.png")
PREVIEW = os.path.join(OUT_DIR, "lunacia_rift_preview.png")
NOTICE = os.path.join(OUT_DIR, "NOTICE.md")


def cover_scale(im: Image.Image, tw: int, th: int) -> Image.Image:
    """Scale image to cover tw x th (like CSS background-size: cover)."""
    iw, ih = im.size
    scale = max(tw / iw, th / ih)
    nw, nh = int(iw * scale + 0.5), int(ih * scale + 0.5)
    scaled = im.resize((nw, nh), Image.Resampling.LANCZOS)
    x0 = (nw - tw) // 2
    y0 = (nh - th) // 2
    return scaled.crop((x0, y0, x0 + tw, y0 + th))


def tile_h(strip: Image.Image, tw: int) -> Image.Image:
    """Tile strip horizontally to width tw, keeping strip height."""
    sw, sh = strip.size
    out = Image.new("RGBA", (tw, sh), (0, 0, 0, 0))
    x = 0
    while x < tw:
        out.paste(strip, (x, 0), strip)
        x += sw
    return out


def stamp_lane_ground(canvas: Image.Image, ground: Image.Image, lane_y: int) -> None:
    """Stamp brightened ground along a lane strip (~72px tall)."""
    band_h = LANE_PATH_HALF * 2
    # Use middle portion of ground art (path-looking)
    gw, gh = ground.size
    # Crop a horizontal band from ground (lower-middle often looks path-like)
    y0 = int(gh * 0.35)
    y1 = min(gh, y0 + int(gh * 0.45))
    crop = ground.crop((0, y0, gw, y1)).resize((gw, band_h), Image.Resampling.LANCZOS)
    # Brighten slightly so lanes read
    crop = ImageEnhance.Brightness(crop).enhance(1.18)
    crop = ImageEnhance.Contrast(crop).enhance(1.05)
    tiled = tile_h(crop, W)
    top = lane_y - LANE_PATH_HALF
    # Soft alpha so it blends into BG
    alpha = tiled.split()[-1]
    alpha = ImageEnhance.Brightness(alpha).enhance(0.92)
    tiled.putalpha(alpha)
    canvas.alpha_composite(tiled, (0, top))


def cut_gaps(mask_w: int, mask_h: int, band_y: int) -> Image.Image:
    """Full-opaque mask of band height with clear rectangles at gap Xs (full canvas coords)."""
    # Actually return a band-local mask: white=keep, black=cut
    m = Image.new("L", (mask_w, mask_h), 255)
    d = ImageDraw.Draw(m)
    for gx in FOREST_GAP_XS:
        x0 = gx - FOREST_GAP_HALF
        x1 = gx + FOREST_GAP_HALF
        # soft edges: clear core + feather
        d.rectangle([x0, 0, x1, mask_h], fill=0)
        # feather a bit by drawing greys at edges
        for i, a in enumerate([40, 90, 150, 200]):
            d.rectangle([x0 - (4 - i), 0, x0 - (3 - i), mask_h], fill=a)
            d.rectangle([x1 + (3 - i), 0, x1 + (4 - i), mask_h], fill=a)
    return m


def stamp_forest_band(canvas: Image.Image, trees: Image.Image, rocks: Image.Image, band_y: int, band_h: int) -> None:
    """Tile trees+rocks into inter-lane band, cut clear gap corridors."""
    # Scale trees to roughly band height (a bit taller for canopy overhang)
    tw, th = trees.size
    scale = (band_h * 1.35) / th
    nw, nh = int(tw * scale), int(th * scale)
    trees_s = trees.resize((nw, nh), Image.Resampling.LANCZOS)
    # Rocks smaller
    rw, rh = rocks.size
    rscale = (band_h * 0.55) / rh
    rnw, rnh = max(1, int(rw * rscale)), max(1, int(rh * rscale))
    rocks_s = rocks.resize((rnw, rnh), Image.Resampling.LANCZOS)

    band = Image.new("RGBA", (W, band_h + 40), (0, 0, 0, 0))
    # Tile trees with slight vertical offset so canopy sits in band
    y_tree = 8
    x = -40
    while x < W + 40:
        band.alpha_composite(trees_s, (x, y_tree - (nh - band_h) // 2))
        x += int(nw * 0.72)

    # Stamp rocks along lower edge of band
    x = 20
    while x < W - 20:
        # skip near gaps
        near_gap = any(abs(x + rnw // 2 - gx) < FOREST_GAP_HALF + 30 for gx in FOREST_GAP_XS)
        if not near_gap:
            band.alpha_composite(rocks_s, (x, band_h - rnh + 18))
        x += rnw + 55

    # Cut gaps
    mask = cut_gaps(W, band.size[1], band_y)
    # Apply mask to alpha
    r, g, b, a = band.split()
    a = Image.composite(a, Image.new("L", a.size, 0), mask)
    band = Image.merge("RGBA", (r, g, b, a))

    # Soften gap edges
    band = band.filter(ImageFilter.GaussianBlur(radius=0.6))

    top = band_y - 20
    canvas.alpha_composite(band, (0, top))


def add_vignette_foliage(canvas: Image.Image, front_top: Image.Image, front_bot: Image.Image) -> None:
    top_cov = cover_scale(front_top, W, int(H * 0.28))
    # Reduce opacity a bit
    r, g, b, a = top_cov.split()
    a = ImageEnhance.Brightness(a).enhance(0.75)
    top_cov = Image.merge("RGBA", (r, g, b, a))
    canvas.alpha_composite(top_cov, (0, 0))

    bot_h = int(H * 0.32)
    bot_cov = cover_scale(front_bot, W, bot_h)
    r, g, b, a = bot_cov.split()
    a = ImageEnhance.Brightness(a).enhance(0.7)
    bot_cov = Image.merge("RGBA", (r, g, b, a))
    canvas.alpha_composite(bot_cov, (0, H - bot_h))


def tint_bases(canvas: Image.Image) -> None:
    """Subtle darker tint at left (player) / right (enemy) base zones — not covering lanes."""
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    # Left sanctuary zone — cool green dark
    for i, alpha in enumerate(range(70, 0, -7)):
        x1 = 160 - i * 8
        d.rectangle([0, 0, max(0, x1), H], fill=(20, 45, 30, alpha))
    # Right enemy zone — warmer dark
    for i, alpha in enumerate(range(70, 0, -7)):
        x0 = W - (160 - i * 8)
        d.rectangle([min(W, x0), 0, W, H], fill=(50, 25, 20, alpha))
    # Punch holes along lanes so paths stay readable
    for ly in LANE_Y.values():
        d.rectangle(
            [0, ly - LANE_PATH_HALF - 4, W, ly + LANE_PATH_HALF + 4],
            fill=(0, 0, 0, 0),
        )
    canvas.alpha_composite(overlay)


def soft_overall_vignette(canvas: Image.Image) -> None:
    vig = Image.new("L", (W, H), 0)
    # radial-ish darkening via ellipse
    # simpler: edge gradients
    d = ImageDraw.Draw(vig)
    for i in range(60):
        a = int(90 * (1 - i / 60) ** 2)
        d.rectangle([i, i, W - 1 - i, H - 1 - i], outline=a)
    vig = vig.filter(ImageFilter.GaussianBlur(12))
    dark = Image.new("RGBA", (W, H), (8, 16, 10, 255))
    dark.putalpha(vig)
    canvas.alpha_composite(dark)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    bg = Image.open(os.path.join(SRC, "7_BG-FOREST.png")).convert("RGBA")
    ground = Image.open(os.path.join(SRC, "7_Ground.png")).convert("RGBA")
    trees = Image.open(os.path.join(SRC, "7_MANY-TREES.png")).convert("RGBA")
    rocks = Image.open(os.path.join(SRC, "7_ROCK.png")).convert("RGBA")
    front_top = Image.open(os.path.join(SRC, "7_FRONT-TOP.png")).convert("RGBA")
    front_bot = Image.open(os.path.join(SRC, "7_FRONT-BOT.png")).convert("RGBA")

    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    # 1+2 BG cover
    canvas.alpha_composite(cover_scale(bg, W, H), (0, 0))

    # Slightly darken BG so stamped layers pop
    dim = Image.new("RGBA", (W, H), (10, 20, 12, 40))
    canvas.alpha_composite(dim)

    # 3 Ground along lanes
    for ly in LANE_Y.values():
        stamp_lane_ground(canvas, ground, ly)

    # 4 Inter-lane forest bands (match buildForest bands: centered between lanes, h=110)
    bands = [
        int((LANE_Y["top"] + LANE_Y["mid"]) / 2 - 55),  # y start
        int((LANE_Y["mid"] + LANE_Y["bot"]) / 2 - 55),
    ]
    for by in bands:
        stamp_forest_band(canvas, trees, rocks, by, 110)

    # Also light tree sprinkle above top lane / below bot for jungle feel (no collision)
    # Top jungle strip
    stamp_forest_band(canvas, trees, rocks, 0, 55)
    # Bottom jungle strip
    stamp_forest_band(canvas, trees, rocks, H - 70, 55)

    # 5 Front foliage vignette
    add_vignette_foliage(canvas, front_top, front_bot)

    # 6 Base tints
    tint_bases(canvas)
    soft_overall_vignette(canvas)

    # Ensure opaque RGB for web
    final = Image.new("RGB", (W, H), (20, 40, 25))
    final.paste(canvas, mask=canvas.split()[-1])
    final.save(OUT, "PNG", optimize=True)
    print("Wrote", OUT, final.size)

    # Preview half size
    prev = final.resize((W // 2, H // 2), Image.Resampling.LANCZOS)
    prev.save(PREVIEW, "PNG", optimize=True)
    print("Wrote", PREVIEW, prev.size)

    notice = """# Lunacia Rift map — NOTICE

Painted composite `lunacia_rift.png` (1500×800) is built from **Axie Infinity: Origins**
PvE Backgrounds / story / **7-deep-forest** layers via
[`axieinfinity/axie-origins-asset-kit`](https://github.com/axieinfinity/axie-origins-asset-kit)
(`Assets/OriginsKit/PvE/Backgrounds/story/7-deep-forest/`).

Source layers used: `7_BG-FOREST`, `7_Ground`, `7_MANY-TREES`, `7_ROCK`,
`7_FRONT-TOP`, `7_FRONT-BOT`.

- Axie characters, Origins art, and related assets are **Sky Mavis / Axie Infinity IP**.
- This map is an **organizer-owned Axie Vibeathon builder resource**.
- Use is limited to **Axie Vibeathon** and other Sky Mavis-approved programs.
- Do **not** redistribute as an open-source dump or ship outside approved programs.

See the kit’s root `LICENSE.md` for the full terms.
"""
    with open(NOTICE, "w", encoding="utf-8") as f:
        f.write(notice)
    print("Wrote", NOTICE)


if __name__ == "__main__":
    main()
