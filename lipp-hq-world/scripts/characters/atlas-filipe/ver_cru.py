"""Folha de conferencia dos quadros crus (antes de retoques): uso -- ver_cru.py <pkl> <saida.png> [escala]"""
import sys, os, pickle
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from filipe_lib import *

pkl, saida = args()[0], args()[1]
esc = int(args()[2]) if len(args()) > 2 else 2
S = pickle.load(open(pkl, "rb"))
BG = np.array([0xC9, 0xA3, 0x6F], np.uint8)
linhas = []
for d in ("front", "back"):
    fr = S[d]["frames"]
    ys = [np.flatnonzero(f["alfa"].any(axis=1)) for f in fr]
    y0 = min(a.min() for a in ys) - 3
    y1 = max(a.max() for a in ys) + 4
    tiles = []
    for f in fr:
        t = np.where(f["alfa"][y0:y1, :, None], f["rgb"][y0:y1].astype(np.uint8), BG)
        tiles.append(t[:, 20:261])
    while len(tiles) % 6:
        tiles.append(np.zeros_like(tiles[0]) + BG)
    for k in range(0, len(tiles), 6):
        linhas.append(np.concatenate(tiles[k:k + 6], axis=1))
img = np.concatenate(linhas, axis=0)
img = np.repeat(np.repeat(img, esc, 0), esc, 1)
gravar_png(saida, np.concatenate([img, np.full(img.shape[:2] + (1,), 255, np.uint8)], axis=2))
print(img.shape)
