# flowdini-spec

Парсер `.md`-файлов для flowdini: заголовки первых трёх уровней и Obsidian Inline Fields (`[param:: value]`). TypeScript, ESM, npm-пакет.

## Установка

```sh
npm i flowdini-spec
```

## Использование

```ts
import { FdMd } from 'flowdini-spec';

const fd = new FdMd({ dir: './specs' });
await fd.scan();

for (const file of fd.getFileList()) {
  const schema = await fd.getSchema(file);
  // schema.inlineList  — поля до первого заголовка
  // schema.contentList — записи по заголовкам
}
```

Низкоуровневый парсинг строки: `parseMarkdown(content)` (тот же `TFdSchema`).

## API

| Метод | Сигнатура | Описание |
|---|---|---|
| `scan` | `async scan(): Promise<void>` | Рекурсивно обходит `dir`, формирует список файлов; повторный вызов сбрасывает кэш. |
| `getFileList` | `getFileList(): string[]` | Относительные пути от `dir`, разделитель `/`, лексикографический порядок. |
| `getSchema` | `async getSchema(fileItem): Promise<TFdSchema>` | Схема файла (элемент `getFileList`), кэш по `mtime + size`. |

Конструктор: `new FdMd({ dir, filter? })`, где `filter: { list: string[], action: 'allow' | 'deny' }`.

## Типы

```ts
interface TFdLevel {
  title: string;
  idx: number | null;   // числовой суффикс заголовка
}

interface TFdInlineField {
  param: string;
  valueList: string[];
}

interface TFdContentItem {
  level1: TFdLevel | null;
  level2: TFdLevel | null;
  level3: TFdLevel | null;
  inlineList: TFdInlineField[];
}

interface TFdSchema {
  inlineList: TFdInlineField[];  // преамбула: поля до первого заголовка
  contentList: TFdContentItem[];
}
```

## Правила парсинга

### Заголовки

- ATX-заголовки уровней 1–3; уровень = числу `#`. Уровни 4+ игнорируются.
- Каждый заголовок создаёт новую запись `contentList`; старший уровень сбрасывает младшие в `null`. Отсутствующие предки — `null`.
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
- Пустое значение `[par:: ]` → `valueList: []`; пустой `param` — поле пропускается.
- Несколько полей на одной строке — ок.

### Привязка полей

- Поле привязывается к последнему открытому заголовку.
- Поля до первого заголовка → верхний `inlineList` (преамбула).
- Поле на строке заголовка → в новую запись, из текста заголовка вычищается.

## Фильтр

- Дефолт — все `*.md` рекурсивно (`**/*.md`).
- Матчинг micromatch против относительного пути (разделитель `/`), регистрозависимый: `*` не пересекает `/`, `**` пересекает. `111.md` — только корень, `**/*2.md` — любая глубина.
- `allow` — оставить подходящие; `deny` — исключить подходящие.

## Кэш и ошибки

- Кэш по `mtime + size`; без изменений файл не перечитывается.
- Ошибка чтения/парсинга → пустая схема `{ inlineList: [], contentList: [] }`, кэш для файла сбрасывается.

## Пример

Вход:

```md
# chapter 1
## chapter 2
[par1:: val1] [par2:: val1, val2]
### chapter 3
[par1:: val4, val5]
```

Выход (`getSchema`):

```json
{
  "inlineList": [],
  "contentList": [
    { "level1": { "title": "chapter", "idx": 1 }, "level2": null, "level3": null, "inlineList": [] },
    {
      "level1": { "title": "chapter", "idx": 1 },
      "level2": { "title": "chapter", "idx": 2 },
      "level3": null,
      "inlineList": [
        { "param": "par1", "valueList": ["val1"] },
        { "param": "par2", "valueList": ["val1", "val2"] }
      ]
    },
    {
      "level1": { "title": "chapter", "idx": 1 },
      "level2": { "title": "chapter", "idx": 2 },
      "level3": { "title": "chapter", "idx": 3 },
      "inlineList": [
        { "param": "par1", "valueList": ["val4", "val5"] }
      ]
    }
  ]
}
```

## Лицензия

MIT
