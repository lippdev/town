"""Leva uma arte gerada para a grade real de pixel art, para usar como sprite no escritório.

A geração de imagem devolve "pixels" de tamanho irregular numa tela enorme. Aqui cada
bloco vira um pixel de verdade, a paleta é reduzida e os retoques da ficha são aplicados.
Roda no Python do Blender, que já traz numpy e lê/grava PNG:

  blender --background --factory-startup --python scripts/characters/pixelize-sprite.py -- \
    docs/characters/filipe/isometrico-fonte.png public/characters/filipe/demo-isometric.png

Regiões de retoque em pixels da fonte. Só valem para esta fonte; outra arte pede outras.
"""
import os
import sys

import bpy
import numpy as np

SOURCE, TARGET = sys.argv[sys.argv.index("--") + 1:][:2]
BLOCK = 8
COLORS = 28
PADDING = 4

# reflexo marrom no capuz e no ombro, que a ficha não tem: volta para o tecido
SMEAR_BOX = (385, 395, 525, 720)
# cordões creme na arte, cinza na ficha
CORD_BOX = (585, 505, 660, 595)
CLOTH_LIGHT = np.array([0x41, 0x40, 0x45], float)
CLOTH_BASE = np.array([0x29, 0x28, 0x2d], float)
CORD_LIGHT = np.array([0xa8, 0xa8, 0xac], float)
CORD_DARK = np.array([0x62, 0x62, 0x67], float)


def load(path):
    image = bpy.data.images.load(os.path.abspath(path))
    width, height = image.size
    data = np.array(image.pixels[:], np.float32).reshape(height, width, 4)[::-1]
    return data[..., :3] * 255.0, data[..., 3]


def retouch(rgb):
    x0, y0, x1, y1 = SMEAR_BOX
    box = rgb[y0:y1, x0:x1]
    brown = (box[..., 0] - box[..., 2]) > 14
    lit = box.mean(axis=2) > 60
    box[brown & lit] = CLOTH_LIGHT
    box[brown & ~lit] = CLOTH_BASE
    x0, y0, x1, y1 = CORD_BOX
    box = rgb[y0:y1, x0:x1]
    light = box.mean(axis=2)
    box[light > 150] = CORD_LIGHT
    box[(light > 80) & (light <= 150)] = CORD_DARK


def to_grid(rgb, alpha):
    """Cada bloco vira um pixel: maioria no alfa, mediana na cor (descarta ruído da geração)."""
    ys, xs = np.where(alpha >= 0.5)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rows, cols = (y1 - y0 + BLOCK - 1) // BLOCK, (x1 - x0 + BLOCK - 1) // BLOCK
    out = np.zeros((rows, cols, 3), np.float32)
    keep = np.zeros((rows, cols), bool)
    for r in range(rows):
        for c in range(cols):
            ya, xa = y0 + r * BLOCK, x0 + c * BLOCK
            mask = alpha[ya:ya + BLOCK, xa:xa + BLOCK] >= 0.5
            if mask.mean() >= 0.5:
                out[r, c] = np.median(rgb[ya:ya + BLOCK, xa:xa + BLOCK][mask], axis=0)
                keep[r, c] = True
    return out, keep


def quantize(rgb, keep):
    """K-means com sementes fixas: mesma fonte, mesmo resultado."""
    pixels = rgb[keep]
    rng = np.random.default_rng(7)
    centers = pixels[rng.choice(len(pixels), COLORS, replace=False)]
    for _ in range(24):
        labels = np.argmin(((pixels[:, None] - centers[None]) ** 2).sum(axis=2), axis=1)
        for i in range(COLORS):
            if (labels == i).any():
                centers[i] = pixels[labels == i].mean(axis=0)
    out = rgb.copy()
    out[keep] = centers[labels]
    return out


rgb, alpha = load(SOURCE)
retouch(rgb)
grid, keep = to_grid(rgb, alpha)
grid = quantize(grid, keep)

rows, cols = grid.shape[:2]
height, width = rows + 2 * PADDING, cols + 2 * PADDING
canvas = np.zeros((height, width, 4), np.float32)
canvas[PADDING:PADDING + rows, PADDING:PADDING + cols, :3] = grid / 255.0
canvas[PADDING:PADDING + rows, PADDING:PADDING + cols, 3] = keep

image = bpy.data.images.new("sprite", width, height, alpha=True)
image.alpha_mode = "STRAIGHT"
image.pixels = canvas[::-1].ravel()
image.filepath_raw = os.path.abspath(TARGET)
image.file_format = "PNG"
image.save()

soles = PADDING + np.where(keep.any(axis=1))[0].max() + 1
feet = np.where(keep[-max(rows // 8, 1):].any(axis=0))[0]
print("SPRITE canvas", width, height, "visivel", cols, rows, "sola", int(soles), "pes x", int(PADDING + feet.mean()), "cores", COLORS)
