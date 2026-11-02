#!/usr/bin/env python3
"""Writes test/png_fixtures.wac: small PNGs of every kind, made by Pillow, and the RGBA each should read as.

Pillow does not write interlaced PNGs, so those are written here — rows filtered every way the format has, in
Adam7's seven passes — and checked by reading them back with Pillow before they are kept.
"""
import io, os, struct, zlib
from PIL import Image

W, H = 7, 5

def picture():
    """A 7 × 5 picture with every pixel different, and alpha that varies."""
    im = Image.new("RGBA", (W, H))
    for y in range(H):
        for x in range(W):
            im.putpixel((x, y), ((x * 37) % 256, (y * 61) % 256, (x * y * 13 + 40) % 256, 255 if (x + y) % 3 else 96))
    return im

def png(im, **kw):
    b = io.BytesIO()
    im.save(b, "PNG", **kw)
    return b.getvalue()

def rgba_of(im):
    return im.convert("RGBA").tobytes()

def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else (b if pb <= pc else c)

def interlaced_rgba(im):
    """`im` as an eight-bit RGBA PNG in Adam7's passes, each row filtered by the next of the five filters in turn."""
    px = im.convert("RGBA").tobytes()
    passes = [(0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4), (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2)]
    raw = bytearray()
    n = 0
    for x0, y0, dx, dy in passes:
        cols = list(range(x0, W, dx))
        rows = list(range(y0, H, dy))
        if not cols or not rows:
            continue
        prev = bytes(len(cols) * 4)
        for y in rows:
            cur = b"".join(px[(y * W + x) * 4:(y * W + x) * 4 + 4] for x in cols)
            f = n % 5
            n += 1
            out = bytearray([f])
            for i, v in enumerate(cur):
                a = cur[i - 4] if i >= 4 else 0
                b = prev[i]
                c = prev[i - 4] if i >= 4 else 0
                pred = [0, a, b, (a + b) // 2, paeth(a, b, c)][f]
                out.append((v - pred) & 255)
            raw += out
            prev = cur
    head = struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 1)
    data = zlib.compress(bytes(raw))
    # Split the data over two IDAT chunks, as encoders may.
    half = len(data) // 2
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", data[:half]) + chunk(b"IDAT", data[half:])
            + chunk(b"IEND", b""))

def cases():
    im = picture()
    out = []
    out.append(("rgba8", png(im), rgba_of(im)))
    rgb = im.convert("RGB")
    out.append(("rgb8", png(rgb), rgba_of(rgb)))
    grey = im.convert("L")
    out.append(("grey8", png(grey), rgba_of(grey)))
    la = im.convert("LA")
    out.append(("greyAlpha8", png(la), rgba_of(la)))
    bw = im.convert("1")
    out.append(("grey1", png(bw), rgba_of(bw)))
    # A palette of four colours at two bits a pixel, one of them transparent.
    pal = im.convert("RGB").quantize(colors=4)
    pal.info["transparency"] = 2
    b = png(pal, bits=2, transparency=2)
    out.append(("palette2", b, rgba_of(Image.open(io.BytesIO(b)))))
    # Sixteen-bit greyscale: each sample's high byte is what is read.
    g16 = Image.new("I;16", (W, H))
    for y in range(H):
        for x in range(W):
            g16.putpixel((x, y), (x * 9000 + y * 777) % 65536)
    want = bytearray()
    for y in range(H):
        for x in range(W):
            v = ((x * 9000 + y * 777) % 65536) >> 8
            want += bytes([v, v, v, 255])
    out.append(("grey16", png(g16), bytes(want)))
    il = interlaced_rgba(im)
    back = Image.open(io.BytesIO(il))
    assert back.info.get("interlace") == 1, "Pillow reads the interlaced fixture as interlaced"
    assert rgba_of(back) == rgba_of(im), "the interlaced fixture reads back as the picture"
    out.append(("interlaced", il, rgba_of(im)))
    for name, data, want in out:
        assert rgba_of(Image.open(io.BytesIO(data))) == want or name == "grey16", name
    return out

def array(b):
    lines = []
    for i in range(0, len(b), 24):
        lines.append("    " + ", ".join(str(x) for x in b[i:i + 24]) + ",")
    return "[\n" + "\n".join(lines) + "\n  ]"

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    parts = ["// Written by tools/png_fixtures.py — do not edit. Small PNGs of every kind, made by Pillow (the interlaced one",
             "// by the script itself, and read back by Pillow), and the RGBA each reads as.", ""]
    parts.append("export i32 width() { return %d; }" % W)
    parts.append("export i32 height() { return %d; }" % H)
    parts.append("")
    names = []
    for name, data, want in cases():
        names.append(name)
        parts.append("export u8[] %sPng() {\n  return %s;\n}\n" % (name, array(data)))
        parts.append("export u8[] %sRgba() {\n  return %s;\n}\n" % (name, array(want)))
    with open(os.path.join(here, "..", "test", "png_fixtures.wac"), "w") as f:
        f.write("\n".join(parts))
    print("test/png_fixtures.wac: " + ", ".join(names))

main()
