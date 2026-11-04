"""Geometria do ciclo de caminhada: marcos, parametros de normalizacao e amostragem para a grade de texels."""
import numpy as np
from filipe_lib import ESCALA_GUIA as E, chave_magenta
from imgops import manter_grandes, dilatar, rotular
from landmarks import cor_em, G_VERMELHO, G_AZUL, G_CABECA, caixa_cabeca

B = 6.3                      # pixels da pintura por texel (grade real); mestra de 1360 px -> ~216 linhas
T = 1.0 / B
TE = T * E                   # texels por pixel do guia (768x1152)
ANC_COL, ANC_LIN = 384.0, 1030.0      # ancora do guia (raiz no chao)
PASSO_GUIA = {"front": (42.59, 21.3), "back": (42.59, -21.3)}   # deslocamento da raiz por quadro, px do guia
FRAC_QUADRIL = 0.47          # linha do quadril, fracao da altura cabeca->pe de apoio
CANVAS_W, CANVAS_H = 281, 280
C0, R0 = 140, 232            # coluna/linha da ancora no canvas de trabalho (u=0 no centro da coluna C0; v=0 na borda de cima da linha R0)


def limpar_quadro(rgb):
    """Mascara sem poeira e sem franja roxa: pixels roxos escuros viram o preto do contorno."""
    m = manter_grandes(chave_magenta(rgb), 300)
    rgb = rgb.copy()
    r, g, b = [rgb[..., k].astype(int) for k in range(3)]
    roxo = m & (b - g > 28) & (r - g > 28) & (r + g + b < 520)
    rgb[roxo] = (24, 20, 22)
    return rgb, m


def cremes(rgb):
    r = rgb[..., 0].astype(int); g = rgb[..., 1].astype(int); b = rgb[..., 2].astype(int)
    return (r > 215) & (g > 190) & (b > 135) & (b < 215) & (r - b < 110)


def tenis_pintura(rgb, m, top, bot):
    """Dois aglomerados de creme (sola, biqueira, cadarco) no terco de baixo; separa por x se vierem colados."""
    h = bot - top
    c = cremes(rgb) & m
    c[: top + int(h * 0.70)] = False
    c = manter_grandes(c, 25)
    cl = []
    for raio in (22, 9, 4):
        lab, n = rotular(dilatar(c, raio))
        cl = []
        for k in range(1, n + 1):
            mk = c & (lab == k)
            if mk.sum() >= 150:
                cl.append(mk)
        if len(cl) >= 2:
            break
    if len(cl) < 2:  # k-means em x com 2 centros
        ys, xs = np.nonzero(c)
        c1, c2 = np.percentile(xs, 25), np.percentile(xs, 75)
        for _ in range(20):
            a = np.abs(xs - c1) < np.abs(xs - c2)
            c1, c2 = xs[a].mean(), xs[~a].mean()
        cl = []
        for sel in (a, ~a):
            mk = np.zeros_like(c)
            mk[ys[sel], xs[sel]] = True
            cl.append(mk)
    out = []
    for mk in sorted(cl, key=lambda q: -q.sum())[:2]:
        ys, xs = np.nonzero(mk)
        x0, x1 = xs.min(), xs.max()
        col = m[:, max(x0 - 8, 0): x1 + 9]
        linhas = np.flatnonzero(col.any(axis=1))
        lim = ys.max() + 24
        baixo = linhas[linhas <= lim].max()
        out.append(dict(cx=float(xs.mean()), cy=float(ys.mean()), baixo=float(baixo + 1), n=int(len(ys))))
    return sorted(out, key=lambda d: d["cx"])


SOLA_VERMELHO = [(92, 10, 10), (255, 208, 204)]
SOLA_AZUL = [(6, 31, 74), (201, 222, 255)]


def pes_guia(g):
    """Tenis de cada lado no guia, so pelas cores de sola/biqueira (o resto das cores aparece na canela)."""
    r = {}
    for n, l in (("vermelho", SOLA_VERMELHO), ("azul", SOLA_AZUL)):
        ys, xs = np.nonzero(cor_em(g, l))
        r[n] = (float(xs.mean()), float(ys.mean()), float(ys.max() + 1))
    return r


INICIO_APOIO = {"front": 1, "back": 0}   # primeiro quadro em que o pe vermelho e o de apoio (6 quadros cada pe)


def apoio_por_quadro(direcao):
    """Pe de apoio por quadro: cada pe pisa 6 quadros seguidos; o inicio foi conferido contra o guia
    (pe que recua junto a raiz na velocidade da marcha)."""
    a = INICIO_APOIO[direcao]
    return ["vermelho" if (i - a) % 12 < 6 else "azul" for i in range(12)]


def pe_previsto(pes12, apoio, direcao):
    """Posicao prevista do pe de apoio no guia, por quadro: o pe pisa e recua (-passo) a cada quadro, entao
    todo quadro da mesma pisada cai na mesma reta. Ajuste robusto (mediana) por pisada. Devolve [(cx, baixo)]."""
    sx, sy = PASSO_GUIA[direcao]
    prev = [None] * 12
    a = INICIO_APOIO[direcao]
    for inicio in (a, (a + 6) % 12):
        idx = [(inicio + k) % 12 for k in range(6)]
        pts = [(pes12[i][apoio[i]][0] + k * sx, pes12[i][apoio[i]][2] + k * sy) for k, i in enumerate(idx)]
        p0 = (float(np.median([p[0] for p in pts])), float(np.median([p[1] for p in pts])))
        for k, i in enumerate(idx):
            prev[i] = (p0[0] - k * sx, p0[1] - k * sy)
    return prev


def analisar(D, direcao):
    """Marcos de todos os quadros de uma direcao. Devolve lista de dicts."""
    pes12 = [pes_guia(D[f"g_{direcao}_{i:02d}"]) for i in range(12)]
    apoio = apoio_por_quadro(direcao)
    prev = pe_previsto(pes12, apoio, direcao)
    quadros = []
    for i in range(12):
        p, m = limpar_quadro(D[f"p_{direcao}_{i:02d}"])
        g = D[f"g_{direcao}_{i:02d}"]
        ys = np.flatnonzero(m.any(axis=1))
        top, bot = int(ys.min()), int(ys.max() + 1)
        W, CX = caixa_cabeca(m, top)
        mh = cor_em(g, G_CABECA)
        gt = int(np.flatnonzero(mh.any(axis=1)).min())
        gW, gCX = caixa_cabeca(mh, gt, int(30 / E), int(120 / E))
        tn = tenis_pintura(p, m, top, bot)
        gp = pes12[i]
        n_ap, n_ou = apoio[i], ("azul" if apoio[i] == "vermelho" else "vermelho")
        rank = 0 if prev[i][0] < gp[n_ou][0] else 1
        quadros.append(dict(i=i, p=p, m=m, top=top, bot=bot, W=W, CX=CX, apoio=n_ap,
                            pe=tn[rank], pe_outro=tn[1 - rank], g_top=gt, g_cx=gCX,
                            g_pe=(prev[i][0], gp[n_ap][1], prev[i][1]), g_pe_medido=gp[n_ap], g_pe_outro=gp[n_ou]))
    return quadros


def parametros(quadros, direcao):
    """Escala por cabeca, alvos do guia (cabeca e pe) e vieses constantes medianos entre pintura e guia."""
    Wref = float(np.median([q["W"] for q in quadros]))
    dxs, dys = [], []
    for q in quadros:
        s = T * Wref / q["W"]
        q["s"] = s
        dxs.append(s * (q["pe"]["cx"] - q["CX"]) - TE * (q["g_pe"][0] - q["g_cx"]))
        dys.append(s * (q["pe"]["baixo"] - q["top"]) - TE * (q["g_pe"][2] - q["g_top"]))
    bx, by = float(np.median(dxs)), float(np.median(dys))
    for q in quadros:
        s = q["s"]
        q["u_cab"] = TE * (q["g_cx"] - ANC_COL)
        q["v_pe"] = TE * (q["g_pe"][2] - ANC_LIN)
        q["v_cab_guia"] = TE * (q["g_top"] - ANC_LIN)   # balanco da cabeca no guia (sem vies)
        q["u_pe"] = q["u_cab"] + TE * (q["g_pe"][0] - q["g_cx"]) + bx
        q["v_cab"] = q["v_pe"] - TE * (q["g_pe"][2] - q["g_top"]) - by
        q["v_quad"] = q["v_cab"] + s * FRAC_QUADRIL * (q["pe"]["baixo"] - q["top"])
        q["y_quad"] = q["top"] + FRAC_QUADRIL * (q["pe"]["baixo"] - q["top"])
        # custo da dobra: quanto a pose pintada foi empurrada para o esqueleto do guia
        q["cisalha_x"] = (q["u_pe"] - q["u_cab"]) - s * (q["pe"]["cx"] - q["CX"])
        q["estica_y"] = (q["v_pe"] - q["v_quad"]) / (s * (q["pe"]["baixo"] - q["y_quad"])) - 1.0
        q["desloc_y"] = (q["v_pe"] - q["v_cab"]) - s * (q["pe"]["baixo"] - q["top"])
    return dict(Wref=Wref, vies_x=bx, vies_y=by)


def mapa_fonte(q, v, u):
    """Para centros de texel (v linhas, u colunas) devolve (x_src, y_src, meia_caixa_x, meia_caixa_y)."""
    s = q["s"]
    vp = np.array([q["v_cab"], q["v_quad"], q["v_pe"]])
    yp = np.array([q["top"], q["y_quad"], q["pe"]["baixo"]])
    y = np.interp(v, vp, yp)
    y = np.where(v < vp[0], yp[0] + (v - vp[0]) / s, y)
    s_lo = (vp[2] - vp[1]) / (yp[2] - yp[1])
    y = np.where(v > vp[2], yp[2] + (v - vp[2]) / s_lo, y)
    sx = np.interp(v, [vp[1], vp[2]], [q["CX"], q["pe"]["cx"]])
    ux = np.interp(v, [vp[1], vp[2]], [q["u_cab"], q["u_pe"]])
    x = sx + (u - ux) / s
    sy = np.where(v < vp[1], s, s_lo)
    return x, y, 0.5 / s, 0.5 / sy


def amostrar(rgb, m, x, y, bx, by, janela=6):
    """Mediana por canal dos pixels da caixa de cada texel. x,y: (N,) centros fonte; bx escalar; by (N,)."""
    h, w = m.shape
    N = len(x)
    ox = np.arange(-janela, janela + 1)
    xi = np.floor(x).astype(int)[:, None] + ox[None, :]
    yi = np.floor(y).astype(int)[:, None] + ox[None, :]
    okx = (np.abs(xi + 0.5 - x[:, None]) <= bx) & (xi >= 0) & (xi < w)
    oky = (np.abs(yi + 0.5 - y[:, None]) <= by[:, None]) & (yi >= 0) & (yi < h)
    xc = np.clip(xi, 0, w - 1)
    yc = np.clip(yi, 0, h - 1)
    idx = (yc[:, :, None] * w + xc[:, None, :]).reshape(N, -1)
    box = (oky[:, :, None] & okx[:, None, :]).reshape(N, -1)
    mm = m.ravel()[idx] & box
    cov = mm.sum(axis=1) / np.maximum(box.sum(axis=1), 1)
    alfa = cov >= 0.5
    out = np.zeros((N, 3), np.float32)
    flat = rgb.reshape(-1, 3)
    for k in range(3):
        v = np.where(mm, flat[idx, k].astype(np.float32), np.nan)
        with np.errstate(all="ignore"):
            med = np.nanmedian(v, axis=1)
        out[:, k] = np.where(np.isnan(med), 0, med)
    return out, alfa


def renderizar(q):
    """Amostra o quadro no canvas de trabalho. Devolve rgb (H,W,3) float e alfa (H,W) bool."""
    rr, cc = np.meshgrid(np.arange(CANVAS_H), np.arange(CANVAS_W), indexing="ij")
    v = (rr - R0 + 0.5).astype(np.float64)
    u = (cc - C0).astype(np.float64)
    x, y, bx, by = mapa_fonte(q, v, u)
    ys = np.flatnonzero(q["m"].any(axis=1))
    xs = np.flatnonzero(q["m"].any(axis=0))
    dentro = (x > xs.min() - 8) & (x < xs.max() + 8) & (y > ys.min() - 8) & (y < ys.max() + 8)
    rgb = np.zeros((CANVAS_H, CANVAS_W, 3), np.float32)
    alfa = np.zeros((CANVAS_H, CANVAS_W), bool)
    sel = dentro.ravel()
    c, a = amostrar(q["p"], q["m"], x.ravel()[sel], y.ravel()[sel], float(np.ravel(bx)[0]), np.broadcast_to(by, x.shape).ravel()[sel])
    rgb.reshape(-1, 3)[sel] = c
    alfa.ravel()[sel] = a
    return rgb, alfa
