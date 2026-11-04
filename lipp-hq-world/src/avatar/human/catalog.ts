/**
 * Catálogo local do pacote de avatar do Wawa Sensei. O projeto original guarda estes
 * dados num PocketBase; aqui é uma tabela sem rede nem credencial. Não importa three,
 * para a validação rodar também nos testes.
 */

export const CATEGORY_IDS = ["head", "hair", "eyes", "eyebrow", "nose", "face", "facialHair", "glasses", "hat", "bow", "earring", "top", "bottom", "shoes", "outfit"] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface CatalogItem {
  /** Nome do arquivo sem extensão: é também o id salvo no preset. */
  id: string;
  label: string;
  /** Tem material `Color_`, então a cor da categoria vale para ela. */
  colorable: boolean;
  /** Categorias que esta peça cobre: elas não são desenhadas enquanto ela estiver. */
  locks: readonly CategoryId[];
}

export interface Category {
  id: CategoryId;
  label: string;
  /** Sem ela a figura fica com um buraco no corpo. */
  required: boolean;
  /** Paleta da cor da categoria; vazia quando nenhuma peça aceita cor. */
  palette: readonly string[];
  items: readonly CatalogItem[];
}

const SKIN = ["#f5c6a5", "#eab08c", "#d4966e", "#b97a52", "#8d5a3c", "#5f3b28"] as const;
const HAIR = ["#17120f", "#3b2417", "#6b4426", "#a8703a", "#d9b26a", "#8e8e93", "#b0413e", "#3c63b0"] as const;
const CLOTH = ["#23262c", "#f2efe8", "#7a8087", "#2f4256", "#2563eb", "#22c55e", "#f59e0b", "#a83232", "#a855f7", "#ec4899"] as const;

function series(prefix: string, count: number, label: string, colorable: (index: number) => boolean = () => true): CatalogItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}.${String(index + 1).padStart(3, "0")}`,
    label: `${label} ${index + 1}`,
    colorable: colorable(index + 1),
    locks: [],
  }));
}

function item(id: string, label: string, colorable = false, locks: readonly CategoryId[] = []): CatalogItem {
  return { id, label, colorable, locks };
}

/** O capuz das fantasias cobre a cabeça: cabelo e chapéu atravessariam o tecido. */
const HOODED: readonly CategoryId[] = ["top", "bottom", "shoes", "hair", "hat", "bow", "earring"];
/** A abóbora toma o lugar da cabeça inteira. */
const WHOLE_HEAD: readonly CategoryId[] = ["head", "hair", "eyes", "eyebrow", "nose", "face", "facialHair", "glasses", "bow", "earring"];

export const CATEGORIES: readonly Category[] = [
  { id: "head", label: "Cabeça", required: true, palette: SKIN, items: series("Head", 4, "Cabeça", () => false) },
  { id: "hair", label: "Cabelo", required: false, palette: HAIR, items: series("Hair", 11, "Cabelo") },
  { id: "eyes", label: "Olhos", required: true, palette: [], items: series("Eyes", 12, "Olhos", () => false) },
  { id: "eyebrow", label: "Sobrancelhas", required: false, palette: HAIR, items: series("EyeBrow", 10, "Sobrancelha") },
  { id: "nose", label: "Nariz", required: true, palette: [], items: series("Nose", 4, "Nariz", () => false) },
  { id: "face", label: "Rosto", required: false, palette: CLOTH, items: series("Face", 7, "Rosto", (index) => index === 7) },
  { id: "facialHair", label: "Barba", required: false, palette: HAIR, items: series("FacialHair", 7, "Barba") },
  { id: "glasses", label: "Óculos", required: false, palette: CLOTH, items: series("Glasses", 4, "Óculos", (index) => index !== 2) },
  {
    id: "hat",
    label: "Chapéu",
    required: false,
    palette: CLOTH,
    items: [
      item("Hat.001", "Coroa"),
      item("Hat.002", "Boné", true),
      item("Hat.003", "Gorro"),
      item("Hat.004", "Cartola"),
      item("Hat.005", "Pirata"),
      item("Hat.006", "Auréola"),
      item("Hat.007", "Fones"),
      item("PumpkinHead", "Abóbora", false, WHOLE_HEAD),
    ],
  },
  { id: "bow", label: "Laço", required: false, palette: CLOTH, items: series("Bow", 2, "Laço") },
  { id: "earring", label: "Brinco", required: false, palette: [], items: series("Earring", 6, "Brinco", () => false) },
  { id: "top", label: "Blusa", required: true, palette: CLOTH, items: [item("Top.001", "Camiseta", true), item("Top.002", "Camiseta larga", true), item("Top.003", "Regata", true)] },
  { id: "bottom", label: "Calça", required: true, palette: CLOTH, items: [item("Bottom.001", "Calça", true), item("Bottom.002", "Bermuda", true), item("Bottom.003", "Saia", true)] },
  { id: "shoes", label: "Sapatos", required: true, palette: CLOTH, items: [item("Shoes.001", "Tamanco", true), item("Shoes.002", "Tênis", true), item("Shoes.003", "Sapato", true)] },
  {
    id: "outfit",
    label: "Fantasia",
    required: false,
    palette: CLOTH,
    items: [
      item("Outfit.001", "Urso", false, HOODED),
      item("Outfit.003", "Coelho", false, HOODED),
      item("Outfit.004", "Gato", false, HOODED),
      item("WawaDress", "Vestido", true, ["top", "bottom"]),
    ],
  },
];

export const CATEGORIES_BY_ID = Object.fromEntries(CATEGORIES.map((category) => [category.id, category])) as Record<CategoryId, Category>;

export const ITEMS_BY_ID: Record<string, CatalogItem & { category: CategoryId }> = Object.fromEntries(
  CATEGORIES.flatMap((category) => category.items.map((item) => [item.id, { ...item, category: category.id }])),
);

export const itemFile = (itemId: string) => `${itemId}.glb`;
