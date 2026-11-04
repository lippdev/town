import type { BufferAttribute, InterleavedBufferAttribute } from "three";

type Attribute = BufferAttribute | InterleavedBufferAttribute;

/**
 * Corta triângulos sem deformar: junta os triângulos em ilhas (pedaços que se tocam),
 * mantém sempre a maior e fica com uma fração das demais, igualmente espaçadas.
 *
 * Na planta, 53 mil dos 69 mil triângulos são as pedrinhas da terra do vaso, cada uma
 * uma ilha. De longe, ninguém as conta; o vaso e as folhas continuam inteiros.
 */
export function thinIslands(index: Attribute, position: Attribute, keep: number): Uint32Array {
  const representative = new Int32Array(position.count);
  const seen = new Map<string, number>();
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    // Vértices duplicados por costura de UV continuam sendo o mesmo ponto.
    const key = `${position.getX(vertex)},${position.getY(vertex)},${position.getZ(vertex)}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, vertex);
    representative[vertex] = first ?? vertex;
  }

  const parent = Int32Array.from({ length: position.count }, (_, vertex) => vertex);
  const find = (start: number) => {
    let node = start;
    while (parent[node] !== node) {
      parent[node] = parent[parent[node]!]!;
      node = parent[node]!;
    }
    return node;
  };

  const triangles = Math.floor(index.count / 3);
  const corner = (triangle: number, offset: number) => representative[index.getX(triangle * 3 + offset)]!;
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const root = find(corner(triangle, 0));
    parent[find(corner(triangle, 1))] = root;
    parent[find(corner(triangle, 2))] = root;
  }

  const sizes = new Map<number, number>();
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const root = find(corner(triangle, 0));
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  const ordered = [...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const kept = new Set<number>();
  ordered.forEach(([root], position_) => {
    // A maior fica sempre; as demais entram a cada `1 / keep`.
    if (position_ === 0 || Math.floor(position_ * keep) !== Math.floor((position_ - 1) * keep)) kept.add(root);
  });

  const result: number[] = [];
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    if (!kept.has(find(corner(triangle, 0)))) continue;
    result.push(index.getX(triangle * 3), index.getX(triangle * 3 + 1), index.getX(triangle * 3 + 2));
  }
  return Uint32Array.from(result);
}
