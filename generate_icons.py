"""
generate_icons_hd.py
Produces crisp, high-definition launcher icons from iconn.jpeg.

Key technique for line-art sources:
  1. Convert to greyscale
  2. Auto-level contrast (stretch histogram)  
  3. Hard threshold → pure 1-bit black/white (eliminates JPEG grey fuzz)
  4. Supersample: render at 4× target size, then LANCZOS downsample
  5. UnsharpMask after every resize to restore edge definition
  6. Save as PNG with maximum quality (no lossy compression)
"""

from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageOps
import io, os, struct

SRC  = r"E:\IMP projects\Udaya\iconn.jpeg"
PUB  = r"E:\IMP projects\Udaya\frontend\public"
RES  = r"E:\IMP projects\Udaya\frontend\android\app\src\main\res"

# ── Prepare a crisp binary source ───────────────────────────────────────────

def prepare_source():
    """
    Load JPEG, convert to clean binary (pure black on pure white).
    This eliminates ALL JPEG compression grey artifacts before any resize.
    """
    img = Image.open(SRC).convert("L")          # greyscale

    # Auto-level: stretch histogram so darkest → 0, brightest → 255
    img = ImageOps.autocontrast(img, cutoff=1)

    # Hard threshold: pixels below 128 → 0 (black), above → 255 (white)
    # This gives perfectly crisp edges with zero grey fringe
    img = img.point(lambda p: 0 if p < 148 else 255, '1')
    img = img.convert("L")                       # back to greyscale (0/255)

    # Convert to RGB (white bg, black strokes)
    rgb = Image.new("RGB", img.size, (255, 255, 255))
    # Use the binary mask: where pixel==0 (black strokes) paint black
    mask = img.point(lambda p: 0 if p == 0 else 255, "L")
    rgb.paste(Image.new("RGB", img.size, (0, 0, 0)), mask=ImageOps.invert(mask))
    return rgb

def sharpen(img):
    """Apply UnsharpMask to restore edge definition after downscale."""
    return img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=180, threshold=2))

def resize_hd(src, target_size, pad_ratio=0.82, bg=(255, 255, 255)):
    """
    Supersample: render logo at 4× target size on a 4× canvas,
    then LANCZOS-downsample to target. Much crisper than direct resize.
    """
    sup = target_size * 4
    inner = int(sup * pad_ratio)
    # Resize source to fit inside the supersample inner area
    thumb = src.copy()
    thumb.thumbnail((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGB", (sup, sup), bg)
    off = ((sup - thumb.width) // 2, (sup - thumb.height) // 2)
    canvas.paste(thumb, off)
    # Downsample to target with LANCZOS
    result = canvas.resize((target_size, target_size), Image.LANCZOS)
    return sharpen(result)

def make_round(sq_img, bg=(255, 255, 255)):
    """Composite a circle mask for ic_launcher_round (white bg circle)."""
    size = sq_img.width
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size-1, size-1), fill=255)
    out = Image.new("RGB", (size, size), bg)
    out.paste(sq_img, mask=mask)
    return out

def make_fg(src, fg_size):
    """
    Adaptive icon foreground: logo centred on transparent canvas (60% fill).
    Android safe zone = centre 66dp of 108dp canvas (~61%).
    """
    canvas = Image.new("RGBA", (fg_size, fg_size), (0, 0, 0, 0))
    inner  = int(fg_size * 0.60)
    sup    = inner * 4
    thumb  = src.copy()
    thumb.thumbnail((sup, sup), Image.LANCZOS)
    thumb  = thumb.resize((inner, inner), Image.LANCZOS)
    thumb  = sharpen(thumb)
    # Convert black lines to RGBA with transparent background
    thumb_rgba = thumb.convert("RGBA")
    data = thumb_rgba.load()
    for y in range(thumb.height):
        for x in range(thumb.width):
            r, g, b, a = data[x, y]
            # White (or near-white) → transparent
            if r > 230 and g > 230 and b > 230:
                data[x, y] = (255, 255, 255, 0)
            else:
                data[x, y] = (r, g, b, 255)
    off = ((fg_size - thumb.width) // 2, (fg_size - thumb.height) // 2)
    canvas.paste(thumb_rgba, off, mask=thumb_rgba.split()[3])
    return canvas

def make_ico(img, sizes=(16, 32, 48)):
    entries, bitmaps = [], []
    for s in sizes:
        frame = resize_hd(img, s, pad_ratio=0.80)
        buf = io.BytesIO()
        frame.save(buf, format="PNG")
        bitmaps.append(buf.getvalue())
        entries.append((s, len(bitmaps[-1])))
    header = struct.pack("<HHH", 0, 1, len(sizes))
    offset = 6 + len(sizes) * 16
    dir_ = b""
    for (s, size_), bm in zip(entries, bitmaps):
        w = s if s < 256 else 0
        dir_ += struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, size_, offset)
        offset += size_
    return header + dir_ + b"".join(bitmaps)

# ── Android mipmap specs ─────────────────────────────────────────────────────

MIPMAP = {
    "mipmap-ldpi":    36,
    "mipmap-mdpi":    48,
    "mipmap-hdpi":    72,
    "mipmap-xhdpi":   96,
    "mipmap-xxhdpi":  144,
    "mipmap-xxxhdpi": 192,
}

# ── main ─────────────────────────────────────────────────────────────────────

def save(img, path, **kw):
    img.save(path, "PNG", optimize=True, **kw)
    print(f"  [OK] {os.path.basename(path)}  ({img.width}x{img.height})")

def main():
    src = prepare_source()
    print(f"[OK] Loaded + binarised: {src.size[0]}x{src.size[1]}")

    # ── PWA / Web ──────────────────────────────────────────────────────────

    print("\nPWA icons:")
    with open(os.path.join(PUB, "favicon.ico"), "wb") as f:
        f.write(make_ico(src, sizes=(16, 32, 48)))
    print(f"  [OK] favicon.ico (16+32+48)")

    for fname, size, pad in [
        ("favicon-32.png",       32,  0.80),
        ("icon-192.png",        192,  0.82),
        ("icon-512.png",        512,  0.82),
        ("apple-touch-icon.png",180,  0.82),
        ("udaya-logo.png",      512,  0.82),
    ]:
        save(resize_hd(src, size, pad_ratio=pad), os.path.join(PUB, fname))

    # ── Android launcher ───────────────────────────────────────────────────

    print("\nAndroid mipmap icons:")
    for folder, size in MIPMAP.items():
        out_dir = os.path.join(RES, folder)
        os.makedirs(out_dir, exist_ok=True)

        sq = resize_hd(src, size, pad_ratio=0.82)
        save(sq, os.path.join(out_dir, "ic_launcher.png"))

        save(make_round(sq), os.path.join(out_dir, "ic_launcher_round.png"))

        fg = make_fg(src, size)
        fg.save(os.path.join(out_dir, "ic_launcher_foreground.png"), "PNG", optimize=True)
        print(f"  [OK] ic_launcher_foreground.png ({size}x{size} RGBA)")

        bg = Image.new("RGB", (size, size), (255, 255, 255))
        save(bg, os.path.join(out_dir, "ic_launcher_background.png"))

    print("\nAll HD icons generated successfully.")

if __name__ == "__main__":
    main()
