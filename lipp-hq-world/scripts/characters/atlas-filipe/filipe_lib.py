"""Funções comuns do pipeline do atlas do Filipe. Roda no Python do Blender (numpy, bpy)."""
import json
import os
import sys

import numpy as np

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
TMP = os.path.join(RAIZ, "atlas", "tmp")
ATLAS = os.path.join(RAIZ, "atlas")
ESCALA_GUIA = 4.0 / 3.0  # guia 768x1152 -> pintura 1024x1536


def args():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def ler_png(caminho):
    """Devolve RGBA uint8 (linha 0 no topo)."""
    import bpy
    img = bpy.data.images.load(os.path.abspath(caminho))
    w, h = img.size
    buf = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    arr = (buf.reshape(h, w, 4)[::-1] * 255.0 + 0.5).astype(np.uint8)
    return arr


def gravar_png(caminho, rgba):
    """rgba: float 0..1 ou uint8, linha 0 no topo; alfa direto (STRAIGHT)."""
    import bpy
    a = np.asarray(rgba)
    if a.dtype == np.uint8:
        a = a.astype(np.float32) / 255.0
    h, w = a.shape[:2]
    img = bpy.data.images.new(os.path.basename(caminho), w, h, alpha=True)
    img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set(np.ascontiguousarray(a[::-1], np.float32).ravel())
    img.filepath_raw = os.path.abspath(caminho)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def chave_magenta(rgb):
    """True onde há personagem. Magenta e franja roxa: R e B altos e parecidos, G bem abaixo."""
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    fundo = (r > 120) & (b > 120) & (np.abs(r - b) < 70) & (g < r * 0.62)
    return ~fundo


def carregar_meta():
    with open(os.path.join(RAIZ, "guias", "metadados.json"), encoding="utf-8") as f:
        return json.load(f)
