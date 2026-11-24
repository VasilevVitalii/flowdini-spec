# flowdini-spec

Низкоуровневая «карта» flowdini: парсер и сериализатор `.md`-файлов (заголовки 1–3 уровней и Obsidian Inline Fields `[param:: value]`) + сырой доступ к файлам. TypeScript, ESM, npm-пакет. Без процесса/ролей/LLM — объект `fd` поверх этих функций собирает `flowdini-engine`.

## Установка

```sh
npm i flowdini-spec
```

## Использование

```ts
import { FdTaskFile, textToStructure } from 'flowdini-spec';

const files = new FdTaskFile('./specs');
for (const file of await files.list()) {
  const text = await files.read(file);
  const content = textToStructure(text, true);
  // content.preamble    — точный порядок строк преамбулы (text/field-сегменты)
  // content.inlineList  — поля до первого заголовка
  // content.text        — текст преамбулы (до первого заголовка) без полей; null — нет
  // content.itemList    — записи по заголовкам (topic + text)
}
```

## API

### `FdTaskFile` — сырой доступ к файлам

| Метод | Сигнатура | Описание |
|---|---|---|
| `list` | `async list(): Promise<string[]>` | Рекурсивный обход `.md`-файлов (скрытые пропускаются), пути относительно каталога, разделитель `/`, сортировка. |
| `read` | `async read(file): Promise<string>` | Сырое содержимое файла. Путь вне каталога задачи (`..`, абсолютный) отклоняется. |
| `write` | `async write(file, text): Promise<void>` | Запись; создаёт родительские каталоги при необходимости. Путь вне каталога задачи отклоняется. |

Конструктор: `new FdTaskFile(taskDir)`.

### `parser` — текст ↔ структура

| Функция | Сигнатура | Описание |
|---|---|---|
| `textToStructure` | `(text, allowText: boolean): TFdContent` | Парсинг md в структуру. `allowText: false` → `text` везде `null` (тело не накапливается), структура и inline-поля — на месте. |
| `inlineFieldToText` | `(field): string` | `[param:: v1, v2]`. |
| `levelToText` | `(level, headingLevel: 1\|2\|3): string` | Заголовок: `### title 2`. |
| `topicToText` | `(topic): string` | Заголовок самого глубокого заданного уровня; поля `topic` — отдельными строками следом, `body` пропускаются. |
| `itemToText` | `(item): string` | Заголовок + `\n` + тело (если есть); если тело начинается строкой-полем, добавляется пустая строка — round-trip. |
| `contentToText` | `(content): string` | Преамбула (по строке на поле) + элементы через `\n`. |
| `topicHeading` | `(topic): { heading, level } \| null` | Самый глубокий заданный уровень топика (для сборки заголовка). |
| `stripFences` | `(text): string` | Текст без fenced-блоков (``` и ~~~) — что осталось вне них. |
| `HEADING_RE` | `RegExp` | Регэксп ATX-заголовка (0–3 пробела, `#`×1–3) — общая грамматика для потребителей. |
| `openFence` | `(line) => { char, len } \| null` | Открывающий fence (``` или `~~~`) на строке. |
| `isClosingFence` | `(line, char, len) => boolean` | Закрывающий fence той же или большей длины (`{len,}`). |

### `builder` — фабрики пустых структур

`newInlineField(source = 'topic')`, `newLevel()`, `newTopic()`, `newItem()`, `newContent()` — и объект `builder` с теми же функциями (без `this`, безопасны при деструктуризации).

## Типы

```ts
interface TFdLevel {
  title: string;
  idx: number;   // числовой суффикс заголовка (0 — номера нет)
}

interface TFdInlineField {
  param: string;
  valueList: string[];
  source?: 'topic' | 'body';  // опционален только в преамбуле
}

interface TFdTopicField extends TFdInlineField {
  source: 'topic' | 'body';   // в топике source обязателен
}

interface TFdTopic {
  level1: TFdLevel | null;
  level2: TFdLevel | null;
  level3: TFdLevel | null;
  inlineList: TFdTopicField[];
}

interface TFdItem {
  topic: TFdTopic;
  text: string | null;  // тело раздела (сырой текст), null — тела нет
}

type TFdPreambleSegment =
  | { kind: 'text'; text: string }
  | { kind: 'field'; field: TFdInlineField };
type TFdPreambleLine = TFdPreambleSegment[];

interface TFdContent {
  inlineList: TFdInlineField[];  // преамбула: поля до первого заголовка
  itemList: TFdItem[];
  text: string | null;           // преамбула: текст до первого заголовка без полей; без заголовков — весь текст файла; null — нет
  preamble?: TFdPreambleLine[];  // точный порядок строк преамбулы (text/field-сегменты); заполняет парсер, у собранных вручную структур отсутствует
}
```

## Правила парсинга

### Заголовки

- ATX-заголовки уровней 1–3; уровень = числу `#`. Уровни 4+ игнорируются.
- Каждый заголовок создаёт новую запись `itemList`; старший уровень сбрасывает младшие в `null`. Отсутствующие предки — `null`.
- Заголовок разбивается на `title` + `idx`: если последний whitespace-токен — целое число (со знаком `-`), он уходит в `idx`, остаток — в `title`; иначе `idx: 0`, `title` — весь текст.
  - `# question 2` → `{ title: 'question', idx: 2 }`
  - `# question ` → `{ title: 'question', idx: 0 }`
  - `# question -1` → `{ title: 'question', idx: -1 }`
  - `# question - 1` → `{ title: 'question -', idx: 1 }`
- Числом считается только целое в безопасном диапазоне (`Number.isSafeInteger`) без ведущих нулей: `# question 007` → `{ title: 'question 007', idx: 0 }`, `# q 9007199254740993` → `idx: 0` (вне диапазона — остаётся в `title`).
- Строки внутри fenced-блока (` ``` ` или `~~~`) не парсятся.

### Inline Fields

- Формат `[param:: value]`; разделитель — `::`, обе части тримятся. Имя поля не может содержать `:`: сканер читает имя до первого `:`, и дальше обязана идти пара `::` (одиночный `:` в имени поля делает запись не-полем).
- Запятая — разделитель списка значений, но внутри вложенных скобок `[[...]]` не разделяет (балансирующий сканер): `[fd-reply:: [[#A 1]]]`, `[par:: [[#A 1]], x]` → `["[[#A 1]]", "x"]`.
- Одиночный `:` в значении допустим: `[fd-from:: AI:Architect]`.
- Значение может содержать вложенные скобки `[[...]]` (адрес `fd-reply`): `[fd-reply:: [[#PART 2##CHAPTER 3]]]`.
- Пустое значение `[par:: ]` → `valueList: []`; пустой `param` — поле пропускается.
- Несколько полей на одной строке — ок.

### Свойства топика и тело

- После заголовка следующей строкой (а может и не быть) идут одна или несколько **строк свойств топика** — подряд идущих строк, состоящих только из inline-полей (первая пустая строка завершает зону свойств). Они принадлежат топику, а не телу.
- Первая строка с обычным текстом начинает тело; всё, что дальше (включая строки с полями и fenced-блоки) — тело.
- Поле привязывается к последнему открытому заголовку; поля до первого заголовка → верхний `inlineList` (преамбула).
- Преамбула сохраняется с точным порядком text/field-сегментов в `content.preamble` (`TFdPreambleLine[]`, заполняет парсер); `content.text` (текст без полей) и `content.inlineList` (поля) — производные от неё. Отступы вложенных списков сохраняются; CRLF нормализуется в LF. Если заголовков в файле нет, весь текст файла — преамбула.
- Поля помечаются `source`:
  - `'topic'` — на отдельной строке свойств сразу после заголовка;
  - `'body'` — в теле раздела.
  Преамбула — без `source`. Поля на строке заголовка не поддерживаются (стали бы частью `title`).

### Тело раздела (`text`)

- Строки от первой строки с текстом до следующего заголовка — тело; сохраняются в `text` сырыми (как есть, включая строки с inline-полями и fenced-блоки).
- Поля `topic` в `text` не входят — это свойства топика. Поля `body` индексируются в `topic.inlineList` и остаются в `text` (`text` каноничен для обратной сборки).
- Пустое тело (только whitespace) → `text: null`.
- При `allowText: false` тело не накапливается, `text` всегда `null`; поля индексируются как обычно.

## Сериализация

Собирает структуру обратно в md: `contentToText` → `itemToText` → `topicToText` → `levelToText` / `inlineFieldToText`. `text` сериализуется как есть. Поля без `source` (преамбула) идут в преамбулу, поля `source: 'topic'` — отдельными строками после заголовка; поля `source: 'body'` не выводятся (они уже в `text`) — round-trip без дублирования. Если тело начинается строкой, целиком состоящей из inline-полей, перед ним вставляется пустая строка, иначе повторный разбор повысит это поле до свойства топика.

## Пример

Вход:

```md
# chapter 1
## chapter 2
[par1:: val1] [par2:: val1, val2]
### chapter 3
[par1:: val4, val5]
```

Выход (`textToStructure(text, true)`):

```json
{
  "inlineList": [],
  "text": null,
  "itemList": [
    {
      "topic": {
        "level1": { "title": "chapter", "idx": 1 },
        "level2": null,
        "level3": null,
        "inlineList": []
      },
      "text": null
    },
    {
      "topic": {
        "level1": { "title": "chapter", "idx": 1 },
        "level2": { "title": "chapter", "idx": 2 },
        "level3": null,
        "inlineList": [
          { "param": "par1", "valueList": ["val1"], "source": "topic" },
          { "param": "par2", "valueList": ["val1", "val2"], "source": "topic" }
        ]
      },
      "text": null
    },
    {
      "topic": {
        "level1": { "title": "chapter", "idx": 1 },
        "level2": { "title": "chapter", "idx": 2 },
        "level3": { "title": "chapter", "idx": 3 },
        "inlineList": [
          { "param": "par1", "valueList": ["val4", "val5"], "source": "topic" }
        ]
      },
      "text": null
    }
  ]
}
```

## Лицензия

MIT
