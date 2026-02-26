#!/usr/bin/env python3
"""
Combines enumerated images into a single pipeline image with two rows.
Images are discovered from assets (GA_image*.png), shown as steps 1..N.
"""

from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont, ImageEnhance
except ImportError:
    print("Installing Pillow...")
    import subprocess
    subprocess.check_call(["pip", "install", "Pillow", "-q"])
    from PIL import Image, ImageDraw, ImageFont, ImageEnhance

# Base path for images
ASSETS_BASE = Path(__file__).resolve().parent.parent / "assets"
IMAGE_GLOB = "GA_image*.png"  # GA_image.png, GA_image1.png, GA_image2.png, etc.

# Output path (workspace assets)
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "assets" / "protein-visualizer-pipeline.png"

# Layout constants - tight, minimalist
PIPELINE_HEIGHT = 340
ARROW_WIDTH = 10
PADDING = 12
ROW_GAP = 20
BG_COLOR = (250, 250, 250)
ARROW_COLOR = (148, 163, 184)  # softer slate
LINE_WIDTH = 1
LETTER_WIDTH = 18
LETTER_SIZE = 14
LETTER_COLOR = (0, 0, 0)


def discover_images() -> list[Path]:
    """Discover and sort images (GA_image.png, GA_image1.png, GA_image2.png, ...)."""
    paths = list(ASSETS_BASE.glob(IMAGE_GLOB))

    def sort_key(p: Path) -> tuple[int, str]:
        stem = p.stem  # e.g. "GA_image" or "GA_image1"
        if stem == "GA_image":
            return (0, stem)
        suffix = stem.replace("GA_image", "")
        try:
            return (int(suffix) if suffix else 0, stem)
        except ValueError:
            return (999, stem)

    paths.sort(key=sort_key)
    return paths


def load_and_prepare(img_path: Path) -> Image.Image:
    """Load image and optionally enhance quality (sharpness) without changing content."""
    img = Image.open(img_path).convert("RGBA")
    # Slight sharpness enhancement for crisper output
    enhancer = ImageEnhance.Sharpness(img)
    img = enhancer.enhance(1.15)
    return img


def resize_to_height(img: Image.Image, target_h: int) -> Image.Image:
    """Resize image to target height, preserving aspect ratio."""
    w, h = img.size
    if h == target_h:
        return img
    new_w = int(w * target_h / h)
    return img.resize((new_w, target_h), Image.Resampling.LANCZOS)


def draw_arrow(draw: ImageDraw.Draw, x1: int, y1: int, x2: int, y2: int, color: tuple):
    """Draw a clean arrow: line stops before head to avoid overlap."""
    import math
    head_size = 6
    angle = math.atan2(y2 - y1, x2 - x1)
    # Line stops short of arrowhead
    stop_x = x2 - head_size * 1.2 * math.cos(angle)
    stop_y = y2 - head_size * 1.2 * math.sin(angle)
    draw.line([(x1, y1), (int(stop_x), int(stop_y))], fill=color, width=LINE_WIDTH)
    ax1 = x2 - head_size * math.cos(angle - 0.35)
    ay1 = y2 - head_size * math.sin(angle - 0.35)
    ax2 = x2 - head_size * math.cos(angle + 0.35)
    ay2 = y2 - head_size * math.sin(angle + 0.35)
    draw.polygon([(x2, y2), (int(ax1), int(ay1)), (int(ax2), int(ay2))], fill=color, outline=color)


def draw_section_letter(draw: ImageDraw.Draw, x: int, y: int, panel_h: int, step: int):
    """Draw capital letter (A, B, C, ...) to the left of the section, vertically centered."""
    try:
        font = ImageFont.truetype("arial.ttf", LETTER_SIZE)
    except OSError:
        font = ImageFont.load_default()
    text = chr(ord("A") + step - 1) if step <= 26 else str(step)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    center_y = y + panel_h // 2
    tx = x + (LETTER_WIDTH - tw) // 2
    ty = center_y - th // 2
    draw.text((tx, ty), text, fill=LETTER_COLOR, font=font)


def main():
    if not ASSETS_BASE.exists():
        print(f"Assets directory not found: {ASSETS_BASE}")
        return 1

    image_paths = discover_images()
    if not image_paths:
        print(f"No images found matching {IMAGE_GLOB} in {ASSETS_BASE}")
        return 1

    # Load and resize all images
    panels = []
    for path in image_paths:
        img = load_and_prepare(path)
        img = resize_to_height(img, PIPELINE_HEIGHT)
        panels.append(img)

    # Layout: Row 1 = A, B, C | Row 2 = D, E | both left-aligned
    n = len(panels)
    row1 = panels[: min(3, n)]
    row2 = panels[len(row1) :]

    def row_width(p_list):
        return sum(LETTER_WIDTH + p.width for p in p_list) + ARROW_WIDTH * max(0, len(p_list) - 1)

    w1 = row_width(row1)
    w2 = row_width(row2) if row2 else 0
    total_width = max(w1, w2) + PADDING * 2
    total_height = (PIPELINE_HEIGHT * 2) + ROW_GAP + PADDING * 2 if row2 else PIPELINE_HEIGHT + PADDING * 2

    canvas = Image.new("RGB", (total_width, total_height), BG_COLOR)
    draw = ImageDraw.Draw(canvas)

    def paste_panel(canvas, panel, x, y):
        if panel.mode == "RGBA":
            bg = Image.new("RGB", panel.size, (255, 255, 255))
            bg.paste(panel, mask=panel.split()[3])
            panel_rgb = bg
        else:
            panel_rgb = panel.convert("RGB")
        canvas.paste(panel_rgb, (x, y))

    def draw_row(panels_list, start_y, step_start: int, start_x: int):
        """Draw row: [Letter][Panel] for each, arrows between. Returns (first_center_x, last_center_x)."""
        x = start_x
        center_y = start_y + PIPELINE_HEIGHT // 2
        first_cx = last_cx = x + LETTER_WIDTH + panels_list[0].width // 2
        for i, panel in enumerate(panels_list):
            draw_section_letter(draw, x, start_y, PIPELINE_HEIGHT, step_start + i)
            paste_panel(canvas, panel, x + LETTER_WIDTH, start_y)
            last_cx = x + LETTER_WIDTH + panel.width // 2
            x += LETTER_WIDTH + panel.width
            if i < len(panels_list) - 1:
                draw_arrow(draw, x, center_y, x + ARROW_WIDTH, center_y, ARROW_COLOR)
                x += ARROW_WIDTH
        return first_cx, last_cx

    # Row 1: A -> B -> C
    y1 = PADDING
    draw_row(row1, y1, step_start=1, start_x=PADDING)

    if row2:
        # Row 2: D -> E, centered under row 1 for balanced layout
        y2 = PADDING + PIPELINE_HEIGHT + ROW_GAP
        w2 = row_width(row2)
        row2_start_x = PADDING + max(0, (w1 - w2) // 2)
        draw_row(row2, y2, step_start=len(row1) + 1, start_x=row2_start_x)
        # No connector line — clean separation between rows

    # Save at 2x scale for higher quality output
    scale = 2
    out_size = (canvas.width * scale, canvas.height * scale)
    final = canvas.resize(out_size, Image.Resampling.LANCZOS)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    final.save(OUTPUT_PATH, "PNG", optimize=True, dpi=(144, 144))
    print(f"Pipeline image saved to: {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    exit(main())
