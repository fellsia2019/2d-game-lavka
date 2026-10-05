export const RENOVATIONS = [
  {
    id: "sign",
    name: "Вывеска",
    cost: 3,
    description: "Новое имя и цвет вашей лавки",
    icon: "shell",
  },
  {
    id: "counter",
    name: "Прилавок",
    cost: 3,
    description: "Тёплое дерево и место для заказов",
    icon: "reserve",
  },
  {
    id: "window",
    name: "Зелёный уголок",
    cost: 4,
    description: "Цветы у окна и уютный свет",
    icon: "wave",
  },
] as const;
export type RenovationId = (typeof RENOVATIONS)[number]["id"];
export type RenovationColor = "sea" | "honey" | "coral";
export const COLORS: Record<RenovationColor, string> = {
  sea: "Морская бирюза",
  honey: "Тёплый мёд",
  coral: "Коралловый закат",
};
