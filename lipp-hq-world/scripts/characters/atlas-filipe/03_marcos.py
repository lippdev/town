"""Mede marcos nas pinturas (cabeça, tênis) e nos guias (cabeça, tênis, pé de apoio)."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from filipe_lib import *
from imgops import *
from landmarks import *

D = np.load(os.path.join(TMP, "entradas.npz"))
meta = carregar_meta()
MARC = {}


def cream(rgb):
    r = rgb[..., 0].astype(int); g = rgb[..., 1].astype(int); b = rgb[..., 2].astype(int)
    return (r > 215) & (g > 190) & (b > 135) & (b < 215) & (r - b < 110)


def aglomerados_tenis(p, mask, top, bottom):
    """Dois aglomerados de pixels creme (sola/biqueira/cadarço) na parte baixa do corpo."""
    h = bottom - top
    c = cream(p) & mask
    c[: top + int(h * 0.70)] = False
    c = manter_grandes(c, 25)
    near = dilatar(c, 22)
    lab, n = rotular(near)
    cl = []
    for k in range(1, n + 1):
        m = c & (lab == k)
        ys, xs = np.nonzero(m)
        if len(ys) < 150:
            continue
        cl.append(dict(n=int(len(ys)), cx=float(xs.mean()), cy=float(ys.mean()), baixo=int(ys.max()),
                       x0=int(xs.min()), x1=int(xs.max()), y0=int(ys.min())))
    cl.sort(key=lambda d: -d["n"])
    return cl[:2]


for d in ("front", "back"):
    sola_ap = meta["marcha"]["validacao" if d == "front" else "validacao_back_tela"]["tela"]["sola_pe_apoio_px_por_quadro"] \
        if d == "front" else meta["marcha"]["validacao_back_tela"]["sola_pe_apoio_px_por_quadro"]
    for i in range(12):
        key = f"{d}_{i:02d}"
        p = D["p_" + key]; g = D["g_" + key]
        mp = manter_grandes(chave_magenta(p), 300)
        ys = np.flatnonzero(mp.any(axis=1)); top, bot = int(ys.min()), int(ys.max())
        W, CX = caixa_cabeca(mp, top)
        # guia
        mg = chave_magenta(g)
        mh = cor_em(g, G_CABECA)
        gys = np.flatnonzero(mh.any(axis=1)); gtop = int(gys.min())
        gW, gCX = caixa_cabeca(mh, gtop, int(30 / ESCALA_GUIA), int(120 / ESCALA_GUIA))
        apoio, pes = pes_guia(g, sola_ap[i])
        outro = "azul" if apoio == "vermelho" else "vermelho"
        cls = aglomerados_tenis(p, mp, top, bot)
        MARC[key] = dict(
            pint=dict(top=top, baixo=bot, cabW=W, cabCX=CX, x0=int(np.flatnonzero(mp.any(axis=0)).min()),
                      x1=int(np.flatnonzero(mp.any(axis=0)).max()), tenis=cls),
            guia=dict(top=gtop, cabW=gW, cabCX=gCX, apoio=apoio, sola_ref=sola_ap[i],
                      pe_apoio=dict(baixo=int(pes[apoio]["baixo"]), cx=float(pes[apoio]["cx"]), cy=float(pes[apoio]["cy"])),
                      pe_outro=dict(baixo=int(pes[outro]["baixo"]), cx=float(pes[outro]["cx"]), cy=float(pes[outro]["cy"]))),
        )
        print(key, "top", top, "W %.1f" % W, "tenis", [(c["n"], round(c["cx"]), round(c["cy"]), c["baixo"]) for c in cls],
              "| guia apoio", apoio, "apoio cx/baixo %.0f/%d" % (pes[apoio]["cx"], pes[apoio]["baixo"]), "outro cx/baixo %.0f/%d" % (pes[outro]["cx"], pes[outro]["baixo"]), "ref", sola_ap[i])
with open(os.path.join(TMP, "marcos.json"), "w") as f:
    json.dump(MARC, f, indent=1)
