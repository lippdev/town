"""Monta o atlas de caminhada do Filipe a partir das folhas geradas, com fundo magenta.

Cada folha tem 4 quadros numa fileira. O script separa os quadros pelas colunas vazias,
alinha todos pela cabeça (o balanço vertical do desenho fica), reduz à grade real, limita a
paleta e grava um atlas de 4 colunas por 2 linhas: frente em cima, costas embaixo.
Roda no Python do Blender:

  blender --background --factory-startup --python scripts/characters/pixelize-walk.py -- \
    docs/characters/filipe/walk-front.png docs/characters/filipe/walk-back.png \
    public/characters/filipe/walk.png
"""
import os
import sys

import bpy
import numpy as np

FRONT, BACK, TARGET = sys.argv[sys.argv.index("--") + 1:][:3]
BLOCK = 6
COLORS = 32
PADDING = 3
FRAMES = 4
CLOTH_LIGHT = np.array([0x41, 0x40, 0x45], float)
CLOTH_BASE = np.array([0x29, 0x28, 0x2d], float)
CORD_LIGHT = np.array([0xa8, 0xa8, 0xac], float)
CORD_DARK = np.array([0x62, 0x62, 0x67], float)


def load(path):
    image = bpy.data.images.load(os.path.abspath(path))
    width, height = image.size
    return (np.array(image.pixels[:], np.float32).reshape(height, width, 4)[::-1])[..., :3] * 255.0


def key_out(rgb):
    """Magenta e a franja roxa da borda: vermelho e azul altos e parecidos, verde bem abaixo."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return ~((r > 120) & (b > 120) & (np.abs(r - b) < 70) & (g < r * 0.62))


def split_frames(mask):
    """Quadros são as faixas de colunas com personagem, separadas por colunas vazias."""
    used = mask.sum(axis=0) > 2
    edges = np.flatnonzero(np.diff(np.concatenate([[0], used.astype(int), [0]])))
    runs = [(a, b) for a, b in zip(edges[::2], edges[1::2]) if b - a > 60]
    if len(runs) != FRAMES:
        raise SystemExit(f"esperava {FRAMES} quadros, achei {len(runs)}: {runs}")
    return runs


def head_center(mask, x0, x1):
    ys = np.flatnonzero(mask[:, x0:x1].any(axis=1))
    top = ys.min()
    xs = np.flatnonzero(mask[top:top + 100, x0:x1].any(axis=0))
    return x0 + (xs.min() + xs.max()) / 2


def retouch(rgb, mask, head_x, top, is_front):
    """Reflexo marrom na roupa e cordões creme: a ficha tem tecido neutro e cordão cinza."""
    r, b = rgb[..., 0], rgb[..., 2]
    light = rgb.mean(axis=2)
    brown = mask & (r - b > 14) & (r < 125)
    rows = np.arange(rgb.shape[0])[:, None]
    cols = np.arange(rgb.shape[1])[None, :]
    body = rows >= top + 165
    hood_side = (rows >= top + 110) & (rows < top + 165) & (cols < head_x - 45)
    target = brown & (body | hood_side)
    rgb[target & (light > 60)] = CLOTH_LIGHT
    rgb[target & (light <= 60)] = CLOTH_BASE
    if is_front:
        # no ombro do lado da luz o reflexo é mais claro; ali só há tecido, as mãos ficam abaixo
        shoulder = (rows >= top + 110) & (rows < top + 330) & (cols < head_x - 25)
        rgb[mask & shoulder & (r - b > 14) & (light > 60)] = CLOTH_LIGHT
        rgb[mask & shoulder & (r - b > 14) & (light <= 60)] = CLOTH_BASE
        chest =(rows >= top + 165) & (rows < top + 250) & (np.abs(cols - head_x) < 60)
        rgb[mask & chest & (light > 150)] = CORD_LIGHT
        rgb[mask & chest & (light > 80) & (light <= 150)] = CORD_DARK


def to_grid(rgb, mask, x_center, half_width, y0, rows):
    cols = int(half_width * 2 // BLOCK)
    x0 = int(round(x_center - cols * BLOCK / 2))
    out = np.zeros((rows, cols, 3), np.float32)
    keep = np.zeros((rows, cols), bool)
    for r in range(rows):
        for c in range(cols):
            ya, xa = y0 + r * BLOCK, x0 + c * BLOCK
            cell = mask[ya:ya + BLOCK, xa:xa + BLOCK]
            if cell.size and cell.mean() >= 0.5:
                out[r, c] = np.median(rgb[ya:ya + BLOCK, xa:xa + BLOCK][cell], axis=0)
                keep[r, c] = True
    return out, keep


def build_row(path, is_front):
    rgb = load(path)
    mask = key_out(rgb)
    runs = split_frames(mask)
    centers = [head_center(mask, a, b) for a, b in runs]
    half_width = max(max(c - a, b - c) for (a, b), c in zip(runs, centers)) + BLOCK
    ys = np.flatnonzero(mask.any(axis=1))
    y0, y1 = ys.min(), ys.max() + 1
    rows = (y1 - y0 + BLOCK - 1) // BLOCK
    cells = []
    for (a, b), center in zip(runs, centers):
        only = np.zeros_like(mask)
        only[:, a:b] = mask[:, a:b]
        retouch(rgb, only, center, y0, is_front)
        cells.append(to_grid(rgb, only, center, half_width, y0, rows))
    return cells


def quantize(cells):
    """K-means com semente fixa e paleta única: mesma fonte, mesmo atlas."""
    pixels = np.concatenate([grid[keep] for grid, keep in cells])
    rng = np.random.default_rng(7)
    centers = pixels[rng.choice(len(pixels), COLORS, replace=False)]
    for _ in range(24):
        labels = np.argmin(((pixels[:, None] - centers[None]) ** 2).sum(axis=2), axis=1)
        for i in range(COLORS):
            if (labels == i).any():
                centers[i] = pixels[labels == i].mean(axis=0)
    for grid, keep in cells:
        found = np.argmin(((grid[keep][:, None] - centers[None]) ** 2).sum(axis=2), axis=1)
        grid[keep] = centers[found]


front, back = build_row(FRONT, True), build_row(BACK, False)
quantize(front + back)

cell_w = max(g.shape[1] for g, _ in front + back) + 2 * PADDING
cell_h = max(g.shape[0] for g, _ in front + back) + 2 * PADDING
atlas = np.zeros((cell_h * 2, cell_w * FRAMES, 4), np.float32)
rows_visible, soles = [], []
for row, cells in enumerate((front, back)):
    # todas as linhas com a sola na mesma altura da célula: uma âncora só para o componente
    sole = int(round(np.mean([np.flatnonzero(k.any(axis=1)).max() + 1 for _, k in cells])))
    top = cell_h - PADDING - sole
    for col, (grid, keep) in enumerate(cells):
        h, w = grid.shape[:2]
        x = col * cell_w + (cell_w - w) // 2
        y = row * cell_h + top
        y_from, y_to = max(y, row * cell_h), min(y + h, (row + 1) * cell_h)
        src = y_from - y
        atlas[y_from:y_to, x:x + w, :3] = grid[src:src + y_to - y_from] / 255.0
        atlas[y_from:y_to, x:x + w, 3] = keep[src:src + y_to - y_from]
    rows_visible.append(sole - min(np.flatnonzero(k.any(axis=1)).min() for _, k in cells))
    soles.append(cell_h - PADDING)

height, width = atlas.shape[:2]
image = bpy.data.images.new("walk", width, height, alpha=True)
image.alpha_mode = "STRAIGHT"
image.pixels = atlas[::-1].ravel()
image.filepath_raw = os.path.abspath(TARGET)
image.file_format = "PNG"
image.save()
print("WALK atlas", width, height, "celula", cell_w, cell_h, "sola", soles, "altura visivel", [int(v) for v in rows_visible])
