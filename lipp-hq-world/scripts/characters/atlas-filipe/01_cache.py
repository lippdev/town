"""Lê todas as entradas (24 quadros pintados, 2 mestras, 24+16 guias) e grava num npz local."""
import os
import numpy as np
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from filipe_lib import *

dados = {}
for d in ("front", "back"):
    for i in range(12):
        dados[f"p_{d}_{i:02d}"] = ler_png(os.path.join(RAIZ, "pintura", f"walk-{d}", f"{i:02d}.png"))[..., :3]
        dados[f"g_{d}_{i:02d}"] = ler_png(os.path.join(RAIZ, "guias", f"walk-{d}-{i:02d}.png"))[..., :3]
    dados[f"m_{d}"] = ler_png(os.path.join(RAIZ, "arte", "gpt2", f"master-{d}.png"))[..., :3]
    for i in range(8):
        dados[f"gi_{d}_{i}"] = ler_png(os.path.join(RAIZ, "guias", f"idle-{d}-{i:02d}.png"))[..., :3]
np.savez(os.path.join(TMP, "entradas.npz"), **dados)
print("OK", len(dados), {k: v.shape for k, v in list(dados.items())[:3]})
