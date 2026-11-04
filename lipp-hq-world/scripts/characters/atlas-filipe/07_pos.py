"""Etapa 3: retoques (roupa neutra, cabelo, contorno, suavizacao temporal), paleta unica, celulas e medidas."""
import sys, os, pickle, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from filipe_lib import *
from walk_geom import C0, R0, CANVAS_H, CANVAS_W, TE, T, PASSO_GUIA
from imgops import rotular, dilatar
import pos

MARGEM = 4
K_PALETA = 56
ANIMS = [("walk-front", "front", 12), ("walk-back", "back", 12), ("idle-front", "front", 8), ("idle-back", "back", 8)]

W = pickle.load(open(os.path.join(TMP, "walk_cru.pkl"), "rb"))
I = pickle.load(open(os.path.join(TMP, "idle_cru.pkl"), "rb"))
itens = {}
for nome, d, n in ANIMS:
    fonte = W[d]["frames"] if nome.startswith("walk") else I[d]["frames"]
    itens[nome] = [dict(rgb=f["rgb"].copy(), alfa=f["alfa"].copy(), d=d, i=k) for k, f in enumerate(fonte)]
med = {}


def centro_cabeca(alfa, ht):
    cs, ws = [], []
    for r in range(ht + 5, ht + 19):
        xs = np.flatnonzero(alfa[r])
        if len(xs):
            cs.append((xs.min() + xs.max() + 1) / 2.0); ws.append(xs.max() - xs.min() + 1)
    return float(np.mean(cs)), float(np.mean(ws))


# 1) classes (sobre as cores originais amostradas)
for nome, d, n in ANIMS:
    for it in itens[nome]:
        it["cl"] = pos.classes(it["rgb"], it["alfa"], d)
        it["raw_lum"] = it["cl"]["L"].copy()

# 2) cabelo: tom de costas -> frente
def cabelo_stats(lista):
    cores = np.concatenate([it["rgb"][pos.pixels_cabelo(it["rgb"], it["alfa"], it["cl"], pos.LINHAS_CABELO)] for it in lista])
    return cores

frente = itens["walk-front"] + itens["idle-front"]
costas = itens["walk-back"] + itens["idle-back"]
ref = cabelo_stats(frente)
ant = cabelo_stats(costas)

def resumo(c):
    L = pos.lum(c)
    return dict(n=int(len(c)), media_rgb=[round(float(v), 1) for v in c.mean(axis=0)],
                r_sobre_g=round(float(c[:, 0].mean() / c[:, 1].mean()), 3),
                r_menos_b=round(float((c[:, 0] - c[:, 2]).mean()), 1),
                lum_p10_p50_p90=[round(float(v), 1) for v in np.percentile(L, [10, 50, 90])],
                saturacao_media=round(float(((c.max(axis=1) - c.min(axis=1)) / np.maximum(c.max(axis=1), 1)).mean()), 3))
def hist_l(c, bins=8):
    h, _ = np.histogram(pos.lum(c), bins=bins, range=(40, 200))
    return [round(float(v), 3) for v in h / h.sum()]

med["cabelo"] = dict(frente=resumo(ref), costas_antes=resumo(ant), hist_lum_frente=hist_l(ref), hist_lum_costas_antes=hist_l(ant))
for it in costas:
    m_apl = pos.pixels_cabelo(it["rgb"], it["alfa"], it["cl"], pos.LINHAS_CABELO_APLICA)
    pos.casar_cabelo(it["rgb"], m_apl, ref, ant)
dep = cabelo_stats(costas)
med["cabelo"]["costas_depois"] = resumo(dep)
med["cabelo"]["hist_lum_costas_depois"] = hist_l(dep)

# 3) roupa neutra: tres tons frios (guarda o estado "antes da suavizacao")
for nome, d, n in ANIMS:
    for it in itens[nome]:
        it["idx"] = pos.tons_roupa(it["rgb"], it["cl"])
        ht = it["cl"]["ht"]
        it["cx_cab"], it["w_cab_bruto"] = centro_cabeca(it["alfa"], ht)

# 4) suavizacao temporal da roupa nas caminhadas (so o tronco; membros ficam como estao)
def caixa_tronco(it):
    m = np.zeros(it["alfa"].shape, bool)
    ht = it["cl"]["ht"]; cx = int(round(it["cx_cab"]))
    m[ht + 38: ht + 98, cx - 24: cx + 25] = True
    return m & it["alfa"]

def patch(it, tipo):
    ht = it["cl"]["ht"]; cx = int(round(it["cx_cab"]))
    sl = (slice(ht + 38, ht + 98), slice(cx - 24, cx + 25))
    if tipo == "tom":
        t = it["idx"][sl].copy(); t[t < 0] = 3; return t.astype(float), it["alfa"][sl]
    if tipo == "bruta":
        return it["raw_lum"][sl], it["alfa"][sl]
    return it["rgb"][sl].mean(axis=2), it["alfa"][sl]   # luminancia por canal medio, simples

def diff_vizinhos(lista, tipo, alinhado):
    r = []
    n = len(lista)
    for i in range(n):
        a, ma = patch(lista[i], tipo); b, mb = patch(lista[(i + 1) % n], tipo)
        best = None
        for dy in ((-2, -1, 0, 1, 2) if alinhado else (0,)):
            for dx in ((-2, -1, 0, 1, 2) if alinhado else (0,)):
                bb = np.roll(np.roll(b, dy, 0), dx, 1); mm = ma & np.roll(np.roll(mb, dy, 0), dx, 1)
                if mm.sum() < 200:
                    continue
                v = float(np.abs(a - bb)[mm].mean())
                best = v if best is None or v < best else best
        r.append(best)
    return r

med["tronco"] = {}
for nome in ("walk-front", "walk-back"):
    lista = itens[nome]
    # antes de tudo: luminancia bruta da pintura reamostrada
    for it in lista:
        it["rgb_tons"] = it["rgb"].copy()
    brutos = []
    for it in lista:
        it["rgb"], it["_tmp"] = it["rgb"], None
    bruta = diff_vizinhos(lista, "bruta", False), diff_vizinhos(lista, "bruta", True)
    antes_t = diff_vizinhos(lista, "lum", False), diff_vizinhos(lista, "lum", True)
    antes_k = diff_vizinhos(lista, "tom", False), diff_vizinhos(lista, "tom", True)
    novos, trocados = pos.suavizar_roupa([it["idx"] for it in lista], [caixa_tronco(it) for it in lista])
    for it, ni in zip(lista, novos):
        m = (ni >= 0)
        it["idx"] = ni
        it["rgb"][m] = pos.TONS[ni[m]]
    dep_t = diff_vizinhos(lista, "lum", False), diff_vizinhos(lista, "lum", True)
    dep_k = diff_vizinhos(lista, "tom", False), diff_vizinhos(lista, "tom", True)
    med["tronco"][nome] = dict(
        lum_bruta_pintura=dict(sem_alinhar=round(float(np.mean(bruta[0])), 3), alinhado=round(float(np.mean(bruta[1])), 3)),
        lum_sem_alinhar=dict(antes=round(float(np.mean(antes_t[0])), 3), depois=round(float(np.mean(dep_t[0])), 3)),
        lum_alinhado=dict(antes=round(float(np.mean(antes_t[1])), 3), depois=round(float(np.mean(dep_t[1])), 3)),
        tom_sem_alinhar=dict(antes=round(float(np.mean(antes_k[0])), 3), depois=round(float(np.mean(dep_k[0])), 3)),
        tom_alinhado=dict(antes=round(float(np.mean(antes_k[1])), 3), depois=round(float(np.mean(dep_k[1])), 3)),
        texels_trocados_por_quadro=trocados,
        por_par_lum_alinhado=dict(antes=[round(v, 2) for v in antes_t[1]], depois=[round(v, 2) for v in dep_t[1]]))
    print(nome, "tronco:", json.dumps({k: v for k, v in med["tronco"][nome].items() if k != "por_par_lum_alinhado"}))

# 5) contorno seletivo (depois dos tons, para a borda nao ser sobrescrita)
n_marrom = n_grafite = 0
for nome, d, n in ANIMS:
    for it in itens[nome]:
        _, mr, gr = pos.contorno(it["rgb"], it["alfa"], it["cl"])
        it["contorno_marrom"], it["contorno_grafite"] = mr, gr
        n_marrom += int(mr.sum()); n_grafite += int(gr.sum())
med["contorno"] = dict(texels_marrom=n_marrom, texels_grafite=n_grafite)

# 6) paleta unica: cores fixas + k-means nas demais
fixas = np.concatenate([pos.TONS, pos.CONTORNO_PELE[None], pos.CONTORNO_ROUPA[None]]).astype(np.float32)
todos = [it for nome, _, _ in ANIMS for it in itens[nome]]
fix_mask = lambda it: (it["idx"] >= 0) | it["contorno_marrom"] | it["contorno_grafite"]
livres = np.concatenate([it["rgb"][it["alfa"] & ~fix_mask(it)] for it in todos]).astype(np.float32)
u, cnt = np.unique(np.round(livres).astype(np.int16), axis=0, return_counts=True)
u = u.astype(np.float32)
k = K_PALETA - len(fixas)
rng = np.random.default_rng(11)
# k-means++ ponderado pela contagem e por distancia (cores raras como olho e cadarco ganham centro)
cent = [u[np.argmax(cnt)]]
d2 = ((u - cent[0]) ** 2).sum(axis=1)
for _ in range(k - 1):
    p = d2 * np.sqrt(cnt)
    cent.append(u[rng.choice(len(u), p=p / p.sum())])
    d2 = np.minimum(d2, ((u - cent[-1]) ** 2).sum(axis=1))
cent = np.array(cent, np.float32)
for _ in range(40):
    lab = np.argmin(((u[:, None] - cent[None]) ** 2).sum(axis=2), axis=1)
    for j in range(k):
        s = lab == j
        if s.any():
            cent[j] = (u[s] * cnt[s, None]).sum(axis=0) / cnt[s].sum()
cent = np.round(cent)
paleta = np.concatenate([fixas, cent]).astype(np.uint8)
print("paleta:", len(paleta), "cores")
for it in todos:
    m = it["alfa"] & ~fix_mask(it)
    px = it["rgb"][m]
    it["rgb"][m] = cent[np.argmin(((px[:, None] - cent[None]) ** 2).sum(axis=2), axis=1)]
    it["rgb"] = np.round(it["rgb"]).astype(np.uint8)
    it["rgb"][~it["alfa"]] = 0
used = np.unique(np.concatenate([it["rgb"][it["alfa"]] for it in todos]), axis=0)
med["paleta"] = dict(cores_na_paleta=int(len(paleta)), cores_usadas=int(len(used)), hex=["#%02X%02X%02X" % tuple(c) for c in paleta])

# 7) celula comum: mesma ancora (coluna C0, linha R0) em todos os quadros
y0 = min(int(np.flatnonzero(it["alfa"].any(axis=1)).min()) for it in todos) - MARGEM
y1 = max(int(np.flatnonzero(it["alfa"].any(axis=1)).max()) + 1 for it in todos) + MARGEM
ext = max(max(C0 - int(np.flatnonzero(it["alfa"].any(axis=0)).min()), int(np.flatnonzero(it["alfa"].any(axis=0)).max()) - C0) for it in todos) + MARGEM
largura = 2 * ext + 1
alt = y1 - y0
x0 = C0 - ext
print("celula", largura, "x", alt, "ancora col", ext, "linha do chao", R0 - y0)
for it in todos:
    it["rgb"] = it["rgb"][y0:y1, x0:x0 + largura]
    it["alfa"] = it["alfa"][y0:y1, x0:x0 + largura]
    it["idx"] = it["idx"][y0:y1, x0:x0 + largura]
    it["cl"]["ht"] -= y0; it["cl"]["hb"] -= y0
    it["cx_cab"] -= x0
sola_linha = R0 - y0
ancora_col = ext
altura_idle = max(pos.altura(it["alfa"])[1] - pos.altura(it["alfa"])[0] for n_ in ("idle-front", "idle-back") for it in itens[n_])
altura_walk = max(pos.altura(it["alfa"])[1] - pos.altura(it["alfa"])[0] for n_ in ("walk-front", "walk-back") for it in itens[n_])
med["celula"] = dict(largura=largura, altura=alt, ancora_coluna=ancora_col, sola_linha=sola_linha, margem=MARGEM,
                     linhas_visiveis_parado=altura_idle, linhas_visiveis_caminhada_max=altura_walk,
                     linhas_visiveis_por_anim={n_: [pos.altura(it["alfa"])[1] - pos.altura(it["alfa"])[0] for it in itens[n_]] for n_, _, _ in ANIMS})

# 8) medidas de cabeca, pes e parado
def banda_cabeca(it):
    ht = it["cl"]["ht"]
    ws, cs = [], []
    for r in range(ht + 5, ht + 19):
        xs = np.flatnonzero(it["alfa"][r])
        ws.append(xs.max() - xs.min() + 1); cs.append((xs.max() + xs.min() + 1) / 2.0)
    return float(np.mean(ws)), float(np.mean(cs)), ht
med["cabeca"] = {}
for nome, d, n in ANIMS:
    L = [banda_cabeca(it) for it in itens[nome]]
    ws = np.array([a for a, _, _ in L]); cs = np.array([b for _, b, _ in L]); hts = np.array([c for _, _, c in L])
    desl = np.abs(np.diff(np.concatenate([cs, cs[:1]])))
    # largura maxima (linha mais larga) em inteiros de texel, para mostrar o efeito da grade
    wmax = [int(max(np.flatnonzero(it["alfa"][r]).max() - np.flatnonzero(it["alfa"][r]).min() + 1 for r in range(it["cl"]["ht"] + 5, it["cl"]["ht"] + 19))) for it in itens[nome]]
    med["cabeca"][nome] = dict(largura_media_banda=[round(float(x), 2) for x in ws],
                               variacao_largura_pct=round(float((ws.max() - ws.min()) / ws.mean() * 100), 2),
                               variacao_largura_vs_mediana_pct=round(float(np.abs(ws - np.median(ws)).max() / np.median(ws) * 100), 2),
                               largura_max_linha=wmax,
                               centro_x=[round(float(x), 2) for x in cs],
                               desloc_lateral_vizinhos_max=round(float(desl.max()), 2),
                               desloc_lateral_vizinhos=[round(float(x), 2) for x in desl],
                               topo_linha=[int(x) for x in hts],
                               balanco_vertical_texels=int(hts.max() - hts.min()))

def landmark_pe(it, rank):
    alfa, rgb = it["alfa"], it["rgb"]
    ht, hb = pos.altura(alfa)
    r_, g_, b_ = [rgb[..., q].astype(int) for q in range(3)]
    cr = alfa & (r_ > 205) & (g_ > 180) & (b_ > 125) & (b_ < 215) & (r_ - b_ < 110)
    cr[: ht + int(0.7 * (hb - ht))] = False
    lab, n = rotular(dilatar(cr, 2))
    cl = []
    for kk in range(1, n + 1):
        mk = cr & (lab == kk)
        if mk.sum() >= 8:
            ys, xs = np.nonzero(mk); cl.append((xs.mean() + 0.5, ys, xs))
    cl.sort(key=lambda c: c[0])
    if len(cl) < 2:
        ys, xs = np.nonzero(cr)
        c1, c2 = np.percentile(xs, 25), np.percentile(xs, 75)
        for _ in range(20):
            a = np.abs(xs - c1) < np.abs(xs - c2); c1, c2 = xs[a].mean(), xs[~a].mean()
        cl = [(xs[s].mean() + 0.5, ys[s], xs[s]) for s in (a, ~a)]
        cl.sort(key=lambda c: c[0])
    cx, ys, xs = cl[rank]
    col = alfa[:, max(xs.min() - 1, 0): xs.max() + 2]
    linhas = np.flatnonzero(col.any(axis=1))
    baixo = linhas[linhas <= ys.max() + 4].max() + 1
    return float(cx), float(baixo)

med["pes"] = {}
for nome, d in (("walk-front", "front"), ("walk-back", "back")):
    info = W[d]["info"]
    sx, sy = PASSO_GUIA[d]
    esp = (-TE * sx, -TE * sy)
    marcas = []
    for it, inf in zip(itens[nome], info):
        rank = 0 if inf["g_pe"][0] < inf["g_pe_outro"][0] else 1
        marcas.append(landmark_pe(it, rank))
    # "antes": quadros so alinhados pela cabeca (rigido, escala por cabeca), cabeca no balanco do guia
    antes = [(inf["u_cab"] + inf["s"] * (inf["pe"]["cx"] - inf["CX"]), inf["v_cab_guia"] + inf["s"] * (inf["pe"]["baixo"] - inf["top"])) for inf in info]
    apoio = [inf["apoio"] for inf in info]
    pares = []
    for i in range(12):
        j = (i + 1) % 12
        if apoio[i] != apoio[j]:
            continue
        dm = (marcas[j][0] - marcas[i][0] - esp[0], marcas[j][1] - marcas[i][1] - esp[1])
        da = (antes[j][0] - antes[i][0] - esp[0], antes[j][1] - antes[i][1] - esp[1])
        pares.append(dict(par=f"{i:02d}->{j:02d}", depois=[round(dm[0], 2), round(dm[1], 2)], antes=[round(da[0], 2), round(da[1], 2)],
                          medido=[round(marcas[j][0] - marcas[i][0], 2), round(marcas[j][1] - marcas[i][1], 2)]))
    mod = lambda k_: [float(np.hypot(*p[k_])) for p in pares]
    med["pes"][nome] = dict(avanco_esperado_por_quadro_texels=[round(esp[0], 3), round(esp[1], 3)], pares=pares,
                            deslize_depois_medio=round(float(np.mean(mod("depois"))), 2), deslize_depois_max=round(float(np.max(mod("depois"))), 2),
                            deslize_antes_medio=round(float(np.mean(mod("antes"))), 2), deslize_antes_max=round(float(np.max(mod("antes"))), 2),
                            marcas=[[round(a, 2), round(b, 2)] for a, b in marcas])
    print(nome, "deslize medio/max depois", med["pes"][nome]["deslize_depois_medio"], med["pes"][nome]["deslize_depois_max"],
          "antes", med["pes"][nome]["deslize_antes_medio"], med["pes"][nome]["deslize_antes_max"])

# parado: pes parados, loop perfeito
med["parado"] = {}
for nome in ("idle-front", "idle-back"):
    L = itens[nome]
    corte = int(L[0]["cl"]["ht"] + 0.72 * (L[0]["cl"]["hb"] - L[0]["cl"]["ht"]))
    pes_iguais = all(np.array_equal(L[0]["rgb"][corte:], q["rgb"][corte:]) and np.array_equal(L[0]["alfa"][corte:], q["alfa"][corte:]) for q in L)
    dif = [int((L[k]["alfa"] != L[(k + 1) % 8]["alfa"]).sum() + (L[k]["rgb"] != L[(k + 1) % 8]["rgb"]).any(axis=2).sum()) for k in range(8)]
    topos = [pos.altura(q["alfa"])[0] for q in L]
    med["parado"][nome] = dict(pes_identicos_abaixo_da_linha=corte, pes_identicos=bool(pes_iguais), texels_diferentes_entre_vizinhos=dif,
                               topo_da_cabeca_por_quadro=topos)
    print(nome, "pes identicos:", pes_iguais, "topos", topos)

with open(os.path.join(TMP, "final.pkl"), "wb") as f:
    pickle.dump(dict(itens={n_: [dict(rgb=it["rgb"], alfa=it["alfa"], idx=it["idx"], ht=it["cl"]["ht"]) for it in itens[n_]] for n_, _, _ in ANIMS},
                     paleta=paleta, med=med, anims=ANIMS), f)
with open(os.path.join(TMP, "medidas_parcial.json"), "w", encoding="utf-8") as f:
    json.dump(med, f, indent=1, ensure_ascii=False)
print("OK")
