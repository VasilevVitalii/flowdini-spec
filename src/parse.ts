import type {
  TFdContent,
  TFdInlineField,
  TFdItem,
  TFdLevel,
  TFdTopic,
} from './types.js';

/**
 * Запятая — разделитель списка (элементы тримятся). Запятая внутри `[[...]]`
 * (адрес `fd-reply`) разделителем не считается.
 */
function parseValue(raw: string): string[] {
  const value = raw.trim();
  if (value === '') return [];
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '[') depth++;
    else if (c === ']') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter((s) => s !== '');
}

interface RawField {
  param: string;
  value: string;
  start: number;
  end: number; // индекс за закрывающей ']'
}

/**
 * Сканер inline-полей `[param:: value]`. Значение может содержать вложенные
 * скобки `[[...]]` (адрес `fd-reply`): значение заканчивается на `]`,
 * балансирующей все открытые `[` внутри.
 */
function scanFields(text: string): RawField[] {
  const fields: RawField[] = [];
  let i = 0;
  let inCode = false;
  while (i < text.length) {
    const c = text[i];
    if (c === '`') {
      inCode = !inCode;
      i++;
      continue;
    }
    if (inCode) {
      i++;
      continue;
    }
    if (c !== '[') {
      i++;
      continue;
    }
    let j = i + 1;
    const paramStart = j;
    while (j < text.length && text[j] !== ':' && text[j] !== ']' && text[j] !== '[') {
      j++;
    }
    if (j >= text.length || text[j] !== ':' || text[j + 1] !== ':') {
      i++;
      continue;
    }
    const param = text.slice(paramStart, j).trim();
    if (param === '') {
      i = j + 2;
      continue;
    }
    let k = j + 2;
    let depth = 1;
    while (k < text.length && depth > 0) {
      if (text[k] === '[') depth++;
      else if (text[k] === ']') depth--;
      k++;
    }
    if (depth > 0) {
      // Незакрытая скобка — не поле, пропускаем этот '['.
      i++;
      continue;
    }
    fields.push({ param, value: text.slice(j + 2, k - 1), start: i, end: k });
    i = k;
  }
  return fields;
}

function extractFields(text: string, source?: 'topic' | 'body'): TFdInlineField[] {
  const out: TFdInlineField[] = [];
  for (const f of scanFields(text)) {
    const field: TFdInlineField = { param: f.param, valueList: parseValue(f.value) };
    if (source) field.source = source;
    out.push(field);
  }
  return out;
}

function stripFields(text: string): string {
  const fields = scanFields(text);
  if (fields.length === 0) return text.trim();
  let out = '';
  let prev = 0;
  for (const f of fields) {
    out += text.slice(prev, f.start);
    prev = f.end;
  }
  return (out + text.slice(prev)).trim();
}

/** Убрать inline-поля из строки, сохранив пробелы/отступы (для преамбулы). */
function stripFieldsKeepWhitespace(text: string): string {
  const fields = scanFields(text);
  if (fields.length === 0) return text;
  let out = '';
  let prev = 0;
  for (const f of fields) {
    out += text.slice(prev, f.start);
    prev = f.end;
  }
  return out + text.slice(prev);
}

/**
 * Разбор заголовка на title + idx. Если последний whitespace-токен — целое
 * число (со знаком `-`), он становится `idx`, остаток — `title`; иначе
 * `idx: 0`, `title` — весь текст.
 */
function parseLevel(text: string): TFdLevel {
  const trimmed = text.trim();
  const m = /^(.*\S)\s+(-?\d+)$/.exec(trimmed);
  if (m) {
    return { title: m[1], idx: Number(m[2]) };
  }
  return { title: trimmed, idx: 0 };
}

const HEADING_RE = /^ {0,3}(#{1,3})(?:[ \t]+(.*))?$/;

function matchHeading(line: string): { level: 1 | 2 | 3; text: string } | null {
  const m = HEADING_RE.exec(line);
  if (!m) return null;
  return { level: m[1].length as 1 | 2 | 3, text: m[2] ?? '' };
}

const OPEN_FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

function openFence(line: string): { char: string; len: number } | null {
  const m = OPEN_FENCE_RE.exec(line);
  if (!m) return null;
  return { char: m[1][0], len: m[1].length };
}

function isClosingFence(line: string, char: string, len: number): boolean {
  const re = new RegExp(`^ {0,3}${char}{${len},}\\s*$`);
  return re.test(line);
}

/** Пустое тело (только whitespace) → `null`. */
function finishText(bodyLines: string[]): string | null {
  const text = bodyLines.join('\n');
  return text.trim() === '' ? null : text;
}

/**
 * Парсинг md в структуру. `allowText` управляет телом разделов:
 * `true` — тело сохраняется в `item.text`; `false` — `text` везде `null`.
 *
 * Inline-поля индексируются в `topic.inlineList` в обоих режимах и помечаются
 * `source` по месту:
 * - `topic` — на отдельной строке свойств сразу после заголовка (до начала
 *   тела; такие строки состоят только из полей, пустые строки допускаются);
 * - `body` — в теле раздела (строка с обычным текстом или после начала тела).
 *
 * Поля `topic` не входят в `text` — это свойства топика, а не тело. Поля на
 * строке заголовка не поддерживаются (стали бы частью `title`).
 */
export function textToStructure(text: string, allowText: boolean): TFdContent {
  const result: TFdContent = { inlineList: [], itemList: [], text: null };
  const lines = text.split(/\r?\n/);

  let level1: TFdLevel | null = null;
  let level2: TFdLevel | null = null;
  let level3: TFdLevel | null = null;
  let currentItem: TFdItem | null = null;
  let bodyLines: string[] = [];
  let preambleLines: string[] = [];
  let inTopicProps = false;

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (const line of lines) {
    if (inFence) {
      if (allowText) bodyLines.push(line);
      if (isClosingFence(line, fenceChar, fenceLen)) inFence = false;
      continue;
    }

    const open = openFence(line);
    if (open) {
      inFence = true;
      fenceChar = open.char;
      fenceLen = open.len;
      inTopicProps = false; // fenced-блок — это тело
      if (allowText) bodyLines.push(line);
      continue;
    }

    const heading = matchHeading(line);
    if (heading) {
      if (allowText && currentItem) currentItem.text = finishText(bodyLines);
      bodyLines = [];
      if (allowText && result.itemList.length === 0) {
        const preamble = finishText(preambleLines);
        result.text = preamble === null ? null : preamble.trimEnd();
      }

      const level = parseLevel(heading.text);
      if (heading.level === 1) {
        level1 = level;
        level2 = null;
        level3 = null;
      } else if (heading.level === 2) {
        level2 = level;
        level3 = null;
      } else {
        level3 = level;
      }

      const topic: TFdTopic = { level1, level2, level3, inlineList: [] };
      const item: TFdItem = { topic, text: null };
      result.itemList.push(item);
      currentItem = item;
      inTopicProps = true;
      continue;
    }

    // Обычная строка.
    const trimmed = line.trim();
    if (inTopicProps) {
      if (trimmed === '') continue; // пустая строка в зоне свойств — разделитель
      if (scanFields(line).length > 0 && stripFields(line) === '') {
        // строка целиком из inline-полей → свойства топика (не тело)
        if (currentItem) currentItem.topic.inlineList.push(...extractFields(line, 'topic'));
        continue;
      }
      inTopicProps = false; // строка содержит текст → начало тела
    }

    if (allowText) {
      if (currentItem) bodyLines.push(line);
      else preambleLines.push(stripFieldsKeepWhitespace(line));
    }
    const fields = currentItem ? extractFields(line, 'body') : extractFields(line);
    if (fields.length > 0) {
      if (currentItem) currentItem.topic.inlineList.push(...fields);
      else result.inlineList.push(...fields);
    }
  }

  if (allowText && currentItem) currentItem.text = finishText(bodyLines);

  // Файл без заголовков: весь текст — преамбула (иначе он теряется, так как
  // `result.text` выше присваивается только на первом заголовке).
  if (allowText && result.itemList.length === 0) {
    const preamble = finishText(preambleLines);
    result.text = preamble === null ? null : preamble.trimEnd();
  }

  return result;
}

// ---- Сериализация (структура → текст) ----

export function inlineFieldToText(field: TFdInlineField): string {
  return `[${field.param}:: ${field.valueList.join(', ')}]`;
}

export function levelToText(level: TFdLevel, headingLevel: 1 | 2 | 3): string {
  const hashes = '#'.repeat(headingLevel);
  const idx = level.idx === 0 ? '' : ` ${level.idx}`;
  return `${hashes} ${level.title}${idx}`;
}

/**
 * Заголовок самого глубокого заданного уровня; поля `topic` — отдельными
 * строками следом, поля `body` пропускаются (они уже в `text`). Пустой
 * топик → `''`.
 */
export function topicToText(topic: TFdTopic): string {
  const deepest = topic.level3 ?? topic.level2 ?? topic.level1;
  if (!deepest) return '';
  const headingLevel: 1 | 2 | 3 = topic.level3 ? 3 : topic.level2 ? 2 : 1;
  const head = levelToText(deepest, headingLevel);
  const topicFields = topic.inlineList
    .filter((f) => f.source === 'topic')
    .map(inlineFieldToText);
  return [head, ...topicFields].join('\n');
}

export function itemToText(item: TFdItem): string {
  const head = topicToText(item.topic);
  return item.text === null ? head : `${head}\n${item.text}`;
}

/** Преамбула (текст, затем поля по строке на поле) + элементы, склеенные через `\n`. */
export function contentToText(content: TFdContent): string {
  const parts: string[] = [];
  if (content.text !== null) parts.push(content.text);
  for (const field of content.inlineList) parts.push(inlineFieldToText(field));
  for (const item of content.itemList) parts.push(itemToText(item));
  return parts.join('\n');
}
