#!/usr/bin/env python3
"""Generates the SE-MENU application icon set (PNG + ICO).

Design: a deep-charcoal rounded tile with a glass sheen and a silver "SE"
monogram accented with muted violet.
"""
import os
import struct

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

SIZE = 1024
RADIUS = 236
TILE_TOP = (26, 29, 37)
TILE_BOTTOM = (8, 9, 13)
SILVER_TOP = (243, 245, 249)
SILVER_BOTTOM = (168, 176, 188)
VIOLET = (139, 124, 246)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\ariblk.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
]


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def vertical_gradient(size, top, bottom):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    for y in range(size):
        c = lerp(top, bottom, y / max(1, size - 1))
        for x in range(size):
            px[x, y] = c + (255,)
    return img


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def build_icon(size):
    # tile
    tile = vertical_gradient(size, TILE_TOP, TILE_BOTTOM)
    mask = rounded_mask(size, int(RADIUS * size / SIZE))
    tile.putalpha(mask)

    # glass sheen (diagonal light from the top-left)
    sheen = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.polygon([(0, 0), (size * 0.62, 0), (size * 0.22, size), (0, size)],
               fill=(255, 255, 255, 16))
    sd.ellipse([-size * 0.25, -size * 0.35, size * 0.6, size * 0.45],
               fill=(255, 255, 255, 12))
    sheen = sheen.filter(ImageFilter.GaussianBlur(size * 0.05))
    tile.alpha_composite(sheen)

    # monogram
    text_size = int(size * 0.44)
    f = font(text_size)
    tmp = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    td = ImageDraw.Draw(tmp)
    bbox = td.textbbox((0, 0), "SE", font=f)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    ty = int((size - th) / 2 - bbox[1]) - int(size * 0.015)
    td.text((tx, ty), "SE", font=f, fill=(255, 255, 255, 255))

    # silver gradient through the letterforms
    grad = vertical_gradient(size, SILVER_TOP, SILVER_BOTTOM)
    tile.paste(grad, (0, 0), tmp)

    # muted violet accent sweep across the lower half of the monogram
    accent = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ad = ImageDraw.Draw(accent)
    ad.rectangle([0, int(size * 0.52), size, size], fill=VIOLET + (110,))
    accent.putalpha(Image.composite(accent.getchannel("A"), Image.new("L", (size, size), 0), tmp))
    tile = Image.alpha_composite(tile, accent)

    # crisp letter edge highlight
    edge = tmp.filter(ImageFilter.GaussianBlur(size * 0.004))
    edge_alpha = edge.getchannel("A").point(lambda a: int(a * 0.35))
    edge.putalpha(edge_alpha)
    tile.alpha_composite(edge)

    # rim light
    rim = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    inset = int(size * 0.012)
    rd.rounded_rectangle([inset, inset, size - 1 - inset, size - 1 - inset],
                         radius=int(RADIUS * size / SIZE) - inset,
                         outline=(235, 238, 244, 70), width=max(2, int(size * 0.006)))
    tile.alpha_composite(rim)

    # soft drop shadow baked into the transparent PNG
    final = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    black = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    black.putalpha(tile.getchannel("A").point(lambda a: int(a * 0.5)))
    shadow = black.filter(ImageFilter.GaussianBlur(size * 0.04))
    final.alpha_composite(shadow, (0, int(size * 0.025)))
    final.alpha_composite(tile)
    return final


def write_ico(path, frames):
    images = [data for _, data in frames]
    header = struct.pack("<HHH", 0, 1, len(images))
    entries = b""
    offset = 6 + 16 * len(images)
    blob = b""
    for size, data in frames:
        entries += struct.pack("<BBBBHHII",
                               size if size < 256 else 0, size if size < 256 else 0,
                               0, 0, 1, 32, len(data), offset)
        blob += data
        offset += len(data)
    with open(path, "wb") as fh:
        fh.write(header + entries + blob)


def main():
    os.makedirs(ASSETS, exist_ok=True)
    icon = build_icon(SIZE)

    icon.resize((512, 512), Image.LANCZOS).save(os.path.join(ASSETS, "icon.png"), "PNG", optimize=True)
    for s in (16, 24, 32, 48):
        icon.resize((s, s), Image.LANCZOS).save(
            os.path.join(ASSETS, f"icon-{s}.png"), "PNG", optimize=True)

    frames = []
    for s in (16, 24, 32, 48, 64, 128, 256):
        tmp = os.path.join(ASSETS, f".icon-{s}.png")
        icon.resize((s, s), Image.LANCZOS).save(tmp, "PNG", optimize=True)
        with open(tmp, "rb") as fh:
            frames.append((s, fh.read()))
        os.remove(tmp)
    write_ico(os.path.join(ASSETS, "icon.ico"), frames)
    print("[icon] wrote assets/icon.png, assets/icon.ico and tray sizes")


if __name__ == "__main__":
    main()
