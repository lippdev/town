"""Etapa 2: parado a partir da arte-mestra, por deformacao sutil (respiracao), sem gerar nada novo.

A mestra entra na mesma grade da caminhada (mesmos pixels por texel). A base e amostrada uma vez;
as 8 celulas sao deslocamentos INTEIROS de linhas sobre essa base: tronco e ombros sobem 1-2 texels com a
respiracao, cabeca e bracos seguem com atraso, do quadril para baixo (pernas e pes) nada se mexe.
"""
import sys, os, pickle
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from filipe_lib import *
from walk_geom import *
from landmarks import caixa_cabeca
from imgops import manter_grandes

D = np.load(os.path.join(TMP, "entradas.npz"))
W = pickle.load(open(os.path.join(TMP, "walk_cru.pkl"), "rb"))
meta = carregar_meta()
SOLA_IDLE = {"front": 1101.0, "back": 1064.0}      # sola mais baixa nos guias de parado (metadados)
N = 8
AMP_TRONCO, AMP_CABECA, AMP_BRACO = 1.6, 1.1, 1.0   # texels (pico) da respiracao
ATRASO_CABECA, ATRASO_BRACO = np.pi / 4, np.pi / 2  # 1 e 2 quadros de 8


def suave(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def base_texels(direcao):
    p, m = limpar_quadro(D[f"m_{direcao}"])
    ys = np.flatnonzero(m.any(axis=1))
    top, bot = int(ys.min()), int(ys.max() + 1)
    Wm, CXm = caixa_cabeca(m, top)
    s = T   # mesma escala (px por texel) para as duas mestras: ~215 linhas de altura e a mesma estatura de frente e de costas
    tn = tenis_pintura(p, m, top, bot)
    cx_pes = np.mean([t["cx"] for t in tn])
    # guia de parado: centro entre os dois tenis e linha da sola
    g = D[f"gi_{direcao}_0"]
    gp = pes_guia(g)
    gcx = 0.5 * (gp["vermelho"][0] + gp["azul"][0])
    u_pes = TE * (gcx - ANC_COL)
    v_sola = TE * (SOLA_IDLE[direcao] - ANC_LIN)
    rr, cc = np.meshgrid(np.arange(CANVAS_H), np.arange(CANVAS_W), indexing="ij")
    v = (rr - R0 + 0.5).astype(np.float64)
    u = (cc - C0).astype(np.float64)
    x = cx_pes + (u - u_pes) / s
    y = bot + (v - v_sola) / s
    ysn = np.flatnonzero(m.any(axis=1)); xsn = np.flatnonzero(m.any(axis=0))
    dentro = (x > xsn.min() - 8) & (x < xsn.max() + 8) & (y > ysn.min() - 8) & (y < ysn.max() + 8)
    sel = dentro.ravel()
    rgb = np.zeros((CANVAS_H, CANVAS_W, 3), np.float32)
    alfa = np.zeros((CANVAS_H, CANVAS_W), bool)
    c, a = amostrar(p, m, x.ravel()[sel], y.ravel()[sel], 0.5 / s, np.full(sel.sum(), 0.5 / s))
    rgb.reshape(-1, 3)[sel] = c
    alfa.ravel()[sel] = a
    print(direcao, "mestra: largura de cabeca", round(Wm, 1), "px =", round(Wm * s, 1), "texels; caminhada:", round(W[direcao]["par"]["Wref"] * T, 1), "texels")
    return rgb, alfa


def deformar(rgb, alfa, k):
    """Quadro k (0..7) a partir da base, por deslocamento vertical inteiro por (linha, coluna)."""
    linhas = np.flatnonzero(alfa.any(axis=1))
    ht, hb = int(linhas.min()), int(linhas.max() + 1)
    H = hb - ht
    theta = 2 * np.pi * k / N
    r = np.arange(CANVAS_H, dtype=np.float64)
    f = (r - ht) / H                     # fracao da altura (0 = topo da cabeca)
    # amplitude complexa a(r) = A * exp(i*fase): cabeca (atrasada) -> tronco -> some no quadril
    a_cab = AMP_CABECA * np.exp(-1j * ATRASO_CABECA)
    a_tro = AMP_TRONCO + 0j
    pesoT = suave((f - 0.16) / 0.05)            # cabeca -> tronco, pelo pescoco
    desce = 1.0 - suave((f - 0.50) / 0.14)      # tronco some do meio para o quadril
    a_r = ((1 - pesoT) * a_cab + pesoT * a_tro) * np.where(f < 0.16, 1.0, desce)
    # bracos: colunas externas da silhueta, linhas do ombro as maos, com atraso maior
    a_braco = AMP_BRACO * np.exp(-1j * ATRASO_BRACO)
    rows_arm = suave((f - 0.20) / 0.04) * (1.0 - suave((f - 0.62) / 0.05))
    cx_r = np.zeros(CANVAS_H); hw_r = np.ones(CANVAS_H)
    for i in range(CANVAS_H):
        xs = np.flatnonzero(alfa[i])
        if len(xs):
            cx_r[i] = 0.5 * (xs.min() + xs.max()); hw_r[i] = 0.5 * (xs.max() - xs.min() + 1)
    cols = np.arange(CANVAS_W, dtype=np.float64)[None, :]
    wcol = suave((np.abs(cols - cx_r[:, None]) - 0.56 * hw_r[:, None]) / (0.2 * hw_r[:, None] + 1e-6))
    w = wcol * rows_arm[:, None]
    a_tot = (1 - w) * a_r[:, None] + w * a_braco
    dy = np.round(-np.imag(a_tot * np.exp(1j * theta))).astype(int)   # negativo = sobe
    out_rgb = np.zeros_like(rgb); out_a = np.zeros_like(alfa)
    rr, cc = np.meshgrid(np.arange(CANVAS_H), np.arange(CANVAS_W), indexing="ij")
    src = rr - dy
    ok = (src >= 0) & (src < CANVAS_H)
    out_rgb[ok] = rgb[src[ok], cc[ok]]
    out_a[ok] = alfa[src[ok], cc[ok]]
    return out_rgb, out_a, dy


saida = {}
for direcao in ("front", "back"):
    rgb, alfa = base_texels(direcao)
    linhas = np.flatnonzero(alfa.any(axis=1))
    print(direcao, "base: linhas visiveis", linhas.max() + 1 - linhas.min(), "topo", linhas.min(), "base", linhas.max() + 1)
    frames = []
    for k in range(N):
        o, a, dy = deformar(rgb, alfa, k)
        frames.append(dict(rgb=o, alfa=a))
        print(f"  k={k} dy tronco(min,max)={dy[alfa].min()},{dy[alfa].max()}")
    saida[direcao] = dict(frames=frames, base=dict(rgb=rgb, alfa=alfa))
with open(os.path.join(TMP, "idle_cru.pkl"), "wb") as f:
    pickle.dump(saida, f)
