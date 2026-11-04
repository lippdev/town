"""Etapa 1 do atlas: normaliza cada quadro (escala pela cabeca, ancora pelo pe de apoio) e amostra na grade."""
import sys, os, pickle, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from filipe_lib import *
from walk_geom import *

D = np.load(os.path.join(TMP, "entradas.npz"))
saida = {}
for direcao in ("front", "back"):
    t0 = time.time()
    qs = analisar(D, direcao)
    par = parametros(qs, direcao)
    print("==", direcao, par, "apoio:", [q["apoio"][:3] for q in qs])
    frames = []
    for q in qs:
        rgb, alfa = renderizar(q)
        frames.append(dict(rgb=rgb, alfa=alfa))
        print(f"{q['i']:02d} s={q['s']:.4f} u_cab={q['u_cab']:.1f} v_cab={q['v_cab']:.1f} u_pe={q['u_pe']:.1f} v_pe={q['v_pe']:.1f}"
              f" cisalha_x={q['cisalha_x']:+.1f} desloc_y={q['desloc_y']:+.1f} estica_y={100*q['estica_y']:+.1f}% apoio={q['apoio']}")
    info = [{k: v for k, v in q.items() if k not in ("p", "m")} for q in qs]
    saida[direcao] = dict(frames=frames, info=info, par=par)
    print("tempo", round(time.time() - t0, 1))
with open(os.path.join(TMP, "walk_cru.pkl"), "wb") as f:
    pickle.dump(saida, f)
