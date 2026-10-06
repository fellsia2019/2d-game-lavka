# Игровые ассеты

## Формат изображений и новый план

Для полного первого выпуска действуют [CONTENT_MASTER_PLAN.md](../CONTENT_MASTER_PLAN.md) и [каталог 480 работ](../CONTENT_CATALOG.md): 24 этапа, удаляемые заросли, стадии строительства, 48 товаров и примерно 18 рабочих зон сцен. Target из каталога — плановый объект, а не уже готовый файл/anchor. Целевой пакет до 64 МБ, мебель/состояния до 24 МБ; переиспользование, замены и контроль декодированной памяти обязательны. Новые исходники и упаковка фиксируются здесь по мере фактического производства.

Все игровые изображения используются как **2D-растровые ресурсы**. Формулировки «stylized 3D illustration» и «2.5D» в сохранённых заданиях ниже описывают объёмный внешний вид: нарисованные перспективу, свет, материалы и тени. Они не обозначают наличие 3D-моделей или 3D-движка в приложении.

Новая кампания по [CONTENT_MASTER_PLAN.md](../CONTENT_MASTER_PLAN.md) требует общей карты и отдельных локаций с фиксированным ракурсом. Перед производством согласовать начало, середину и финал каждой сцены. Базовый интерьер содержит архитектуру и неподвижное окружение; изменяемые полки, оборудование, выкладка и декор готовятся отдельными прозрачными спрайтами с согласованным ракурсом и светом. Предусмотреть места товаров на пустой мебели, размеры, порядок перекрытия и замену предыдущих состояний.

Текущий `shop.webp` создан из уже наполненного концепта и относится к демоглаве 0.2.0. Для первой сцены новой кампании подготовлены пустой интерьер, карта у песчаного пляжа, прозрачные стеллаж и корзина. Игра 0.3.0 и предпросмотр повторно используют существующие товары и прилавок; купленные раньше цветы сохраняются дополнительным слоем. [CAMPAIGN_VISUALS.md](CAMPAIGN_VISUALS.md) описывает набор, слои и три состояния; [CAMPAIGN_PROMPTS.json](CAMPAIGN_PROMPTS.json) сохраняет точные задания. Все новые исходники и runtime-файлы хранятся в репозитории.

## Существующий набор изображений

Товары и полка созданы инструментом image_gen. Референс стиля: `../reference/coastal-shop-approved-visual.png`. Оригиналы сохранены в проекте: `goods-atlas-original.png` (1536 × 1024 RGBA) и `shelf-original.png` (1774 × 887 RGBA). Оба имеют прозрачный alpha-канал.

Нормализованный набор итоговых заданий для воспроизводства художественного направления:

1. Создать игровой атлас на прозрачном фоне: ровная сетка 3 × 2, по одному предмету в ячейке, с большими прозрачными отступами. Порядок сверху: красное клубничное варенье в стеклянной банке, белое молоко в бутылке с синей крышкой, круглый золотистый хлеб. Снизу: зелёно-жёлтая груша с листом, золотой мёд в банке, яркий жёлтый лимон с листом. Объёмная тёплая стилизованная 3D иллюстрация для уютной игры сортировки, как в утверждённом референсе. Материалы должны хорошо читаться на небольшом размере: стекло, молоко, блестящая корочка, фрукты. Общий ракурс и мягкий солнечный свет сверху слева, небольшая контактная тень. Без интерфейса, текста, рамок и водяных знаков, без соприкосновения соседних предметов.
2. Создать одну пустую игровую полку на прозрачном фоне, в том же художественном стиле и ракурсе. Широкая деревянная полка с тёплой медовой текстурой, объёмным передним бортиком и яркими бирюзовыми боковыми опорами, мягкий солнечный свет сверху слева. Три хорошо различимых места для отдельных товаров. Только полка; без товаров, текста, интерфейса, фона и водяных знаков.

Это описания использованного набора требований, а не гарантия побитового воспроизведения генерации. Сохраняемые PNG — источники для точного повторения упаковки.

`scripts/prepare-art.py` читает локальные оригиналы из `docs/art` и концепт из `docs/reference`, не изменяя их. Для перепаковки нужен Python с Pillow. Товары вырезаются из атласа, получают плотные рамки с небольшим отступом, сохраняют пропорции и исходный alpha, уменьшаются до 320 × 420 и записываются в WebP quality 91. Alpha-порог 48 используется только для выбора прямоугольника обрезки, не для удаления пикселей изображения. Полка уменьшается до 1000 × 600, WebP quality 90. Концепт интерьера преобразован в RGB WebP quality 88.

Runtime файлы: `public/assets/jam.webp`, `milk.webp`, `bread.webp`, `pear.webp`, `honey.webp`, `lemon.webp`, `shelf.webp`, `shop.webp`. Банка варенья, молоко, хлеб и груша используются в ранних заказах; мёд и лимоны появляются в большой задаче. Непрозрачный интерьер — предоставленный пользователем концепт, не новая генерация. Все UI подписи, счётчики, зоны переноса и вывеска рисуются приложением отдельно. Маленькие UI пиктограммы написаны как SVG в `src/icons.ts`; товарные картинки остаются растровыми.

Посадка на игровую полку откалибрована по выемкам текущего `shelf.webp`: центры x≈21,33% / 50% / 78,67%, плоскость основания y=68% полной рамки изображения, включая прозрачные поля. `.shelf-tray` и `.slots` используют одну геометрию; смещение основания вычисляется из фактической высоты нарисованной полки. Номер, запас и значок количества рядов стоят отдельной строкой под мебелью; под неё отведено одинаковое место на всех полках. Наведение и выбор не смещают и не масштабируют спрайт товара. При замене изображения полки перепроверить эти ориентиры по новому рисунку; произвольный bottom относительно игровой ячейки не гарантирует попадания внутрь выемки. Браузерный тест проверяет калибровку на заказах 2, 7 и 10 и после каждого переноса заказа 7.

Звук оригинальный, синтезированный в `src/audio.ts`: эффекты выбора, переноса, отправки, победы, ремонта и тихая петля мелодии. Сторонние музыкальные записи, шрифты и внешние asset CDN не используются. Перед коммерческим выпуском нужен обычный аудит прав на предоставленные материалы и финальный art pass.


## Отдельные ремонтируемые объекты 0.2.0

4 октября 2026 года инструментом image_gen созданы два прозрачных спрайта в том же художественном направлении. Оригиналы: **counter-original.png** (1774 × 887 RGBA) и **garden-original.png** (1536 × 1024 RGBA). Alpha проверен при упаковке; исходников достаточно для повторения упаковки.

Фактически переданные задания:

### Прилавок

```text
Use case: stylized-concept. Asset type: a single transparent 2.5D game sprite for a cozy seaside grocery shop. Create a beautiful restored wide wooden shop counter, frontal view with a slightly visible top surface, warm honey oak wood grain and rich turquoise lower front panels, cream edging, rounded friendly craftsmanship. A small empty wicker order basket on the left end and a vintage brass cash register on the right end. Strong readable silhouettes, dimensional materials, soft sunlight from upper left, contact shadows contained close to the object. Bright warm polished stylized 3D illustration matching a casual goods sorting game, charming tactile wood, not flat vector art. Isolated entire counter including basket and register centered, wide landscape silhouette with generous transparent margin. Actual transparent alpha background. No room, no floor, no scene, no people, no food goods, no UI, no letters, no text, no watermark.
```

### Цветы у окна

```text
Use case: stylized-concept. Asset type: single transparent 2.5D game sprite for a cozy seaside grocery shop. Create a lovely windowsill flower arrangement: a long warm honey oak planter box with rich turquoise trim and three small cream ceramic flower pots resting in it, lush green leaves, coral pink and warm yellow flowers, a tiny warm brass lantern hanging from a short curved arm at the far right. The entire arrangement is a compact horizontal single decoration, front view with a slight view of the top, no actual window frame. Bright polished stylized 3D illustration, expressive tactile wood and ceramics, soft sunny upper-left illumination, charming casual-game coastal palette. Clear silhouette at small game size. Isolated whole object centered with transparent margin. Actual transparent alpha background. No background, no room, no scenery, no floor, no people, no food goods, no lettering, no text, no UI, no watermark.
```

Включённые runtime результаты: public/assets/counter.webp (1400 × 698, 164 654 байт) и public/assets/garden.webp (878 × 600, 151 674 байта). prepare-art.py читает локальные PNG, обрезает пустые отступы, сохраняет alpha и пропорции, уменьшает прилавок до рамки 1400 × 700, цветы до 900 × 600 и пишет WebP quality 90. Ресурсы используются отдельными слоями сцены и предпросмотра; цветовой акцент задаётся CSS. UI и товары не входят в изображение мебели. Оригиналы docs/art и reference в dist не копируются.
