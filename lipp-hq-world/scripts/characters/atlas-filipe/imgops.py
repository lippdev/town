"""Operações de imagem só com numpy (o Python do Blender não traz scipy nem cv2)."""
import numpy as np


def rotular(mask):
    """Componentes conexos (8-vizinhança). Devolve (rótulos int32, quantidade). União-busca sobre corridas por linha."""
    h, w = mask.shape
    runs = []  # (linha, x0, x1)
    idx_linha = []
    for y in range(h):
        row = mask[y]
        if not row.any():
            idx_linha.append((len(runs), len(runs)))
            continue
        d = np.diff(np.concatenate([[0], row.view(np.int8), [0]]))
        ini = np.flatnonzero(d == 1)
        fim = np.flatnonzero(d == -1)
        a = len(runs)
        for s, e in zip(ini, fim):
            runs.append((y, int(s), int(e)))
        idx_linha.append((a, len(runs)))
    pai = list(range(len(runs)))

    def achar(i):
        while pai[i] != i:
            pai[i] = pai[pai[i]]
            i = pai[i]
        return i

    for y in range(1, h):
        a0, a1 = idx_linha[y - 1]
        b0, b1 = idx_linha[y]
        i = a0
        for j in range(b0, b1):
            _, s, e = runs[j]
            while i < a1 and runs[i][2] < s:  # corrida acima termina antes (8-viz: toca em e==s via diagonal)
                i += 1
            k = i
            while k < a1 and runs[k][1] <= e:
                pai[achar(k)] = achar(j)
                k += 1
    raiz = {}
    out = np.zeros((h, w), np.int32)
    for n, (y, s, e) in enumerate(runs):
        r = achar(n)
        if r not in raiz:
            raiz[r] = len(raiz) + 1
        out[y, s:e] = raiz[r]
    return out, len(raiz)


def manter_grandes(mask, minimo):
    lab, n = rotular(mask)
    if n == 0:
        return mask.copy()
    cont = np.bincount(lab.ravel(), minlength=n + 1)
    ok = cont >= minimo
    ok[0] = False
    return ok[lab]


def dilatar(mask, r):
    out = mask.copy()
    h, w = mask.shape
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dy * dy + dx * dx > r * r + r:
                continue
            ys = slice(max(dy, 0), h + min(dy, 0))
            yd = slice(max(-dy, 0), h + min(-dy, 0))
            xs = slice(max(dx, 0), w + min(dx, 0))
            xd = slice(max(-dx, 0), w + min(-dx, 0))
            out[ys, xs] |= mask[yd, xd]
    return out


def erodir(mask, r):
    return ~dilatar(~mask, r)
