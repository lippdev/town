"""Recorta e amplia um trecho do atlas sobre o fundo do piso: recorte.py <png> <x> <y> <l> <a> <esc> <saida>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from filipe_lib import *
a = args()
png, x, y, w, h, esc, saida = a[0], *map(int, a[1:6]), a[6]
im = ler_png(png)[y:y + h, x:x + w]
bg = np.zeros(im.shape[:3], np.uint8); bg[:] = (0xC9, 0xA3, 0x6F, 255)
out = np.where(im[..., 3:4] > 0, im, bg)
out = np.repeat(np.repeat(out, esc, 0), esc, 1)
gravar_png(saida, out)
