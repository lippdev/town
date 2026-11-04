"""Marcos medidos nas pinturas e nos guias: cabeça, pé de apoio, quadril."""
import numpy as np
from filipe_lib import ESCALA_GUIA, chave_magenta

# cores do guia (mapa de partes)
G_VERMELHO = [(142, 35, 35), (255, 138, 128), (92, 10, 10), (255, 208, 204)]
G_AZUL = [(130, 177, 255), (6, 31, 74), (201, 222, 255)]
G_CABECA = [(122, 69, 36), (242, 179, 140), (217, 142, 100), (192, 86, 42)]


def cor_em(rgb, lista):
    m = np.zeros(rgb.shape[:2], bool)
    for c in lista:
        m |= (rgb == np.array(c, np.uint8)).all(axis=2)
    return m


def limpar(mask, minimo=40):
    """Remove componentes minúsculos (poeira de borda) via rotulagem simples por linhas."""
    import scipy_free_label as L
    return L.manter_grandes(mask, minimo)


def pes_guia(g, sola_apoio_ref):
    """Para um guia: máscara dos dois tênis; devolve (qual_apoio, dict por pé)."""
    out = {}
    for nome, lista in (("vermelho", G_VERMELHO), ("azul", G_AZUL)):
        m = cor_em(g, lista)
        ys, xs = np.nonzero(m)
        out[nome] = dict(mask=m, baixo=ys.max(), cx=xs.mean(), cy=ys.mean(), xmin=xs.min(), xmax=xs.max())
    apoio = min(out, key=lambda k: abs(out[k]["baixo"] - sola_apoio_ref))
    return apoio, out


def caixa_cabeca(mask, topo, k0=30, k1=120):
    """Largura média e centro médio da faixa de cabelo/testa (linhas topo+k0 .. topo+k1)."""
    ws, cs = [], []
    for r in range(topo + k0, topo + k1):
        xs = np.flatnonzero(mask[r])
        if len(xs) == 0:
            continue
        ws.append(xs.max() - xs.min() + 1)
        cs.append((xs.max() + xs.min()) / 2.0)
    return float(np.mean(ws)), float(np.mean(cs))
