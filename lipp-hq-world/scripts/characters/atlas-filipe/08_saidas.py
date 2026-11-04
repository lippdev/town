"""Etapa 4: grava o atlas, o JSON, a folha numerada, a tira dos pes e a pagina de previa."""
import sys, os, pickle, json, base64
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from filipe_lib import *
from walk_geom import TE, PASSO_GUIA

F = pickle.load(open(os.path.join(TMP, "final.pkl"), "rb"))
itens, paleta, med, ANIMS = F["itens"], F["paleta"], F["med"], F["anims"]
CEL = med["celula"]
CW, CH = CEL["largura"], CEL["altura"]
SOLE = CEL["sola_linha"]
FLOOR = np.array([0xC9, 0xA3, 0x6F], np.uint8)
COLS = 12

# ---------- atlas ----------
atlas = np.zeros((len(ANIMS) * CH, COLS * CW, 4), np.uint8)
for row, (nome, d, n) in enumerate(ANIMS):
    for k, it in enumerate(itens[nome]):
        y, x = row * CH, k * CW
        atlas[y:y + CH, x:x + CW, :3] = it["rgb"]
        atlas[y:y + CH, x:x + CW, 3] = np.where(it["alfa"], 255, 0)
gravar_png(os.path.join(ATLAS, "walk.png"), atlas)
usadas = np.unique(atlas[atlas[..., 3] > 0][:, :3], axis=0)
print("atlas", atlas.shape, "cores usadas", len(usadas))
med["atlas"] = dict(largura=int(atlas.shape[1]), altura=int(atlas.shape[0]), cores_unicas=int(len(usadas)),
                    alfa_binario=bool(set(np.unique(atlas[..., 3]).tolist()) <= {0, 255}))

visivel = CEL["linhas_visiveis_parado"]
walk_json = {
    "image": "walk.png",
    "cell": {"width": CW, "height": CH},
    "soleRow": SOLE,
    "visibleRows": visivel,
    "animations": {
        "walk-front": {"row": 0, "frames": 12, "stepMeters": 0.1133},
        "walk-back": {"row": 1, "frames": 12, "stepMeters": 0.1133},
        "idle-front": {"row": 2, "frames": 8, "fps": 5},
        "idle-back": {"row": 3, "frames": 8, "fps": 5},
    },
}
with open(os.path.join(ATLAS, "walk.json"), "w", encoding="utf-8") as f:
    json.dump(walk_json, f, indent=2)

# ---------- fonte 3x5 para numerar ----------
GL = {"0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
      "5": "111100111001111", "6": "111100111101111", "7": "111001001001001", "8": "111101111101111", "9": "111101111001111",
      "W": "101101111111101", "F": "111100110100100", "B": "110101110101110", "I": "111010010010111", " ": "000000000000000",
      "-": "000000111000000", "x": "000101010101000", ">": "100010001010100"}


def texto(img, s, x, y, esc, cor=(255, 255, 255), sombra=(0, 0, 0)):
    for k, ch in enumerate(s):
        g = np.array([int(c) for c in GL[ch]]).reshape(5, 3)
        for cor_, off in ((sombra, 1), (cor, 0)):
            for yy in range(5):
                for xx in range(3):
                    if g[yy, xx]:
                        X, Y = x + (k * 4 + xx) * esc + off, y + yy * esc + off
                        img[Y:Y + esc, X:X + esc] = cor_


def tile_rgb(it, fundo=FLOOR):
    t = np.zeros((CH, CW, 3), np.uint8) + fundo
    t[it["alfa"]] = it["rgb"][it["alfa"]]
    return t


# ---------- folha 2x numerada ----------
ESC = 2
linhas = []
for row, (nome, d, n) in enumerate(ANIMS):
    tiles = []
    for k in range(COLS):
        if k < n:
            t = tile_rgb(itens[nome][k])
            t = np.repeat(np.repeat(t, ESC, 0), ESC, 1)
            t[(SOLE) * ESC, :] = (t[(SOLE) * ESC, :] * 0.6 + np.array([200, 40, 40]) * 0.4).astype(np.uint8)   # linha do chao (raiz)
            t[:, (CW // 2) * ESC: (CW // 2) * ESC + ESC] = (t[:, (CW // 2) * ESC: (CW // 2) * ESC + ESC] * 0.7 + np.array([40, 40, 200]) * 0.3).astype(np.uint8)  # coluna da ancora
            tag = {"walk-front": "WF", "walk-back": "WB", "idle-front": "IF", "idle-back": "IB"}[nome]
            texto(t, f"{tag}{k:02d}", 3, 3, 3)
        else:
            t = np.zeros((CH * ESC, CW * ESC, 3), np.uint8) + np.array([60, 60, 66], np.uint8)
        t[:, -1] = (30, 30, 30); t[-1, :] = (30, 30, 30)
        tiles.append(t)
    linhas.append(np.concatenate(tiles, axis=1))
folha = np.concatenate(linhas, axis=0)
gravar_png(os.path.join(ATLAS, "folha.png"), np.concatenate([folha, np.full(folha.shape[:2] + (1,), 255, np.uint8)], axis=2))
print("folha", folha.shape)

# ---------- tira dos pes ----------
C_X0, C_X1 = 6, 122
R_0, R_1 = SOLE - 30, min(SOLE + 34, CH)
PAD_X, PAD_Y = 60, 30
ES = 2


def cruz(img, cx, cy, cor, r=5):
    X, Y = int(round(cx * ES)), int(round(cy * ES))
    for d in range(-r, r + 1):
        for (yy, xx) in ((Y, X + d), (Y + d, X)):
            if 0 <= yy < img.shape[0] and 0 <= xx < img.shape[1]:
                img[yy, xx] = cor


rows_img = []
for nome, d in (("walk-front", "front"), ("walk-back", "back")):
    L = itens[nome]
    marcas = med["pes"][nome]["marcas"]
    sx, sy = PASSO_GUIA[d]
    passo = (-TE * sx * -1, -TE * sy * -1)     # a raiz anda (+) por quadro na tela
    apoio = F["med"]["pes"][nome].get("apoio")
    info = pickle.load(open(os.path.join(TMP, "walk_cru.pkl"), "rb"))[d]["info"]
    apoio = [q["apoio"] for q in info]
    comeco = [i for i in range(12) if apoio[i] != apoio[i - 1]]
    W_TILE = (C_X1 - C_X0 + PAD_X) * ES
    H_TILE = (R_1 - R_0 + 2 * PAD_Y) * ES
    # A: quadros lado a lado (6 por linha)
    for ini in (0, 6):
        tiles = []
        for k in range(ini, ini + 6):
            t = tile_rgb(L[k])[R_0:R_1, C_X0:C_X1]
            t = np.repeat(np.repeat(t, ES, 0), ES, 1)
            canvas = np.zeros((H_TILE, W_TILE, 3), np.uint8) + np.array([40, 40, 44], np.uint8)
            canvas[PAD_Y * ES: PAD_Y * ES + t.shape[0], : t.shape[1]] = t
            cx, cy = marcas[k][0] - C_X0, marcas[k][1] - R_0 + PAD_Y
            cruz(canvas, cx, cy, (0, 255, 0))
            texto(canvas, f"{d[0].upper()}{k:02d}", 3, 3, 3)
            tiles.append(canvas)
        rows_img.append(np.concatenate(tiles, axis=1))
    # B: travado no chao, uma linha por pisada (o jogo move a raiz +passo por quadro; o pe de apoio deve ficar parado)
    for c0 in comeco:
        tiles = []
        ref = marcas[c0]
        for k in range(6):
            i = (c0 + k) % 12
            t = tile_rgb(L[i])[R_0:R_1, C_X0:C_X1]
            t = np.repeat(np.repeat(t, ES, 0), ES, 1)
            dx, dy = int(round(k * passo[0])), int(round(k * passo[1]))
            canvas = np.zeros((H_TILE, W_TILE, 3), np.uint8) + np.array([40, 40, 44], np.uint8)
            oy, ox = PAD_Y * ES + dy * ES, dx * ES
            y0_, x0_ = max(oy, 0), max(ox, 0)
            cut_y, cut_x = y0_ - oy, x0_ - ox
            hh = min(t.shape[0] - cut_y, H_TILE - y0_); ww = min(t.shape[1] - cut_x, W_TILE - x0_)
            canvas[y0_:y0_ + hh, x0_:x0_ + ww] = t[cut_y:cut_y + hh, cut_x:cut_x + ww]
            cruz(canvas, ref[0] - C_X0, ref[1] - R_0 + PAD_Y, (255, 60, 60), 9)       # onde o pe estava no 1o quadro da pisada
            cruz(canvas, marcas[i][0] - C_X0 + dx, marcas[i][1] - R_0 + PAD_Y + dy, (0, 255, 0))  # onde esta agora
            texto(canvas, f"{d[0].upper()}{i:02d}", 3, 3, 3)
            tiles.append(canvas)
        rows_img.append(np.concatenate(tiles, axis=1))
tira = np.concatenate(rows_img, axis=0)
gravar_png(os.path.join(ATLAS, "tira-pes.png"), np.concatenate([tira, np.full(tira.shape[:2] + (1,), 255, np.uint8)], axis=2))
print("tira", tira.shape)

# ---------- previa offline ----------
b64 = base64.b64encode(open(os.path.join(ATLAS, "walk.png"), "rb").read()).decode()
html = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "preview_template.html"), encoding="utf-8").read()
html = html.replace("__ATLAS_B64__", b64).replace("__CONFIG__", json.dumps(walk_json)).replace(
    "__STEP__", json.dumps({"front": [TE * 42.59, TE * 21.3], "back": [TE * 42.59, -TE * 21.3]}))
with open(os.path.join(ATLAS, "preview.html"), "w", encoding="utf-8") as f:
    f.write(html)
print("preview.html", len(html) // 1024, "KB")

med["walk_json"] = walk_json
with open(os.path.join(ATLAS, "medidas.json"), "w", encoding="utf-8") as f:
    json.dump(med, f, indent=1, ensure_ascii=False)
