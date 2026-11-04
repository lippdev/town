"""Monta, para cada quadro, pintura (esq) e guia ampliado 4/3 (dir) lado a lado, recortados na metade de baixo."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from filipe_lib import *
D = np.load(os.path.join(TMP, "entradas.npz"))
d = sys.argv[-1]
tiles = []
for i in range(12):
    p = D[f"p_{d}_{i:02d}"][700:1480]
    g = D[f"g_{d}_{i:02d}"]
    g = np.repeat(np.repeat(g, 4, 0), 4, 1)[::3, ::3]  # 768x1152 -> 1024x1536 (x4/3)
    g = g[700:1480]
    t = np.concatenate([p[:, 150:900], g[:, 150:900]], axis=1)[::2, ::2]
    tiles.append(t)
rows = [np.concatenate(tiles[k:k+3], axis=1) for k in range(0, 12, 3)]
out = np.concatenate(rows, axis=0)
gravar_png(os.path.join(TMP, f"pares-{d}.png"), np.concatenate([out, np.full(out.shape[:2] + (1,), 255, np.uint8)], axis=2))
print(out.shape)
