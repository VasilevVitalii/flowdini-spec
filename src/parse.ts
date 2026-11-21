import type {
  TFdContent,
  TFdInlineField,
  TFdItem,
  TFdLevel,
  TFdTopic,
} from './types.js';

/** Inline-поле `[param:: value]`: разделитель — первое `::`, значение без `[`/`]`. */
function fieldRegex(): RegExp {
  return /\[([^\[\]:]+)::([^\[\]]*)\]/g;
}

/** Запятая — разделитель списка, элементы тримятся; запятой в значении быть не может. */
function parseValue(raw: string): string[] {
  const value = raw.trim();
  if (value === '') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function extractFields(text: string): TFdInlineField[] {
  const fields: TFdInlineField[] = [];
  for (const m of text.matchAll(fieldRegex())) {
    const param = m[1].trim();
    if (param === '') continue;
    fields.push({ param, valueList: parseValue(m[2]) });
  }
  return fields;
}

function stripFields(text: string): string {
  return text.replace(fieldRegex(), '').trim();
}

/**
 * Разбор заголовка на title + idx. Если последний whitespace-токен — целое
 * число (со знаком `-`), он становится `idx`, остаток — `title`; иначе
 * `idx: null`, `title` — весь текст.
 */
function parseLevel(text: string): TFdLevel {
  const trimmed = text.trim();
  const m = /^(.*\S)\s+(-?\d+)$/.exec(trimmed);
  if (m) {
    return { title: m[1], idx: Number(m[2]) };
  }
  return { title: trimmed, idx: null };
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
 * `true` — тело сохраняется в `item.text`; `false` — `text` везде `null`
 * (тело не накапливается — когда нужна только структура/навигация).
 * Inline-поля индексируются в `topic.inlineList` в обоих режимах.
 */
export function textToStructure(text: string, allowText: boolean): TFdContent {
  const result: TFdContent = { inlineList: [], itemList: [] };
  const lines = text.split(/\r?\n/);

  let level1: TFdLevel | null = null;
  let level2: TFdLevel | null = null;
  let level3: TFdLevel | null = null;
  let currentItem: TFdItem | null = null;
  let bodyLines: string[] = [];

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
      if (allowText) bodyLines.push(line);
      continue;
    }

    const heading = matchHeading(line);
    if (heading) {
      if (allowText && currentItem) currentItem.text = finishText(bodyLines);
      bodyLines = [];

      const level = parseLevel(stripFields(heading.text));
      const fields = extractFields(heading.text);
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

      const topic: TFdTopic = { level1, level2, level3, inlineList: fields };
      const item: TFdItem = { topic, text: null };
      result.itemList.push(item);
      currentItem = item;
      continue;
    }

    // Обычная строка тела: текст только при allowText; поля индексируются всегда.
    if (allowText) bodyLines.push(line);
    const fields = extractFields(line);
    if (fields.length > 0) {
      if (currentItem) currentItem.topic.inlineList.push(...fields);
      else result.inlineList.push(...fields);
    }
  }

  if (allowText && currentItem) currentItem.text = finishText(bodyLines);

  return result;
}

// ---- Сериализация (структура → текст) ----

export function inlineFieldToText(field: TFdInlineField): string {
  return `[${field.param}:: ${field.valueList.join(', ')}]`;
}

export function levelToText(level: TFdLevel, headingLevel: 1 | 2 | 3): string {
  const hashes = '#'.repeat(headingLevel);
  const idx = level.idx === null ? '' : ` ${level.idx}`;
  return `${hashes} ${level.title}${idx}`;
}

/**
 * Заголовок самого глубокого заданного уровня + inline-поля в ту же строку.
 * Пустой топик (все уровни `null`) → `''`.
 */
export function topicToText(topic: TFdTopic): string {
  const deepest = topic.level3 ?? topic.level2 ?? topic.level1;
  if (!deepest) return '';
  const headingLevel: 1 | 2 | 3 = topic.level3 ? 3 : topic.level2 ? 2 : 1;
  const head = levelToText(deepest, headingLevel);
  const fields = topic.inlineList.map(inlineFieldToText).join(' ');
  return fields ? `${head} ${fields}` : head;
}

export function itemToText(item: TFdItem): string {
  const head = topicToText(item.topic);
  return item.text === null ? head : `${head}\n${item.text}`;
}

/** Преамбула (по строке на поле) + элементы, склеенные через `\n`. */
export function contentToText(content: TFdContent): string {
  const parts: string[] = [];
  for (const field of content.inlineList) parts.push(inlineFieldToText(field));
  for (const item of content.itemList) parts.push(itemToText(item));
  return parts.join('\n');
}
