"""Prepara a arte do escritório em pixel art: cenário e Filipe na mesma grade.

O cenário gerado tem "pixels" irregulares em 1536×1024; aqui cada bloco vira 1 pixel. O atlas do
Filipe é reduzido para o tamanho dele nessa grade, senão os pixels dele sairiam menores que os da sala.
Roda no Python do Blender, que já traz numpy e lê/grava PNG:

  blender --background --factory-startup --python scripts/characters/escritorio-pixel.py -- \
    cenario-fonte.png public/escritorio/cenario.png \
    atlas.png atlas.json public/characters/filipe/pixel/walk.png
"""
import json
import math
import os
import sys

import bpy
import numpy as np

SCENE_SOURCE, SCENE_TARGET, ATLAS_SOURCE, ATLAS_JSON, ATLAS_TARGET = sys.argv[sys.argv.index("--") + 1:][:5]
SCENE_WIDTH, SCENE_HEIGHT = 640, 427
SCENE_COLORS = 96
FIGURE_ROWS = 56
# A redução mistura creme com preto e apaga o tênis; a nitidez devolve o contraste perdido.
FIGURE_SHARPEN = 1.1
FIGURE_COLORS = 40


def load(path):
    image = bpy.data.images.load(os.path.abspath(path))
    width, height = image.size
    return np.array(image.pixels[:], np.float32).reshape(height, width, 4)[::-1].copy()


def save(path, pixels):
    height, width = pixels.shape[:2]
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    image = bpy.data.images.new(os.path.basename(path), width, height, alpha=True)
    image.alpha_mode = "STRAIGHT"
    image.pixels = pixels[::-1].ravel()
    image.filepath_raw = os.path.abspath(path)
    image.file_format = "PNG"
    image.save()


def quantize(rgb, colors):
    """K-means com semente fixa: mesma fonte, mesma paleta."""
    rng = np.random.default_rng(7)
    sample = rgb[rng.choice(len(rgb), min(len(rgb), 40000), replace=False)]
    centers = sample[rng.choice(len(sample), colors, replace=False)]
    for _ in range(16):
        labels = nearest(sample, centers)
        for i in range(colors):
            if (labels == i).any():
                centers[i] = sample[labels == i].mean(axis=0)
    return centers[nearest(rgb, centers)]


def nearest(rgb, centers, chunk=20000):
    found = [np.argmin(((rgb[i:i + chunk, None] - centers[None]) ** 2).sum(axis=2), axis=1) for i in range(0, len(rgb), chunk)]
    return np.concatenate(found)


def edges(size, target):
    return np.round(np.linspace(0, size, target + 1)).astype(int)


# ---------- cenário: mediana por bloco, que não cria cor intermediária nas bordas ----------
scene = load(SCENE_SOURCE)
ys, xs = edges(scene.shape[0], SCENE_HEIGHT), edges(scene.shape[1], SCENE_WIDTH)
grid = np.zeros((SCENE_HEIGHT, SCENE_WIDTH, 3), np.float32)
for r in range(SCENE_HEIGHT):
    for c in range(SCENE_WIDTH):
        grid[r, c] = np.median(scene[ys[r]:ys[r + 1], xs[c]:xs[c + 1], :3].reshape(-1, 3), axis=0)
grid = quantize(grid.reshape(-1, 3), SCENE_COLORS).reshape(SCENE_HEIGHT, SCENE_WIDTH, 3)
save(SCENE_TARGET, np.dstack([grid, np.ones((SCENE_HEIGHT, SCENE_WIDTH), np.float32)]))

# ---------- Filipe: média só dos pixels opacos, que preserva olho e cordão pequenos ----------
meta = json.load(open(ATLAS_JSON, encoding="utf-8"))
atlas = load(ATLAS_SOURCE)
cell_w, cell_h = meta["cell"]["width"], meta["cell"]["height"]
factor = meta["visibleRows"] / FIGURE_ROWS
out_w, out_h = math.ceil(cell_w / factor), math.ceil(cell_h / factor)
cols, rows = atlas.shape[1] // cell_w, atlas.shape[0] // cell_h
small = np.zeros((rows * out_h, cols * out_w, 4), np.float32)
ye, xe = edges(cell_h, out_h), edges(cell_w, out_w)
for row in range(rows):
    for col in range(cols):
        cell = atlas[row * cell_h:(row + 1) * cell_h, col * cell_w:(col + 1) * cell_w]
        for r in range(out_h):
            for c in range(out_w):
                part = cell[ye[r]:ye[r + 1], xe[c]:xe[c + 1]].reshape(-1, 4)
                solid = part[part[:, 3] >= 0.5]
                if len(solid) >= len(part) * 0.45:
                    small[row * out_h + r, col * out_w + c] = [*solid[:, :3].mean(axis=0), 1.0]
keep = small[..., 3] > 0
blur = small[..., :3].copy()
for axis in (0, 1):
    blur = (np.roll(blur, 1, axis) + blur * 2 + np.roll(blur, -1, axis)) / 4
small[keep, :3] = np.clip(small[keep, :3] + (small[keep, :3] - blur[keep]) * FIGURE_SHARPEN, 0, 1)
small[keep, :3] = quantize(small[keep, :3], FIGURE_COLORS)
save(ATLAS_TARGET, small)

meta["cell"] = {"width": out_w, "height": out_h}
meta["soleRow"] = round(meta["soleRow"] / factor)
meta["visibleRows"] = FIGURE_ROWS
with open(os.path.splitext(ATLAS_TARGET)[0] + ".json", "w", encoding="utf-8") as handle:
    json.dump(meta, handle, indent=2)
    handle.write("\n")
print("PIXEL cenario", SCENE_WIDTH, SCENE_HEIGHT, "celula", out_w, out_h, "sola", meta["soleRow"], "atlas", small.shape[1], small.shape[0])
