import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from filipe_lib import *
m = json.load(open(os.path.join(TMP, "medidas_parcial.json")))
print("celula", m["celula"])
for k, v in m["cabeca"].items(): print(k, {a: b for a, b in v.items() if a in ("variacao_largura_pct","variacao_largura_vs_mediana_pct","desloc_lateral_vizinhos_max","balanco_vertical_texels","largura_max_linha")})
for k, v in m["pes"].items():
    print(k, v["avanco_esperado_por_quadro_texels"])
    for p in v["pares"]: print("  ", p["par"], "depois", p["depois"], "antes", p["antes"], "medido", p["medido"])
print(json.dumps(m["cabelo"], indent=0)[:1800])
print(m["paleta"]["cores_na_paleta"], m["paleta"]["cores_usadas"], m["contorno"])
print(m["parado"])
