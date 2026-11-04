"""Retoques em texels: classes de cor, roupa neutra, contorno seletivo, cabelo e suavizacao temporal da roupa."""
import numpy as np
from imgops import dilatar

CONTORNO_PELE = np.array([0x2B, 0x1F, 0x1B], np.float32)   # pele, cabelo e tenis
CONTORNO_ROUPA = np.array([0x1E, 0x1E, 0x24], np.float32)  # roupa
TONS = np.array([[0x15, 0x14, 0x18], [0x29, 0x28, 0x2D], [0x41, 0x40, 0x45]], np.float32)  # frios: escuro, medio, claro
LIM_TOM = (22.0, 46.0)      # luminancia: abaixo -> escuro; abaixo -> medio; resto -> claro
QUEIXO = {"front": 0.19, "back": 0.15}    # fracao da altura onde acaba a cabeca (roupa so abaixo)
LINHAS_CABELO = 14          # linhas do topo usadas para comparar o tom do cabelo
LINHAS_CABELO_APLICA = 26   # linhas do topo onde o tom de costas e ajustado


def lum(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def altura(alfa):
    ys = np.flatnonzero(alfa.any(axis=1))
    return int(ys.min()), int(ys.max() + 1)


def classes(rgb, alfa, direcao):
    """Mascaras por frame: creme (tenis), quente (pele/cabelo), tenis (creme + vizinhos escuros), roupa, rigido."""
    ht, hb = altura(alfa)
    H = hb - ht
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    L = lum(rgb)
    linhas = np.arange(alfa.shape[0])[:, None]
    baixo = linhas >= ht + 0.70 * H
    creme = alfa & baixo & (r > 205) & (g > 180) & (b > 125) & (b < 215) & (r - b < 110)
    quente = alfa & (r - b > 38)
    tenis = dilatar(creme, 2) & alfa & baixo
    abaixo_queixo = linhas >= ht + QUEIXO[direcao] * H
    roupa = alfa & abaixo_queixo & ~quente & ~creme & ~tenis & (L <= 100)
    return dict(ht=ht, hb=hb, H=H, creme=creme, quente=quente, tenis=tenis, roupa=roupa, L=L)


def tom_indice(L):
    return np.where(L < LIM_TOM[0], 0, np.where(L < LIM_TOM[1], 1, 2)).astype(np.int8)


def contorno(rgb, alfa, cl):
    """Troca o preto da borda externa: marrom na pele/cabelo/tenis, grafite na roupa. Devolve mascara dos pixels trocados."""
    h, w = alfa.shape
    p = np.pad(alfa, 1)
    viz4 = p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    borda = alfa & ~viz4
    cand = borda & (cl["L"] < 62)
    interior = alfa & ~borda
    quente_ou_creme = (cl["quente"] | cl["creme"] | cl["tenis"]) & ~cand
    neutro = interior & ~cl["quente"] & ~cl["creme"] & (cl["L"] >= 45)
    def soma5(m):
        pm = np.pad(m.astype(np.int16), 2)
        out = np.zeros(m.shape, np.int16)
        for dy in range(5):
            for dx in range(5):
                out += pm[dy:dy + h, dx:dx + w]
        return out
    n_q = soma5(quente_ou_creme)
    n_n = soma5(neutro)
    marrom = cand & (n_q > 0) & (n_q >= n_n)
    grafite = cand & ~marrom
    rgb[marrom] = CONTORNO_PELE
    rgb[grafite] = CONTORNO_ROUPA
    return marrom | grafite, marrom, grafite


def tons_roupa(rgb, cl):
    """Tecido preto so com os tres tons frios. Devolve o indice do tom (-1 fora da roupa)."""
    idx = np.full(rgb.shape[:2], -1, np.int8)
    m = cl["roupa"]
    t = tom_indice(cl["L"])
    idx[m] = t[m]
    rgb[m] = TONS[t[m]]
    return idx


def pixels_cabelo(rgb, alfa, cl, linhas):
    ht = cl["ht"]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    zona = np.zeros(alfa.shape, bool)
    zona[ht: ht + linhas] = True
    return alfa & zona & cl["quente"] & (g < 150) & (cl["L"] > 40) & (cl["L"] < 165)


def casar_cabelo(rgb_costas, mask_aplica, ref_cores, base_costas):
    """Especificacao de histograma na luminancia. O quantil de cada pixel vem da distribuicao de costas medida
    nas linhas de referencia (base_costas); a cor nova e a da frente que ocupa o mesmo quantil. Mantem a ordem
    claro/escuro do desenho e troca o tom avermelhado pelo castanho com luzes caramelo da frente."""
    cores = rgb_costas[mask_aplica]
    if len(cores) == 0:
        return
    Lb = np.sort(lum(base_costas))
    q = np.searchsorted(Lb, lum(cores)) / float(len(Lb))
    ref = ref_cores[np.argsort(lum(ref_cores), kind="stable")]
    pos = np.clip((q * len(ref)).astype(int), 0, len(ref) - 1)
    rgb_costas[mask_aplica] = ref[pos]


def melhor_deslocamento(a, b, regiao, alcance=3):
    """Deslocamento inteiro (dy,dx) que melhor leva b sobre a dentro da regiao (SAD sobre indices de tom; 3 = fora da roupa)."""
    h, w = a.shape
    melhor, passo = None, (0, 0)
    ys, xs = np.nonzero(regiao)
    for dy in range(-alcance, alcance + 1):
        for dx in range(-alcance, alcance + 1):
            yy = np.clip(ys - dy, 0, h - 1); xx = np.clip(xs - dx, 0, w - 1)
            sad = np.abs(a[ys, xs].astype(int) - b[yy, xx].astype(int)).sum()
            if melhor is None or sad < melhor:
                melhor, passo = sad, (dy, dx)
    return passo


def mapa_tom(idx):
    t = idx.copy().astype(np.int8)
    t[t < 0] = 3
    return t


def suavizar_roupa(idx_seq, caixa_seq):
    """Mediana temporal de 3 quadros (anterior, atual, seguinte) so nos tons da roupa, com vizinhos alinhados.
    caixa_seq[i]: mascara do tronco de cada quadro (coordenadas do canvas). Devolve novos indices e estatisticas."""
    n = len(idx_seq)
    novos = [x.copy() for x in idx_seq]
    trocados = []
    for i in range(n):
        a = mapa_tom(idx_seq[i])
        vizinhos = []
        for j in ((i - 1) % n, (i + 1) % n):
            bj = mapa_tom(idx_seq[j])
            dy, dx = melhor_deslocamento(a, bj, caixa_seq[i])
            vizinhos.append(np.roll(np.roll(idx_seq[j], dy, axis=0), dx, axis=1))
        p, s = vizinhos
        cur = idx_seq[i]
        valido = caixa_seq[i] & (cur >= 0) & (p >= 0) & (s >= 0)
        med = np.median(np.stack([p, cur, s]), axis=0).astype(np.int8)
        novo = np.where(valido, med, cur)
        trocados.append(int((novo != cur).sum()))
        novos[i] = novo.astype(np.int8)
    return novos, trocados
