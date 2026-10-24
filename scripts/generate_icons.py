#!/usr/bin/env python3
"""Generate the PNG app icons in icons/ using only the Python standard library.

Run from the repo root:  python3 scripts/generate_icons.py

Produces:
  icons/icon-<size>.png           rounded-corner icons ("any" purpose)
  icons/icon-maskable-<size>.png  full-bleed icons with the figure inside the
                                  maskable safe zone (Android adaptive icons)
  icons/apple-touch-icon.png      180x180 full-bleed (iOS rounds it itself)
"""
import math
import os
import struct
import zlib

TOP_LEFT = (0x66, 0x7E, 0xEA)      # #667eea
BOTTOM_RIGHT = (0x5A, 0x67, 0xD8)  # #5a67d8
WHITE = (255, 255, 255)
SAMPLES = 3  # SAMPLES x SAMPLES supersampling per pixel for smooth edges

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")


def in_rounded_rect(x, y, r):
    """Unit square with corner radius r."""
    cx = min(max(x, r), 1 - r)
    cy = min(max(y, r), 1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def shade(x, y, scale):
    """Return (rgb, inside_background) for a point in unit coordinates."""
    t = (x + y) / 2
    bg = tuple(round(a + (b - a) * t) for a, b in zip(TOP_LEFT, BOTTOM_RIGHT))

    # scale < 1 shrinks the figure toward the centre (maskable icons need padding).
    fx = 0.5 + (x - 0.5) / scale
    fy = 0.5 + (y - 0.5) / scale

    head_y, head_r, inner_r = 0.365, 0.167, 0.115
    d_head = math.hypot(fx - 0.5, fy - head_y)
    if d_head <= inner_r:
        # Faint tint inside the head, like the SVG's inner circle.
        return tuple(round(w + (c - w) * 0.2) for w, c in zip(WHITE, bg))
    if d_head <= head_r:
        return WHITE

    # Shoulders: top half of an ellipse whose base sits at y=0.833.
    base_y, rx, ry = 0.833, 0.24, 0.26
    if fy <= base_y and ((fx - 0.5) / rx) ** 2 + ((fy - base_y) / ry) ** 2 <= 1:
        return WHITE
    return bg


def render(size, corner_radius, figure_scale):
    rows = []
    n = SAMPLES
    for py in range(size):
        row = bytearray([0])  # PNG filter type 0 for this scanline
        for px in range(size):
            r = g = b = a = 0
            for sy in range(n):
                for sx in range(n):
                    x = (px + (sx + 0.5) / n) / size
                    y = (py + (sy + 0.5) / n) / size
                    if corner_radius and not in_rounded_rect(x, y, corner_radius):
                        continue
                    cr, cg, cb = shade(x, y, figure_scale)
                    r += cr; g += cg; b += cb; a += 1
            if a:
                # Average colour over covered samples; alpha = coverage.
                row += bytes((r // a, g // a, b // a, round(255 * a / (n * n))))
            else:
                row += b"\x00\x00\x00\x00"
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
    data += chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    jobs = [(f"icon-{s}.png", s, 0.125, 1.0) for s in (72, 96, 128, 144, 152, 192, 384, 512)]
    # Maskable safe zone is the centre 80% circle, so shrink the figure to fit.
    jobs += [(f"icon-maskable-{s}.png", s, 0, 0.8) for s in (192, 512)]
    jobs += [("apple-touch-icon.png", 180, 0, 1.0)]
    for name, size, radius, scale in jobs:
        write_png(os.path.join(OUT_DIR, name), size, render(size, radius, scale))
        print(f"wrote icons/{name}")


if __name__ == "__main__":
    main()
