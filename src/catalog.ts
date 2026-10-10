// One registry for rules, persistence, sprites and authoring tools.
export const GOODS = {
  j: { name: "Варенье", file: "jam", color: "#d9464b" },
  m: { name: "Молоко", file: "milk", color: "#238dc7" },
  b: { name: "Хлеб", file: "bread", color: "#e2a546" },
  p: { name: "Груши", file: "pear", color: "#83a547" },
  h: { name: "Мёд", file: "honey", color: "#dea02f" },
  l: { name: "Лимоны", file: "lemon", color: "#e8c23b" },
  eg: { name: "Яйца в коробке", file: "eggs", color: "#dec5a0" },
  ch: { name: "Сыр", file: "cheese", color: "#efb838" },
  ju: { name: "Сок", file: "juice", color: "#ee9431" },
  ap: { name: "Яблоки", file: "apple", color: "#cc403d" },
  or: { name: "Апельсины", file: "orange", color: "#ed982d" },
  ba: { name: "Бананы", file: "banana", color: "#e4c549" },
  ri: { name: "Рис", file: "rice", color: "#eee2bf" },
  te: { name: "Чай", file: "tea", color: "#7b8750" },
  oi: { name: "Оливковое масло", file: "olive-oil", color: "#91984a" },
  fl: { name: "Мука", file: "flour", color: "#e4d4b4" },
  su: { name: "Сахар", file: "sugar", color: "#dae7e4" },
  co: { name: "Кофе", file: "coffee", color: "#8a543d" },
  ol: { name: "Оливки", file: "olives", color: "#77924a" },
  pa: { name: "Макароны", file: "pasta", color: "#e7bb62" },
  ct: { name: "Томаты в банке", file: "canned-tomatoes", color: "#ce5740" },
  pe: { name: "Персики", file: "peach", color: "#e89b74" },
  gr: { name: "Виноград", file: "grape", color: "#9270a4" },
  st: { name: "Клубника", file: "strawberry", color: "#d3484b" },
  bg: { name: "Багет", file: "baguette", color: "#d69437" },
  cr: { name: "Круассан", file: "croissant", color: "#dc9b42" },
  pr: { name: "Пирог", file: "pie", color: "#c9853f" },
  bu: { name: "Булочка", file: "bun", color: "#dca449" },
  le: { name: "Лимонад", file: "lemonade", color: "#e6ca55" },
} as const;
export type Good = keyof typeof GOODS;
export const GOOD_IDS = Object.keys(GOODS) as Good[];
export const isGood = (value: unknown): value is Good =>
  typeof value === "string" && Object.hasOwn(GOODS, value);
