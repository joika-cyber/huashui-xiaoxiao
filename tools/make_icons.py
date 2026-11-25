"""生成 PWA 图标（纯 Python，无需第三方库）。运行：python3 tools/make_icons.py"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")

BG_TOP = (123, 47, 247)
BG_BOTTOM = (241, 7, 163)
# 2x2 糖果：位置(相对)、颜色
GEMS = [
    ((0.34, 0.34), (255, 77, 109)),
    ((0.66, 0.34), (255, 214, 10)),
    ((0.34, 0.66), (76, 201, 240)),
    ((0.66, 0.66), (56, 211, 159)),
]
GEM_R = 0.135


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def pixel(x, y):
    """x, y 为 0..1 的坐标，返回 RGB"""
    col = lerp(BG_TOP, BG_BOTTOM, (x + y) / 2)
    for (cx, cy), gc in GEMS:
        dx, dy = x - cx, y - cy
        d = math.hypot(dx, dy)
        if d < GEM_R * 1.12:
            # 深色描边
            col = lerp(gc, (40, 10, 40), 0.55)
        if d < GEM_R:
            shade = 0.25 * (dx + dy) / GEM_R  # 右下更暗
            base = lerp(gc, (0, 0, 0), max(0.0, shade)) if shade > 0 else lerp(gc, (255, 255, 255), -shade)
            # 高光
            hx, hy = x - (cx - GEM_R * 0.35), y - (cy - GEM_R * 0.4)
            h = max(0.0, 1 - math.hypot(hx, hy) / (GEM_R * 0.45))
            col = lerp(base, (255, 255, 255), h * 0.85)
    return col


def render(size, ss=3):
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = pixel((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size)
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
            n = ss * ss
            row += bytes((acc[0] // n, acc[1] // n, acc[2] // n))
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path, size):
    raw = render(size)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    write_png(os.path.join(OUT, "icon-512.png"), 512)
    write_png(os.path.join(OUT, "icon-192.png"), 192)
    write_png(os.path.join(OUT, "apple-touch-icon.png"), 180)
