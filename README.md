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
  // content.inlineList  — поля до первого заголовка
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
| `topicToText` | `(topic): string` | Заголовок самого глубокого заданного уровня + inline-поля в ту же строку. |
| `itemToText` | `(item): string` | Заголовок + `\n` + тело (если есть). |
| `contentToText` | `(content): string` | Преамбула (по строке на поле) + элементы через `\n`. |

### `builder` — фабрики пустых структур

`newInlineField()`, `newLevel()`, `newTopic()`, `newItem()`, `newContent()` — и объект `builder` с теми же функциями (без `this`, безопасны при деструктуризации).

## Типы

```ts
interface TFdLevel {
  title: string;
  idx: number | null;   // числовой суффикс заголовка
}

interface TFdInlineField {
  param: string;
  valueList: string[];
  source?: 'heading' | 'body';  // откуда поле: строка заголовка или тело раздела
}

interface TFdTopic {
  level1: TFdLevel | null;
  level2: TFdLevel | null;
  level3: TFdLevel | null;
  inlineList: TFdInlineField[];
}

interface TFdItem {
  topic: TFdTopic;
  text: string | null;  // тело раздела (сырой текст), null — тела нет
}

interface TFdContent {
  inlineList: TFdInlineField[];  // преамбула: поля до первого заголовка
  itemList: TFdItem[];
}
```

## Правила парсинга

### Заголовки

- ATX-заголовки уровней 1–3; уровень = числу `#`. Уровни 4+ игнорируются.
- Каждый заголовок создаёт новую запись `itemList`; старший уровень сбрасывает младшие в `null`. Отсутствующие предки — `null`.
- Заголовок разбивается на `title` + `idx`: если последний whitespace-токен — целое число (со знаком `-`), он уходит в `idx`, остаток — в `title`; иначе `idx: null`, `title` — весь текст.
  - `# question 2` → `{ title: 'question', idx: 2 }`
  - `# question ` → `{ title: 'question', idx: null }`
  - `# question -1` → `{ title: 'question', idx: -1 }`
  - `# question - 1` → `{ title: 'question -', idx: 1 }`
- Строки внутри fenced-блока (` ``` ` или `~~~`) не парсятся.

### Inline Fields

- Формат `[param:: value]`; разделитель — **первое** `::`, обе части тримятся.
- Запятая — разделитель списка значений (запятой в значении быть не может).
- Одиночный `:` в значении допустим: `[fd-from:: AI:Architect]`.
- Значение может содержать вложенные скобки `[[...]]` (адрес `fd-reply`): `[fd-reply:: [[#PART 2##CHAPTER 3]]]`.
- Пустое значение `[par:: ]` → `valueList: []`; пустой `param` — поле пропускается.
- Несколько полей на одной строке — ок.

### Привязка полей

- Поле привязывается к последнему открытому заголовку.
- Поля до первого заголовка → верхний `inlineList` (преамбула).
- Поле на строке заголовка → в новую запись, из текста заголовка вычищается.
- Поля помечаются `source`: `'heading'` — со строки заголовка, `'body'` — из тела; преамбула — без `source`.

### Тело раздела (`text`)

- Строки между заголовком и следующим заголовком — тело раздела; сохраняются в `text` сырыми (как есть, включая строки с inline-полями и fenced-блоки).
- Inline-поля тела дополнительно индексируются в `topic.inlineList` (не вычищаются из `text` — `text` каноничен для обратной сборки).
- Пустое тело (только whitespace) → `text: null`.
- При `allowText: false` тело не накапливается, `text` всегда `null`; поля индексируются как обычно.

## Сериализация

Собирает структуру обратно в md: `contentToText` → `itemToText` → `topicToText` → `levelToText` / `inlineFieldToText`. `text` сериализуется как есть. Поля `source: 'body'` в заголовок не выводятся (они уже в `text`) — round-trip без дублирования; поля `source: 'heading'` и без `source` идут в строку заголовка.

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
          { "param": "par1", "valueList": ["val1"], "source": "body" },
          { "param": "par2", "valueList": ["val1", "val2"], "source": "body" }
        ]
      },
      "text": "[par1:: val1] [par2:: val1, val2]"
    },
    {
      "topic": {
        "level1": { "title": "chapter", "idx": 1 },
        "level2": { "title": "chapter", "idx": 2 },
        "level3": { "title": "chapter", "idx": 3 },
        "inlineList": [
          { "param": "par1", "valueList": ["val4", "val5"], "source": "body" }
        ]
      },
      "text": "[par1:: val4, val5]"
    }
  ]
}
```

## Лицензия

MIT
