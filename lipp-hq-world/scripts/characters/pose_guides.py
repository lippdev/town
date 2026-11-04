"""Guias de pose (manequim) para o Filipe do Lipp HQ World.

Uso (Blender 5.x, sem interface):

    blender --background --factory-startup --python pose_guides.py -- --out <pasta>

Gera, para walk (12 quadros) e idle (8 quadros), nas direcoes front e back:
  <pasta>/<anim>-<dir>-NN.png   768x1152, fundo #FF00FF, sem antialias, cor chapada
  <pasta>/folha-<anim>-<dir>.png
  <pasta>/metadados.json
  <pasta>/_revisao/*            tiras maiores para conferencia humana

Convencoes
  * Corpo em coordenadas locais: x = frente, y = esquerda, z = cima. A origem e o ponto do
    chao sob o quadril (ancora). O personagem anda no lugar; quem o desloca e o jogo.
  * Camera ortografica, elevacao 30 graus, azimute 45 graus (diorama isometrico).
      front: o personagem olha para +Y do mundo -> anda para o canto inferior direito.
      back : o personagem olha para -X do mundo -> anda para o canto superior direito.
  * Lado direito do corpo = tons de vermelho; lado esquerdo = tons de azul.
  * Marcha: parametrizada pela fase phi = k/12. O pe de apoio fica fixo no mundo
    (ponto de contato do calcanhar / sola / ponta nao desliza); o quadril avanca a
    V_WALK m/s, logo o comprimento do ciclo e L = V_WALK * T.
"""
import bpy
import math
import sys
import os
import json
import zlib
import struct
import numpy as np
from mathutils import Vector, Matrix

# --------------------------------------------------------------------------- args
_argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def _arg(name, default=None):
    if name in _argv:
        i = _argv.index(name)
        return _argv[i + 1] if i + 1 < len(_argv) and not _argv[i + 1].startswith('--') else True
    return default


OUT_DIR = os.path.abspath(_arg('--out', os.path.dirname(os.path.abspath(__file__))))
DEV = bool(_arg('--dev', False))          # so alguns quadros, para iterar rapido
SELFTEST = bool(_arg('--selftest', False))

# --------------------------------------------------------------------------- constantes
W, H = 768, 1152
BG_HEX = '#FF00FF'
ELEV_DEG, AZ_DEG = 30.0, 45.0
V_WALK = 1.2                      # m/s
STRIDE = 1.36                     # m, um ciclo = dois passos de 0,68 m (adulto relaxado a 1,2 m/s)
CYCLE_S = STRIDE / V_WALK         # duracao do ciclo
N_WALK, N_IDLE = 12, 8
ANCHOR_ROW = 1030                 # linha da imagem onde fica o chao sob o quadril
FIG_FRAC = 0.80                   # fracao da altura da imagem ocupada pelo personagem

# dimensoes do corpo (m) -- figura de ~1,80 m e ~7 cabecas
THIGH, SHIN, ANKLE_H = 0.43, 0.40, 0.085
HIP_HALF, FOOT_HALF = 0.105, 0.09
UPPER_ARM, FOREARM = 0.30, 0.25
SHOULDER_HALF = 0.285
HEEL = (-0.07, -ANKLE_H)          # pontos de contato do tenis no referencial do tornozelo (x, z)
TOE = (0.20, -ANKLE_H)

PAL = {
    'skin': '#F2B38C', 'nose': '#C0562A', 'ear': '#D98E64', 'hair': '#7A4524',
    'hoodie': '#9E9E9E', 'hem': '#6A6A6A', 'pocketH': '#7C7C7C', 'cord': '#F4F4F4',
    'cowl': '#C4C4C4', 'hoodback': '#848484', 'pelvis': '#4A4A4A',
    # direito: vermelhos
    'R_upper': '#C62828', 'R_fore': '#E53935', 'R_cuff': '#7F1D1D', 'R_hand': '#FF5252',
    'R_thigh': '#B71C1C', 'R_pocket': '#6E1010', 'R_shin': '#EF5350', 'R_pcuff': '#8E2323',
    'R_shoe': '#FF8A80', 'R_sole': '#5C0A0A', 'R_toe': '#FFD0CC',
    # esquerdo: azuis
    'L_upper': '#1565C0', 'L_fore': '#1E88E5', 'L_cuff': '#0B2F66', 'L_hand': '#448AFF',
    'L_thigh': '#0D47A1', 'L_pocket': '#08285C', 'L_shin': '#42A5F5', 'L_pcuff': '#12408A',
    'L_shoe': '#82B1FF', 'L_sole': '#061F4A', 'L_toe': '#C9DEFF',
}


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def srgb_to_lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(h):
    return tuple(srgb_to_lin(c) for c in hex_rgb(h))


# --------------------------------------------------------------------------- matematica
def Rz(a): return Matrix.Rotation(a, 3, 'Z')
def Ry(a): return Matrix.Rotation(a, 3, 'Y')
def Rx(a): return Matrix.Rotation(a, 3, 'X')


def smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def lerp(a, b, t): return a + (b - a) * t


def frame_zref(z, ref):
    """Matriz 3x3 cuja coluna Z e `z` e cuja coluna X e `ref` ortogonalizado."""
    z = Vector(z).normalized()
    x = (Vector(ref) - z * Vector(ref).dot(z)).normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


def rot2(theta, v):
    """Gira (x, z) por theta (ponta do pe para cima = positivo)."""
    c, s = math.cos(theta), math.sin(theta)
    return (c * v[0] - s * v[1], s * v[0] + c * v[1])


# --------------------------------------------------------------------------- marcha
PHI_FF, PHI_HR, PHI_TO = 0.10, 0.38, 0.60     # pe plano, calcanhar sobe, tira o pe do chao
TH_HS, TH_TO = 0.30, 0.60                     # pitch (rad) no contato do calcanhar / ao empurrar
XH = -0.5 * (TOE[0] - HEEL[0])                # calcanhar do apoio no mundo (simetria do passo)
BOB = 0.042                                   # oscilacao vertical do quadril (m)
SWING_CLEAR = 0.085


def _ankle_from(pivot_x, pivot_pt, theta):
    r = rot2(theta, pivot_pt)
    return (pivot_x - r[0], -r[1])


def _swing_state(q):
    xs, zs = _ankle_from(XH + (TOE[0] - HEEL[0]), TOE, -TH_TO)
    xe, ze = _ankle_from(XH + STRIDE, HEEL, TH_HS)
    return xs, zs, xe, ze


def foot_track(phi, q):
    """Tornozelo (x mundo, z) e pitch de um pe na fase phi do seu proprio ciclo."""
    phi = phi % 1.0
    if phi < PHI_FF:
        u = phi / PHI_FF
        th = TH_HS * (1 - smooth(u))
        x, z = _ankle_from(XH, HEEL, th)
    elif phi < PHI_HR:
        th = 0.0
        x, z = _ankle_from(XH, HEEL, 0.0)
    elif phi < PHI_TO:
        u = (phi - PHI_HR) / (PHI_TO - PHI_HR)
        th = -TH_TO * u ** 1.6
        x, z = _ankle_from(XH + (TOE[0] - HEEL[0]), TOE, th)
    else:
        u = (phi - PHI_TO) / (1 - PHI_TO)
        xs, zs, xe, ze = _swing_state(q)
        g = smooth(u ** q)
        x = lerp(xs, xe, g)
        zb = lerp(zs, ze, smooth(u)) + SWING_CLEAR * math.sin(math.pi * u) ** 1.2
        th = -TH_TO + (TH_HS * 0.0 + TH_TO + 0.05) * smooth(min(1.0, u / 0.5))
        if u > 0.5:
            th = 0.05 + (TH_HS - 0.05) * smooth((u - 0.5) / 0.5)
        # folga: o ponto mais baixo do tenis nao entra no chao
        clear = 0.025 * smooth(u / 0.15) * (1 - smooth((u - 0.8) / 0.2))
        low = min(rot2(th, HEEL)[1], rot2(th, TOE)[1])
        z = max(zb, clear - low)
    return x, z, th


def pelvis_x(phi):
    return STRIDE * (phi - 0.3)


def solve_q():
    """Escolhe o expoente da curva de balanco para a passagem cair exatamente no quadro 3."""
    def gap(q):
        # pe esquerdo (balanco) vs pe direito (apoio), fase global 0.25
        xs, _, _ = foot_track(0.25 + 0.5, q)
        xs = xs - 0.5 * STRIDE                     # mundo do pe esquerdo (ver docstring)
        xr, _, _ = foot_track(0.25, q)
        return xs - xr
    lo, hi = 0.3, 1.6
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if gap(mid) > 0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


Q_SWING = solve_q()


def walk_params(k):
    phi = k / N_WALK                  # sem modulo: k = 12 tem de coincidir com k = 0 (ver check_loop)
    twopi = 2 * math.pi
    z_hi = ANKLE_H + 0.972 * (THIGH + SHIN)
    pz = z_hi - BOB * (1 - math.cos(2 * twopi * (phi - 0.32))) / 2
    py = -0.018 * math.sin(twopi * (phi + 0.02))
    feet = {}
    for side, ph, sgn in (('R', phi, -1), ('L', phi + 0.5, +1)):
        xw, z, th = foot_track(ph, Q_SWING)
        feet[side] = dict(pos=Vector((xw - pelvis_x(ph % 1.0), sgn * FOOT_HALF, z)), yaw=0.0, pitch=th)
    arm = {}
    for side, ph, sgn in (('R', phi, -1), ('L', phi + 0.5, +1)):
        a = -math.radians(24) * math.cos(twopi * (ph - 0.04))
        e = math.radians(20) + math.radians(13) * (a / math.radians(24))
        arm[side] = dict(alpha=a, beta=math.radians(7), elbow=e)
    return dict(
        P=Vector((0, py, pz)), yaw_p=math.radians(4.0) * math.cos(twopi * phi), pitch_p=0.0,
        yaw_c=-math.radians(5.5) * math.cos(twopi * phi), lean=math.radians(3.0),
        yaw_h=0.0, pitch_h=math.radians(2.0), feet=feet, arm=arm, phi=phi)


def idle_params(k, amp=1.0):
    phi = k / N_IDLE
    twopi = 2 * math.pi
    breath = math.sin(twopi * phi)
    shift = math.sin(twopi * phi + 0.9)                  # peso passa de um pe para o outro
    pz = 0.895 + amp * 0.007 * breath
    feet = {
        'R': dict(pos=Vector((0.015, -0.095, ANKLE_H)), yaw=-math.radians(8), pitch=0.0),
        'L': dict(pos=Vector((-0.015, 0.095, ANKLE_H)), yaw=math.radians(8), pitch=0.0),
    }
    # o pe aliviado levanta o calcanhar um fio (continua tocando o chao pela ponta) -> nao, so plano
    arm = {}
    for side, ph in (('R', 0.0), ('L', 0.5)):
        a = amp * math.radians(4.0) * math.sin(twopi * phi + (0.4 if side == 'R' else 0.4 + math.pi))
        arm[side] = dict(alpha=a + math.radians(2), beta=math.radians(7 + amp * 2.0 * breath),
                         elbow=math.radians(14 + amp * 3.5 * breath))
    return dict(
        P=Vector((0.0, amp * 0.022 * shift, pz)), yaw_p=amp * math.radians(2.0) * math.sin(twopi * phi + 0.4),
        pitch_p=0.0, yaw_c=-amp * math.radians(3.0) * math.sin(twopi * phi + 0.4),
        lean=math.radians(2.0) + amp * math.radians(1.8) * breath,
        yaw_h=amp * math.radians(1.5) * math.sin(twopi * phi + 1.3),
        pitch_h=math.radians(1.5) - amp * math.radians(1.5) * breath,
        feet=feet, arm=arm, phi=phi)


# --------------------------------------------------------------------------- esqueleto
BONES = ['pelvis', 'chest', 'head',
         'upperarm.R', 'forearm.R', 'hand.R', 'upperarm.L', 'forearm.L', 'hand.L',
         'thigh.R', 'shin.R', 'foot.R', 'thigh.L', 'shin.L', 'foot.L']
PARENT = {'chest': 'pelvis', 'head': 'chest',
          'upperarm.R': 'chest', 'forearm.R': 'upperarm.R', 'hand.R': 'forearm.R',
          'upperarm.L': 'chest', 'forearm.L': 'upperarm.L', 'hand.L': 'forearm.L',
          'thigh.R': 'pelvis', 'shin.R': 'thigh.R', 'foot.R': 'shin.R',
          'thigh.L': 'pelvis', 'shin.L': 'thigh.L', 'foot.L': 'shin.L'}
BONE_LEN = {'pelvis': 0.2, 'chest': 0.5, 'head': 0.2, 'upperarm': UPPER_ARM, 'forearm': FOREARM,
            'hand': 0.12, 'thigh': THIGH, 'shin': SHIN, 'foot': 0.2}


def ik2(h, a, l1, l2, pole):
    v = a - h
    d = v.length
    if d > (l1 + l2) * 0.9995:
        raise ValueError('perna esticada alem do alcance: d=%.4f max=%.4f' % (d, l1 + l2))
    u = v / d
    s = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    hh = math.sqrt(max(l1 * l1 - s * s, 0.0))
    pp = Vector(pole) - u * Vector(pole).dot(u)
    pp.normalize()
    return h + u * s + pp * hh, d / (l1 + l2)


def solve(p):
    """Resolve o esqueleto no referencial local do corpo. Retorna quadros dos ossos e juntas."""
    P = Vector(p['P'])
    Rp = Rz(p['yaw_p']) @ Ry(p['pitch_p'])
    Oc = P + Rp @ Vector((0, 0, 0.05))
    Rc = Rz(p['yaw_c']) @ Ry(p['lean'])
    Rh = Rz(p['yaw_h']) @ Ry(p['pitch_h'])
    head_c = Oc + Rc @ Vector((0.015, 0, 0.70))
    fr = {'pelvis': (P, Rp), 'chest': (Oc, Rc), 'head': (head_c, Rh)}
    info = {'reach': {}, 'knee': {}, 'elbow': {}, 'foot_corners': {}}
    fp = Rp @ Vector((1, 0, 0))
    fc = Rc @ Vector((1, 0, 0))
    for side, sgn in (('R', -1), ('L', 1)):
        ft = p['feet'][side]
        hip = P + Rp @ Vector((0, sgn * HIP_HALF, -0.02))
        ank = Vector(ft['pos'])
        pole = Rz(0.5 * ft['yaw']) @ Vector((1, 0, 0))
        knee, ratio = ik2(hip, ank, THIGH, SHIN, pole)
        fr['thigh.' + side] = (hip, frame_zref(knee - hip, fp))
        fr['shin.' + side] = (knee, frame_zref(ank - knee, fp))
        Rf = Rz(ft['yaw']) @ Ry(-ft['pitch'])
        fr['foot.' + side] = (ank, Rf)
        info['reach'][side] = ratio
        # joelho para frente?  (deslocamento do joelho em relacao a reta quadril-tornozelo)
        mid = (hip + ank) * 0.5
        info['knee'][side] = float((knee - mid).dot(fp))
        info['foot_corners'][side] = (ank + Rf @ Vector((HEEL[0], 0, HEEL[1])),
                                      ank + Rf @ Vector((TOE[0], 0, TOE[1])))
        # braco
        ar = p['arm'][side]
        sh = Oc + Rc @ Vector((0, sgn * SHOULDER_HALF, 0.455))
        al, be, el = ar['alpha'], ar['beta'], ar['elbow']
        d = Rc @ Vector((math.sin(al) * math.cos(be), sgn * math.sin(be), -math.cos(al) * math.cos(be)))
        d.normalize()
        elbow = sh + d * UPPER_ARM
        perp = fc - d * fc.dot(d)
        perp.normalize()
        d2 = d * math.cos(el) + perp * math.sin(el)
        wrist = elbow + d2 * FOREARM
        fr['upperarm.' + side] = (sh, frame_zref(d, fc))
        fr['forearm.' + side] = (elbow, frame_zref(d2, fc))
        fr['hand.' + side] = (wrist, frame_zref(d2, fc))
        # cotovelo dobra para a frente: antebraco gira para fc em torno do braco; flexao > 0
        info['elbow'][side] = math.degrees(el)
        info.setdefault('forearm_fwd', {})[side] = float(d2.dot(fc) - d.dot(fc))
        info.setdefault('joints', {})[side] = dict(knee=knee, wrist=wrist, elbow=elbow, ankle=ank)
    return fr, info


# --------------------------------------------------------------------------- malha
def loft(rings):
    verts, meta = [], []
    for kind, data in rings:
        if kind == 'pole':
            meta.append((len(verts), 1)); verts.append(tuple(data))
        else:
            meta.append((len(verts), len(data))); verts.extend(data)
    faces = []
    for (i0, n0), (i1, n1) in zip(meta, meta[1:]):
        seg = max(n0, n1)
        if n0 == 1 and n1 == 1:
            continue
        for i in range(seg):
            j = (i + 1) % seg
            if n0 == 1:
                faces.append((i0, i1 + j, i1 + i))
            elif n1 == 1:
                faces.append((i0 + i, i0 + j, i1))
            else:
                faces.append((i0 + i, i0 + j, i1 + j, i1 + i))
    return verts, faces


def revolve(profile, seg=20, cx=0.0, cy=0.0):
    rings = []
    for z, r in profile:
        if r < 1e-9:
            rings.append(('pole', (cx, cy, z)))
        else:
            rings.append(('ring', [(cx + r * math.cos(2 * math.pi * i / seg),
                                    cy + r * math.sin(2 * math.pi * i / seg), z) for i in range(seg)]))
    return loft(rings)


def capsule(z0, z1, r0, r1, cx=0.0, cy=0.0, seg=18, steps=4):
    prof = []
    for i in range(steps):
        t = math.radians(90 - 90 * i / steps)
        prof.append((z0 - r0 * math.sin(t), r0 * math.cos(t) if i else 0.0))
    prof.append((z0, r0))
    prof.append((z1, r1))
    for i in range(1, steps + 1):
        t = math.radians(90 * i / steps)
        prof.append((z1 + r1 * math.sin(t), r1 * math.cos(t) if i < steps else 0.0))
    return revolve(prof, seg, cx, cy)


def cyl(z0, z1, r0, r1, seg=18):
    return revolve([(z0, 0.0), (z0, r0), (z1, r1), (z1, 0.0)], seg)


def _sp(w, e):
    return math.copysign(abs(w) ** e, w)


def sup_ellipsoid(c, r, e=1.0, nu=24, nv=12, rot=None):
    rings = [('pole', (c[0], c[1], c[2] - r[2]))]
    for j in range(1, nv):
        v = -math.pi / 2 + math.pi * j / nv
        cv, sv = _sp(math.cos(v), e), _sp(math.sin(v), e)
        pts = []
        for i in range(nu):
            u = 2 * math.pi * i / nu
            pts.append((c[0] + r[0] * cv * _sp(math.cos(u), e),
                        c[1] + r[1] * cv * _sp(math.sin(u), e),
                        c[2] + r[2] * sv))
        rings.append(('ring', pts))
    rings.append(('pole', (c[0], c[1], c[2] + r[2])))
    v, f = loft(rings)
    if rot is not None:
        v = [tuple(rot @ Vector(p)) for p in v]
    return v, f


def rbox(c, size, e=0.3, nu=28, nv=14):
    return sup_ellipsoid(c, (size[0] / 2, size[1] / 2, size[2] / 2), e, nu, nv)


def xf(geom, M, off=(0, 0, 0)):
    v, f = geom
    return [tuple(M @ Vector(p) + Vector(off)) for p in v], f


def part_defs():
    """(nome, osso, [geometrias no referencial do osso], cor)."""
    P = []
    add = lambda n, b, g, c: P.append((n, b, g if isinstance(g, list) else [g], PAL[c]))
    # ---- tronco
    add('pants', 'pelvis', rbox((0, 0, -0.03), (0.285, 0.40, 0.24), 0.32), 'pelvis')
    add('torso', 'chest', rbox((0, 0, 0.27), (0.285, 0.46, 0.56), 0.34), 'hoodie')
    add('hem', 'chest', rbox((0, 0, 0.03), (0.30, 0.485, 0.10), 0.30), 'hem')
    add('pocket', 'chest', rbox((0.145, 0, 0.14), (0.026, 0.27, 0.15), 0.30), 'pocketH')
    add('cord_r', 'chest', rbox((0.146, -0.036, 0.40), (0.014, 0.014, 0.13), 0.4), 'cord')
    add('cord_l', 'chest', rbox((0.146, 0.036, 0.40), (0.014, 0.014, 0.13), 0.4), 'cord')
    add('cowl', 'chest', sup_ellipsoid((-0.01, 0, 0.545), (0.13, 0.165, 0.055), 1.0, 28, 12), 'cowl')
    add('hoodback', 'chest', sup_ellipsoid((-0.125, 0, 0.45), (0.085, 0.155, 0.115), 1.0, 28, 12), 'hoodback')
    add('neck', 'chest', cyl(0.50, 0.66, 0.055, 0.052), 'skin')
    # ---- cabeca
    nose_rot = Ry(math.pi / 2)
    nose = revolve([(0.0, 0.0), (0.0, 0.030), (0.050, 0.012), (0.058, 0.0)], 12)
    add('skull', 'head', sup_ellipsoid((0, 0, 0), (0.108, 0.100, 0.118), 0.92, 28, 14), 'skin')
    add('nose', 'head', xf(nose, nose_rot, (0.104, 0, -0.012)), 'nose')
    add('ear_r', 'head', sup_ellipsoid((-0.004, -0.100, -0.012), (0.020, 0.013, 0.032)), 'ear')
    add('ear_l', 'head', sup_ellipsoid((-0.004, 0.100, -0.012), (0.020, 0.013, 0.032)), 'ear')
    hair = [sup_ellipsoid((-0.028, 0, 0.058), (0.116, 0.111, 0.094), 1.0, 28, 12),
            sup_ellipsoid((-0.052, 0, -0.030), (0.068, 0.096, 0.078), 1.0, 24, 10)]   # nuca
    for i in range(10):                                   # cachos: bolinhas na calota
        a = 2 * math.pi * i / 10 + 0.3
        hair.append(sup_ellipsoid((-0.028 + 0.080 * math.cos(a), 0.078 * math.sin(a), 0.112 + 0.010 * (i % 3)),
                                  (0.034, 0.034, 0.030), 1.0, 12, 6))
    add('hair', 'head', hair, 'hair')
    # ---- bracos e pernas
    for s, sgn in (('R', -1), ('L', 1)):
        add('upperarm_' + s, 'upperarm.' + s, capsule(0.0, UPPER_ARM, 0.078, 0.070), s + '_upper')
        add('forearm_' + s, 'forearm.' + s, cyl(0.0, FOREARM, 0.062, 0.060), s + '_fore')
        add('cuff_' + s, 'forearm.' + s, cyl(FOREARM - 0.055, FOREARM + 0.01, 0.069, 0.069), s + '_cuff')
        add('hand_' + s, 'hand.' + s, rbox((0.0, 0.0, 0.05), (0.098, 0.088, 0.115), 0.45), s + '_hand')
        out = -sgn                       # +Y do osso = direita do corpo; lateral externa = out
        add('thigh_' + s, 'thigh.' + s, capsule(0.0, THIGH, 0.108, 0.094), s + '_thigh')
        add('tpocket_' + s, 'thigh.' + s, rbox((0.0, out * 0.100, 0.20), (0.105, 0.036, 0.135), 0.32), s + '_pocket')
        add('shin_' + s, 'shin.' + s, cyl(0.0, SHIN, 0.088, 0.086), s + '_shin')
        add('pcuff_' + s, 'shin.' + s, cyl(SHIN - 0.065, SHIN + 0.03, 0.100, 0.105), s + '_pcuff')
        add('sole_' + s, 'foot.' + s, rbox((0.070, 0, -0.061), (0.310, 0.128, 0.048), 0.30), s + '_sole')
        add('shoe_' + s, 'foot.' + s, rbox((0.055, 0, -0.002), (0.280, 0.118, 0.105), 0.38), s + '_shoe')
        add('toecap_' + s, 'foot.' + s, sup_ellipsoid((0.170, 0, -0.020), (0.058, 0.062, 0.040), 0.85, 16, 8), s + '_toe')
    return P


# --------------------------------------------------------------------------- cena
def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.image_settings.color_depth = '8'
    sc.render.image_settings.compression = 15
    sc.render.dither_intensity = 0.0
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    sc.display_settings.display_device = 'sRGB'
    sh = sc.display.shading
    sh.light = 'FLAT'
    sh.color_type = 'OBJECT'
    sh.show_object_outline = False
    sh.show_cavity = False
    sh.show_shadows = False
    sh.show_specular_highlight = False
    sh.show_xray = False
    sc.display.render_aa = 'OFF'
    wd = bpy.data.worlds.new('mundo')
    wd.color = hex_lin(BG_HEX)
    sc.world = wd
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.clip_start, cam_data.clip_end = 0.1, 100.0
    cam = bpy.data.objects.new('cam', cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.rotation_euler = (math.radians(90 - ELEV_DEG), 0.0, math.radians(AZ_DEG + 90))
    return sc, cam, cam_data


def cam_basis():
    """Vetores unitarios da camera no mundo: direita, cima e direcao ate a camera."""
    e, a = math.radians(ELEV_DEG), math.radians(AZ_DEG)
    to_cam = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
    right = Vector((-math.sin(a), math.cos(a), 0.0))
    up = right.cross(-to_cam)
    return right, up, to_cam


def place_camera(cam, cam_data, ortho_scale):
    """Camera de modo que a origem do mundo caia em (W/2, ANCHOR_ROW)."""
    right, up, to_cam = cam_basis()
    cam_data.ortho_scale = ortho_scale
    ppm = H / ortho_scale
    shift_up = (ANCHOR_ROW - H / 2) / ppm
    centre = up * shift_up
    cam.location = centre + to_cam * 20.0
    bpy.context.view_layer.update()
    return ppm


def project(p, ppm):
    """Mundo -> pixel (x direita, y para baixo), conferido contra a propria matriz da camera."""
    right, up, _ = cam_basis()
    v = Vector(p)
    return (W / 2 + v.dot(right) * ppm, ANCHOR_ROW - v.dot(up) * ppm)


class Rig:
    def __init__(self, sc):
        self.sc = sc
        rest_p = idle_params(0, amp=0.0)
        rest_p['arm'] = {s: dict(alpha=0.0, beta=math.radians(7), elbow=math.radians(10)) for s in 'RL'}
        self.rest_fr, _ = solve(rest_p)
        self.rest_frame = {n: Matrix.Translation(o) @ R.to_4x4() for n, (o, R) in self.rest_fr.items()}
        coll = sc.collection
        arm_data = bpy.data.armatures.new('esqueleto')
        self.arm = bpy.data.objects.new('esqueleto', arm_data)
        coll.objects.link(self.arm)
        bpy.context.view_layer.objects.active = self.arm
        self.arm.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        for n in BONES:
            o, R = self.rest_fr[n]
            eb = arm_data.edit_bones.new(n)
            L = BONE_LEN[n.split('.')[0]]
            eb.head = o
            eb.tail = o + R.col[2] * L
            eb.roll = 0.0
        for n in BONES:
            eb = arm_data.edit_bones[n]
            if n in PARENT:
                eb.parent = arm_data.edit_bones[PARENT[n]]
            eb.use_connect = False
            eb.use_relative_parent = True
        bpy.ops.object.mode_set(mode='OBJECT')
        self.rest_bone = {n: arm_data.bones[n].matrix_local.copy() for n in BONES}
        self.parts = []
        for name, bone, geoms, hexc in part_defs():
            verts, faces = [], []
            for v, f in geoms:
                off = len(verts)
                verts += v
                faces += [tuple(i + off for i in fc) for fc in f]
            me = bpy.data.meshes.new(name)
            me.from_pydata(verts, [], faces)
            me.update()
            ob = bpy.data.objects.new(name, me)
            coll.objects.link(ob)
            ob.color = (*hex_lin(hexc), 1.0)
            ob.parent = self.arm
            ob.parent_type = 'BONE'
            ob.parent_bone = bone
            ob.matrix_parent_inverse = Matrix.Identity(4)
            ob.matrix_basis = self.rest_frame[bone]
            self.parts.append((ob, bone))
        bpy.context.view_layer.update()

    def apply(self, frames_world):
        """frames_world: osso -> (origem, matriz3) no mundo. Posa o esqueleto."""
        pose = {}
        for n in BONES:
            o, R = frames_world[n]
            Mf = Matrix.Translation(o) @ R.to_4x4()
            pose[n] = (Mf @ self.rest_frame[n].inverted()) @ self.rest_bone[n]
            pb = self.arm.pose.bones[n]
            if n in PARENT:
                p = PARENT[n]
                basis = self.rest_bone[n].inverted() @ self.rest_bone[p] @ pose[p].inverted() @ pose[n]
            else:
                basis = self.rest_bone[n].inverted() @ pose[n]
            pb.matrix_basis = basis
        bpy.context.view_layer.update()


def body_to_world(direction):
    """front: olha para +Y; back: olha para -X."""
    return Rz(math.radians(90.0 if direction == 'front' else 180.0))


def world_frames(fr, direction):
    B = body_to_world(direction)
    return {n: (B @ o, B @ R) for n, (o, R) in fr.items()}


# --------------------------------------------------------------------------- imagens
def read_png(path):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    arr = np.rint(px.reshape(h, w, 4)[::-1, :, :3] * 255.0).astype(np.uint8)
    bpy.data.images.remove(img)
    return arr


def write_png(path, arr):
    h, w, _ = arr.shape
    raw = b''.join(b'\x00' + arr[y].tobytes() for y in range(h))

    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


FONT = {
    '0': '01110 10001 10011 10101 11001 10001 01110', '1': '00100 01100 00100 00100 00100 00100 01110',
    '2': '01110 10001 00001 00010 00100 01000 11111', '3': '11110 00001 00001 01110 00001 00001 11110',
    '4': '00010 00110 01010 10010 11111 00010 00010', '5': '11111 10000 11110 00001 00001 10001 01110',
    '6': '00110 01000 10000 11110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000',
    '8': '01110 10001 10001 01110 10001 10001 01110', '9': '01110 10001 10001 01111 00001 00010 01100',
}


def draw_text(arr, text, x, y, scale=4, fg=(255, 255, 255), bg=(0, 0, 0)):
    gw = 6 * scale
    arr[y:y + 7 * scale + 2 * scale, x:x + gw * len(text) + scale] = bg
    for ci, ch in enumerate(text):
        rows = FONT[ch].split()
        for ry, row in enumerate(rows):
            for rx, bit in enumerate(row):
                if bit == '1':
                    yy, xx = y + scale + ry * scale, x + scale + ci * gw + rx * scale
                    arr[yy:yy + scale, xx:xx + scale] = fg


def make_sheet(frames, step=3, per_row=None, labels=True, guide_rows=None):
    n = len(frames)
    per_row = per_row or n
    cw, ch = W // step, H // step
    rows = (n + per_row - 1) // per_row
    sheet = np.empty((ch * rows, cw * per_row, 3), dtype=np.uint8)
    sheet[:] = hex_rgb(BG_HEX)
    for i, fr in enumerate(frames):
        r, c = divmod(i, per_row)
        sheet[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = fr[::step, ::step]
        sheet[r * ch:(r + 1) * ch, c * cw] = (0, 0, 0)
        if guide_rows:
            for gr, col in guide_rows:
                sheet[r * ch + gr // step, c * cw:(c + 1) * cw] = col
        if labels:
            draw_text(sheet, '%d' % i, c * cw + 4, r * ch + 4, scale=3 if step >= 3 else 4)
    return sheet


def analyse(arr):
    bgm = np.all(arr == np.array(hex_rgb(BG_HEX), dtype=np.uint8), axis=2)
    fg = ~bgm
    rows = np.where(fg.any(axis=1))[0]
    cols = np.where(fg.any(axis=0))[0]
    uniq = np.unique(arr.reshape(-1, 3), axis=0)
    allowed = {hex_rgb(h) for h in PAL.values()} | {hex_rgb(BG_HEX)}
    off = [tuple(int(c) for c in u) for u in uniq if tuple(int(c) for c in u) not in allowed]
    return dict(top=int(rows[0]), bottom=int(rows[-1]), left=int(cols[0]), right=int(cols[-1]),
                n_colors=int(len(uniq)), off_palette=len(off),
                border_clear=bool(not (fg[0].any() or fg[-1].any() or fg[:, 0].any() or fg[:, -1].any())))


# --------------------------------------------------------------------------- verificacoes
def seg_dist(p0, p1, q0, q1):
    u, v, w0 = p1 - p0, q1 - q0, p0 - q0
    a, b, c, d, e = u.dot(u), u.dot(v), v.dot(v), u.dot(w0), v.dot(w0)
    den = a * c - b * b
    s = 0.0 if den < 1e-12 else min(1, max(0, (b * e - c * d) / den))
    t = (b * s + e) / c if c > 1e-12 else 0.0
    t = min(1, max(0, t))
    s = min(1, max(0, (b * t - d) / a)) if a > 1e-12 else 0.0
    return (p0 + u * s - (q0 + v * t)).length


def check_walk(frames_local):
    """frames_local: lista (fr, info, params) de 12 quadros. Retorna metricas objetivas."""
    res = {}
    n = len(frames_local)
    # contato dos pontos do tenis (mundo, em x ao longo do eixo de marcha)
    contact_pairs, slip_max = [], 0.0
    for side in 'RL':
        for pt in (0, 1):
            xs, zs = [], []
            for k in range(n + 1):
                fr, info, p = frames_local[k % n]
                c = info['foot_corners'][side][pt]
                # mundo: o corpo avanca V*t; x_mundo = x_corpo + STRIDE * k/12 (+ ciclo)
                xs.append(c.x + STRIDE * k / n)
                zs.append(c.z)
            for k in range(n):
                if zs[k] < 0.0015 and zs[k + 1] < 0.0015:
                    slip_max = max(slip_max, abs(xs[k + 1] - xs[k]))
                    contact_pairs.append((side, 'heel' if pt == 0 else 'toe', k))
    res['deslize_max_mm'] = slip_max * 1000
    # comprimento do ciclo medido pelo pe de apoio: deslocamento do tornozelo relativo ao quadril entre
    # quadros consecutivos com o pe plano no chao (nao desliza => avanco do quadril = recuo do pe)
    flat = []
    for side in 'RL':
        for k in range(n):
            a0 = frames_local[k][1]['foot_corners'][side]
            a1 = frames_local[(k + 1) % n][1]['foot_corners'][side]
            on = all(frames_local[kk][1]['foot_corners'][side][i].z < 0.0015
                     for kk in (k, (k + 1) % n) for i in (0, 1))
            if on:
                flat.append(float(a0[0].x - a1[0].x))
    res['recuo_pe_plano_por_quadro_m'] = flat
    res['ciclo_medido_m'] = float(np.mean(flat) * n) if flat else None
    res['pares_pe_plano'] = len(flat)
    # alcance, joelhos, cotovelos
    res['alcance_max'] = max(max(i['reach'].values()) for _, i, _ in frames_local)
    res['alcance_min'] = min(min(i['reach'].values()) for _, i, _ in frames_local)
    res['joelho_para_frente_min_m'] = min(min(i['knee'].values()) for _, i, _ in frames_local)
    res['flexao_cotovelo_min_graus'] = min(min(i['elbow'].values()) for _, i, _ in frames_local)
    res['antebraco_mais_a_frente_que_braco_min'] = min(min(i['forearm_fwd'].values()) for _, i, _ in frames_local)
    # penetracao do tenis no chao e altura do ponto mais baixo
    res['tenis_min_z_mm'] = 1000 * min(min(c.z for c in i['foot_corners'][s]) for _, i, _ in frames_local for s in 'RL')
    # penetracoes entre membros (folga = distancia - soma dos raios)
    marg = 9
    for fr, info, p in frames_local:
        hip = {s: fr['thigh.' + s][0] for s in 'RL'}
        knee = {s: fr['shin.' + s][0] for s in 'RL'}
        ank = {s: fr['foot.' + s][0] for s in 'RL'}
        marg = min(marg, seg_dist(hip['R'], knee['R'], hip['L'], knee['L']) - 0.2,
                   seg_dist(knee['R'], ank['R'], knee['L'], ank['L']) - 0.17)
        for s in 'RL':
            o = 'L' if s == 'R' else 'R'
            wr = fr['hand.' + s][0]
            for a, b, rr in ((hip[o], knee[o], 0.19), (hip[s], knee[s], 0.19)):
                marg = min(marg, seg_dist(wr, wr, a, b) - 0.19 - 0.04)
    res['folga_min_membros_m'] = marg
    return res


def screen_contact(local, direction, ppm):
    """Verificacao no espaco da tela. O jogo desloca o sprite (dx, dy) px por quadro; com isso o ponto de
    contato do pe de apoio (calcanhar/ponta) tem de ficar parado na tela. Retorna o erro maximo em px
    e a linha (px) da sola do pe de apoio mais baixo em cada quadro."""
    right, up, _ = cam_basis()
    B = body_to_world(direction)
    adv = B @ Vector((STRIDE / N_WALK, 0, 0))               # avanco do quadril por quadro (mundo)
    dx, dy = adv.dot(right) * ppm, -adv.dot(up) * ppm        # em px de tela (y para baixo)
    n = len(local)

    def pix(c):
        w = B @ c
        return (W / 2 + w.dot(right) * ppm, ANCHOR_ROW - w.dot(up) * ppm)
    # posicao_tela(k) = ancora_sprite(k) + pix(contato no quadro k), ancora_sprite(k+1) = ancora(k) + (dx, dy)
    # => contato parado na tela  <=>  pix(k+1) + (dx, dy) == pix(k)  (ponto de apoio fixo no mundo)
    err, pairs = 0.0, 0
    for side in 'RL':
        for pt in (0, 1):
            for k in range(n):
                c0 = local[k][1]['foot_corners'][side][pt]
                c1 = local[(k + 1) % n][1]['foot_corners'][side][pt]
                if c0.z < 0.0015 and c1.z < 0.0015:
                    p0, p1 = pix(c0), pix(c1)
                    err = max(err, abs(p1[0] + dx - p0[0]), abs(p1[1] + dy - p0[1]))
                    pairs += 1
    # linha (px) da sola do pe de apoio (ponto de contato mais baixo na tela entre os pontos no chao)
    rows = []
    for fr, info, p in local:
        cand = [pix(c)[1] for s in 'RL' for c in info['foot_corners'][s] if c.z < 0.0015]
        rows.append(round(max(cand), 1) if cand else None)
    return dict(erro_max_px=err, pares=pairs, sprite_dx_dy_por_quadro_px=[round(dx, 2), round(dy, 2)],
                sola_pe_apoio_px_por_quadro=rows)


def _pose_vec(p):
    """Vetor numerico de uma pose (juntas e orientacoes) para comparar quadros."""
    fr, info = solve(p)
    v = []
    for n in BONES:
        o, R = fr[n]
        v += list(o) + [x for row in R for x in row]
    return np.array(v)


def check_loop_and_mirror():
    """Emenda 11->00 e troca de lados na metade do ciclo (quadro k+6 = espelho do quadro k)."""
    res = {}
    res['quadro12_menos_quadro0_max'] = float(np.abs(_pose_vec(walk_params(12)) - _pose_vec(walk_params(0))).max())
    steps = []
    for k in range(N_WALK):
        a = solve(walk_params(k))[1]['joints']
        b = solve(walk_params(k + 1))[1]['joints']        # k = 11 -> quadro 12 == quadro 0
        steps.append(max((a[s][j] - b[s][j]).length for s in 'RL' for j in a[s]))
    res['deslocamento_max_junta_entre_quadros_m'] = [round(s, 4) for s in steps]
    res['transicao_11_para_0_m'] = round(steps[-1], 4)
    mir = 0.0
    for k in range(N_WALK // 2):
        pa, pb = walk_params(k), walk_params(k + N_WALK // 2)
        for s, o in (('R', 'L'), ('L', 'R')):          # (x, z) iguais; y troca de sinal
            ps, po = pa['feet'][s]['pos'], pb['feet'][o]['pos']
            mir = max(mir, abs(ps.x - po.x), abs(ps.z - po.z), abs(ps.y + po.y))
        mir = max(mir, abs(pa['P'].y + pb['P'].y))
        for s, o in (('R', 'L'), ('L', 'R')):
            mir = max(mir, abs(pa['feet'][s]['pitch'] - pb['feet'][o]['pitch']),
                      abs(pa['arm'][s]['alpha'] - pb['arm'][o]['alpha']),
                      abs(pa['arm'][s]['elbow'] - pb['arm'][o]['elbow']))
        # pelvis e tronco giram para o lado oposto
        mir = max(mir, abs(pa['yaw_p'] + pb['yaw_p']), abs(pa['yaw_c'] + pb['yaw_c']))
        mir = max(mir, abs(pa['P'].z - pb['P'].z))
    res['espelho_meio_ciclo_erro_max'] = float(mir)
    # passagem: no quadro 3 o pe de balanco cruza o tornozelo do pe de apoio
    p3 = walk_params(3)
    res['passagem_quadro3_dx_tornozelos_m'] = float(abs(p3['feet']['R']['pos'].x - p3['feet']['L']['pos'].x))
    return res


# --------------------------------------------------------------------------- principal
def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    rev_dir = os.path.join(OUT_DIR, '_revisao')
    os.makedirs(rev_dir, exist_ok=True)
    sc, cam, cam_data = build_scene()
    rig = Rig(sc)
    scale = 3.0
    ppm = place_camera(cam, cam_data, scale)
    tmp = os.path.join(rev_dir, '_tmp.png')
    sc.render.filepath = tmp

    def render_pose(params, direction):
        fr, info = solve(params)
        rig.apply(world_frames(fr, direction))
        bpy.ops.render.render(write_still=True)
        return read_png(tmp), fr, info

    if SELFTEST:
        # conferir paternidade por osso: matriz de cada peca deve ser = quadro posado do osso
        p = walk_params(3)
        fr, info = solve(p)
        wf = world_frames(fr, 'front')
        rig.apply(wf)
        worst = 0.0
        for ob, bone in rig.parts:
            o, R = wf[bone]
            M = Matrix.Translation(o) @ R.to_4x4()
            d = max(abs(a - b) for ra, rb in zip(ob.matrix_world, M) for a, b in zip(ra, rb))
            worst = max(worst, d)
        print('SELFTEST maior erro de matriz peca x osso: %.3e' % worst)
        return

    # --- calibra a escala: personagem (topo do cabelo ate a sola mais baixa) = FIG_FRAC da altura
    for _ in range(3):
        arr, _, _ = render_pose(idle_params(0), 'front')
        a = analyse(arr)
        hpx = a['bottom'] - a['top'] + 1
        scale = scale * hpx / (FIG_FRAC * H)
        ppm = place_camera(cam, cam_data, scale)
    arr, _, _ = render_pose(idle_params(0), 'front')
    a = analyse(arr)
    print('calibragem: ortho_scale=%.4f px/m=%.2f altura=%d (%.1f%%)' % (scale, ppm, a['bottom'] - a['top'] + 1,
                                                                       100.0 * (a['bottom'] - a['top'] + 1) / H))

    right, up, _ = cam_basis()
    meta = dict(
        imagem=dict(largura=W, altura=H, fundo=BG_HEX, antialias=False),
        camera=dict(tipo='ortografica', elevacao_graus=ELEV_DEG, azimute_graus=AZ_DEG,
                    ortho_scale_m=scale, pixels_por_metro=ppm,
                    eixo_chao_front_tela=[round(0.5 * 2 ** 0.5, 4), round(0.25 * 2 ** 0.5, 4)],
                    eixo_chao_back_tela=[round(0.5 * 2 ** 0.5, 4), round(-0.25 * 2 ** 0.5, 4)],
                    observacao_eixo='(dx, dy) por metro andado, dy positivo = para baixo na tela, em unidades de tela (1 = 1 m projetado)'),
        ancora=dict(
            linha_sola_px=ANCHOR_ROW, coluna_centro_px=W // 2,
            nota='Chao sob o quadril (raiz). E a ancora do sprite: o jogo desloca a raiz ao longo do eixo de marcha; '
                 'com o pe de apoio parado no mundo ele fica parado na tela. A sola do pe de apoio NAO fica '
                 'numa unica linha de pixels porque o eixo e diagonal: o pe recua no mundo e, na tela, desce/sobe '
                 '(ver sola_mais_baixa_por_quadro_px).'),
        marcha=dict(velocidade_ms=V_WALK, ciclo_m=None, passo_m=None, duracao_ciclo_s=CYCLE_S,
                    quadros=N_WALK, ms_por_quadro=1000 * CYCLE_S / N_WALK, fps=N_WALK / CYCLE_S),
        animacoes={})
    for fn in os.listdir(OUT_DIR):
        if fn.endswith('.png'):
            os.remove(os.path.join(OUT_DIR, fn))
    walk_checks = {}
    rows_global = {}
    jobs = [('walk', N_WALK, walk_params), ('idle', N_IDLE, idle_params)]
    for anim, n, fn_params in jobs:
        for direction in ('front', 'back'):
            frames, stats, local = [], [], []
            ks = range(n) if not DEV else [0, 3, 6, 9][:n] if anim == 'walk' else [0, 2, 4, 6]
            for k in ks:
                p = fn_params(k)
                arr, fr, info = render_pose(p, direction)
                st = analyse(arr)
                path = os.path.join(OUT_DIR, '%s-%s-%02d.png' % (anim, direction, k))
                write_png(path, arr)
                frames.append(arr)
                stats.append(st)
                local.append((fr, info, p))
            a = dict(
                quadros=len(frames),
                topo_px_por_quadro=[s['top'] for s in stats],
                sola_mais_baixa_por_quadro_px=[s['bottom'] for s in stats],
                esquerda_px_por_quadro=[s['left'] for s in stats],
                direita_px_por_quadro=[s['right'] for s in stats],
                cores_por_quadro=[s['n_colors'] for s in stats],
                borda_livre=all(s['border_clear'] for s in stats))
            meta['animacoes']['%s-%s' % (anim, direction)] = a
            all_rows = [(ANCHOR_ROW, (255, 255, 255))]
            sheet = make_sheet(frames, step=3, guide_rows=None)
            write_png(os.path.join(OUT_DIR, 'folha-%s-%s.png' % (anim, direction)), sheet)
            if not DEV:
                half = (n + 1) // 2
                for part in range(2):
                    sub = frames[part * half:(part + 1) * half]
                    sh = make_sheet(sub, step=2, labels=False, guide_rows=[(ANCHOR_ROW, (255, 255, 255))])
                    for i in range(len(sub)):                       # numero do quadro
                        draw_text(sh, '%d' % (part * half + i), i * (W // 2) + 4, 4, scale=5)
                    write_png(os.path.join(rev_dir, 'rev-%s-%s-%d.png' % (anim, direction, part)), sh)
            if anim == 'walk':
                walk_checks[direction] = check_walk(local)
                walk_checks[direction]['tela'] = screen_contact(local, direction, ppm)
            a['fora_da_paleta_por_quadro'] = [s['off_palette'] for s in stats]
            rows_global[(anim, direction)] = stats
    # --- metadados globais
    wc = walk_checks['front']
    if wc['ciclo_medido_m'] is None:        # --dev: quadros nao consecutivos
        wc['ciclo_medido_m'] = STRIDE
    meta['marcha']['ciclo_m'] = round(wc['ciclo_medido_m'], 4)
    meta['marcha']['passo_m'] = round(wc['ciclo_medido_m'] / 2, 4)
    meta['marcha']['como_foi_medido'] = ('recuo do tornozelo do pe de apoio (plano no chao) relativo ao quadril, '
                                         'entre quadros consecutivos, x 12 quadros')
    wc.update(check_loop_and_mirror())
    meta['marcha']['validacao'] = wc
    meta['marcha']['validacao_back_tela'] = walk_checks['back']['tela']
    meta['marcha']['deslocamento_sprite_front_px_por_quadro'] = wc['tela']['sprite_dx_dy_por_quadro_px']
    meta['marcha']['deslocamento_sprite_back_px_por_quadro'] = walk_checks['back']['tela']['sprite_dx_dy_por_quadro_px']
    all_top = [s['top'] for st in rows_global.values() for s in st]
    all_bot = [s['bottom'] for st in rows_global.values() for s in st]
    idle_top = [s['top'] for (a_, d_), st in rows_global.items() if a_ == 'idle' for s in st]
    meta['ancora']['linha_topo_px_idle_min'] = min(idle_top)
    meta['ancora']['linha_topo_px_todas_min'] = min(all_top)
    meta['ancora']['sola_mais_baixa_todas_px_max'] = max(all_bot)
    meta['q_balanco'] = Q_SWING
    with open(os.path.join(OUT_DIR, 'metadados.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    if os.path.exists(tmp):
        os.remove(tmp)
    print('walk validacao:', json.dumps(wc, indent=1))
    print('feito:', OUT_DIR)


main()
