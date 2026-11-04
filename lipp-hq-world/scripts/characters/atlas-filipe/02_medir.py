import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from filipe_lib import *
D = np.load(os.path.join(TMP, "entradas.npz"))

def banda(mask, k0, k1):
    ys = np.flatnonzero(mask.any(axis=1)); top = ys.min()
    ws, cs = [], []
    for r in range(top + k0, top + k1):
        xs = np.flatnonzero(mask[r])
        ws.append(xs.max() - xs.min() + 1); cs.append((xs.max() + xs.min()) / 2)
    return top, ys.max(), np.mean(ws), np.mean(cs)

for d in ("front", "back"):
    print("==", d)
    for i in range(12):
        p = D[f"p_{d}_{i:02d}"]; g = D[f"g_{d}_{i:02d}"]
        mp = chave_magenta(p); mg = chave_magenta(g)
        tp, bp, wp, cp = banda(mp, 30, 120)
        tg, bg, wg, cg = banda(mg, int(30/ESCALA_GUIA), int(120/ESCALA_GUIA))
        # pintura bbox horizontal
        xs = np.flatnonzero(mp.any(axis=0))
        print(f"{i:02d} pint top{tp:5d} sola{bp:5d} cab_larg{wp:6.1f} cab_cx{cp:7.1f} | guia(x4/3) top{tg*ESCALA_GUIA:7.1f} sola{bg*ESCALA_GUIA:7.1f} larg{wg*ESCALA_GUIA:6.1f} cx{cg*ESCALA_GUIA:7.1f} | altura pint {bp-tp} guia {(bg-tg)*ESCALA_GUIA:.0f}  x[{xs.min()},{xs.max()}]")
# mascara residual roxa
p = D["p_front_00"]; m = chave_magenta(p)
r,g,b = [p[...,k].astype(int) for k in range(3)]
purp = m & (b-g>40) & (r-g>40)
print("pixels roxos dentro da mascara f00:", purp.sum(), "de", m.sum())
