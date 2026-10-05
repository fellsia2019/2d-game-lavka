// One registry for rules, persistence, sprites and authoring tools.
export const GOODS = {
  j: { name: "Варенье", file: "jam", color: "#d9464b" },
  m: { name: "Молоко", file: "milk", color: "#238dc7" },
  b: { name: "Хлеб", file: "bread", color: "#e2a546" },
  p: { name: "Груши", file: "pear", color: "#83a547" },
  h: { name: "Мёд", file: "honey", color: "#dea02f" },
  l: { name: "Лимоны", file: "lemon", color: "#e8c23b" },
} as const;
export type Good = keyof typeof GOODS;
export const GOOD_IDS = Object.keys(GOODS) as Good[];
export const isGood = (value: unknown): value is Good =>
  typeof value === "string" && Object.hasOwn(GOODS, value);
