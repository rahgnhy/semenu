#!/usr/bin/env python3
"""Generates the SE-MENU application icon set (PNG + ICO) with no dependencies
beyond Pillow.

Design: a deep-space rounded square with a cyan -> violet gradient rim, an
aurora wash, and a glowing se-menu line running through the middle.
"""
import math
import os
import struct
import zlib

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

SIZE = 1024
RADIUS = 235
ACCENT_A = (34, 211, 238)    # cyan
ACCENT_B = (129, 140, 248)   # indigo
ACCENT_C = (232, 121, 249)   # fuchsia
BG_TOP = (10, 14, 26)
BG_BOTTOM = (22, 16, 48)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_base(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        # diagonal blend between top and bottom palette
        for x in range(size):
            d = (x / size) * 0.35 + t * 0.65
            r, g, b = lerp(BG_TOP, BG_BOTTOM, d)
            px[x, y] = (r, g, b, 255)
    return img


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def se-menu_points(size):
    """The se-menu polyline, in pixel space, normalized to a 1024 grid."""
    pts = [
        (0.10, 0.56), (0.30, 0.56), (0.38, 0.38), (0.47, 0.72),
        (0.55, 0.22), (0.63, 0.62), (0.70, 0.56), (0.90, 0.56),
    ]
    return [(x * size, y * size) for x, y in pts]


def build_icon(size):
    # 1. base gradient + rounded mask
    img = make_base(size)
    mask = rounded_mask(size, int(RADIUS * size / SIZE))
    img.putalpha(mask)

    # 2. aurora wash inside the tile
    aurora = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ad = ImageDraw.Draw(aurora)
    ad.ellipse([-size * 0.25, -size * 0.30, size * 0.55, size * 0.35],
               fill=ACCENT_B + (70,))
    ad.ellipse([size * 0.35, size * 0.45, size * 1.15, size * 1.05],
               fill=ACCENT_C + (55,))
    ad.ellipse([size * 0.05, size * 0.55, size * 0.55, size * 1.05],
               fill=ACCENT_A + (45,))
    aurora = aurora.filter(ImageFilter.GaussianBlur(size * 0.10))
    img.alpha_composite(aurora)

    # 3. subtle inner top highlight
    sheen = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.ellipse([-size * 0.3, -size * 0.55, size * 1.1, size * 0.35],
               fill=(255, 255, 255, 26))
    sheen = sheen.filter(ImageFilter.GaussianBlur(size * 0.06))
    img.alpha_composite(sheen)

    # 4. gradient rim
    rim = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    inset = int(size * 0.012)
    rd.rounded_rectangle([inset, inset, size - 1 - inset, size - 1 - inset],
                         radius=int(RADIUS * size / SIZE) - inset,
                         outline=(255, 255, 255, 90), width=max(2, int(size * 0.008)))
    img.alpha_composite(rim)

    # 5. se-menu line with glow
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    pts = se-menu_points(size)
    width = size * 0.030
    # layered strokes for a neon falloff
    for i, (w, alpha) in enumerate([(width * 3.4, 26), (width * 2.2, 55), (width * 1.4, 110)]):
        gd.line(pts, fill=ACCENT_A + (alpha,), width=int(w), joint="curve")
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.012))
    img.alpha_composite(glow)

    # core line with a cyan -> fuchsia gradient approximation
    core = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cd = ImageDraw.Draw(core)
    cd.line(pts, fill=(235, 250, 255, 255), width=int(width * 0.62), joint="curve")
    # tinted overlay that shifts along the line
    tint = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    td = ImageDraw.Draw(tint)
    n = len(pts) - 1
    for i in range(n):
        t = i / max(1, n - 1)
        col = lerp(ACCENT_A, ACCENT_C, t)
        td.line([pts[i], pts[i + 1]], fill=col + (200,), width=int(width * 0.62))
    core = Image.blend(core, Image.alpha_composite(core, tint), 0.55)
    img.alpha_composite(core)

    # 6. endpoint node
    node = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    nd = ImageDraw.Draw(node)
    ex, ey = pts[-1]
    r = width * 0.95
    nd.ellipse([ex - r, ey - r, ex + r, ey + r], fill=(255, 255, 255, 235))
    nd.ellipse([ex - r * 0.45, ey - r * 0.45, ex + r * 0.45, ey + r * 0.45],
               fill=ACCENT_C + (255,))
    img.alpha_composite(node)

    # 7. final soft drop shadow baked under the tile
    final = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    alpha = img.getchannel("A")
    black = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    black.putalpha(alpha.point(lambda a: int(a * 0.55)))
    shadow = black.filter(ImageFilter.GaussianBlur(size * 0.035))
    final.alpha_composite(shadow, (0, int(size * 0.02)))
    final.alpha_composite(img)
    return final


def write_png(path, img):
    img.save(path, "PNG", optimize=True)


def write_ico(path, frames):
    """PNG-in-ICO: every frame is a PNG blob (valid on Windows Vista+)."""
    images = [f[1] for f in frames]
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

    write_png(os.path.join(ASSETS, "icon.png"), icon.resize((512, 512), Image.LANCZOS))

    # tray / notification icons
    for s in (16, 24, 32, 48):
        write_png(os.path.join(ASSETS, f"icon-{s}.png"),
                  icon.resize((s, s), Image.LANCZOS))

    # ICO with PNG frames
    frames = []
    for s in (16, 24, 32, 48, 64, 128, 256):
        buf = icon.resize((s, s), Image.LANCZOS)
        tmp = os.path.join(ASSETS, f".icon-{s}.png")
        buf.save(tmp, "PNG", optimize=True)
        with open(tmp, "rb") as fh:
            frames.append((s, fh.read()))
        os.remove(tmp)
    write_ico(os.path.join(ASSETS, "icon.ico"), frames)

    # splash logo mark (transparent, no tile)
    print("[icon] wrote assets/icon.png, assets/icon.ico and tray sizes")


if __name__ == "__main__":
    main()
