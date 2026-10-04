import {
  initial,
  solve,
  validateDefinition,
  type Definition,
  type Profile,
} from "./engine";
import { generate, VERSION } from "./generator";
export const CHAPTER = [
  {
    name: "Первый покупатель",
    customer: "Нина",
    line: "К завтраку — хлеб, молоко и немного варенья.",
    profile: "tutorial",
  },
  {
    name: "Солнечный завтрак",
    customer: "Борис",
    line: "Хлеб ещё тёплый. Поможете собрать заказ?",
    profile: "tutorial",
  },
  {
    name: "Утро в лавке",
    customer: "Мила",
    line: "Ещё один заказ — и у нас будет новая вывеска!",
    profile: "tutorial",
  },
  {
    name: "Привет с набережной",
    customer: "Нина",
    line: "Как хорошо, что ваша лавка совсем рядом.",
    profile: "front",
  },
  {
    name: "Пикник у маяка",
    customer: "Борис",
    line: "Возьмём самое вкусное с собой к морю.",
    profile: "front",
  },
  {
    name: "Для добрых соседей",
    customer: "Мила",
    line: "Наши первые постоянные покупатели!",
    profile: "front",
  },
  {
    name: "Свежая поставка",
    customer: "Илья",
    line: "За первым рядом спрятан ещё один. Освободите полку!",
    profile: "layers",
  },
  {
    name: "Полные полки",
    customer: "Нина",
    line: "Сначала передний ряд, затем — всё остальное.",
    profile: "layers",
  },
  {
    name: "Посылка от пекаря",
    customer: "Илья",
    line: "Поставка откроется после отправки троек.",
    profile: "crate",
  },
  {
    name: "Маленький праздник",
    customer: "Мила",
    line: "Сегодня гостей много. Давайте соберём все заказы!",
    profile: "mixed",
  },
] as const;
export const SEEDS = [
  "first",
  "morning",
  "opening",
  "coast-4",
  "coast-5",
  "coast-6-v2",
  "coast-7",
  "coast-8",
  "coast-9",
  "coast-10",
];
export function chapterLevel(number: number): Definition {
  if (!Number.isInteger(number) || number < 1 || number > CHAPTER.length)
    throw new Error("Unknown chapter level");
  const story = CHAPTER[number - 1];
  let def: Definition;
  if (number <= 3) {
    const arrangements = [
      [
        ["j", "j", "m"],
        ["m", "m", "j"],
        ["b", "b", null],
        ["b", null, null],
      ],
      [
        ["b", "j", "m"],
        ["j", "m", "m"],
        ["b", "j", null],
        ["b", null, null],
      ],
      [
        ["j", "m", "b"],
        ["m", "b", "j"],
        ["b", null, "m"],
        ["j", null, null],
      ],
    ];
    def = {
      id: `${VERSION}:tutorial:${number}`,
      number,
      seed: SEEDS[number - 1],
      generatorVersion: VERSION,
      name: story.name,
      note: "Три одинаковых на одной полке — готовый заказ.",
      profile: "tutorial",
      budget: null,
      shelves: arrangements[number - 1].map((front) => ({
        front: front as Definition["shelves"][0]["front"],
        rear: [],
      })),
      verifiedSolution: [],
    };
    const result = solve(initial(def), 18000, 30);
    if (!result.path) throw new Error("Tutorial unverified");
    def.verifiedSolution = result.path;
  } else def = generate(SEEDS[number - 1], story.profile as Profile, number);
  def.name = story.name;
  def.note = story.line;
  validateDefinition(def);
  return def;
}
