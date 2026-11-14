import type {
  TFdContentItem,
  TFdInlineField,
  TFdLevel,
  TFdSchema,
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

interface HeadingMatch {
  level: 1 | 2 | 3;
  text: string;
}

function matchHeading(line: string): HeadingMatch | null {
  const m = HEADING_RE.exec(line);
  if (!m) return null;
  return { level: m[1].length as 1 | 2 | 3, text: m[2] ?? '' };
}

const OPEN_FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

interface FenceOpen {
  char: string;
  len: number;
}

function openFence(line: string): FenceOpen | null {
  const m = OPEN_FENCE_RE.exec(line);
  if (!m) return null;
  return { char: m[1][0], len: m[1].length };
}

function isClosingFence(line: string, char: string, len: number): boolean {
  const re = new RegExp(`^ {0,3}${char}{${len},}\\s*$`);
  return re.test(line);
}

export function parseMarkdown(content: string): TFdSchema {
  const schema: TFdSchema = { inlineList: [], contentList: [] };
  const lines = content.split(/\r?\n/);

  let level1: TFdLevel | null = null;
  let level2: TFdLevel | null = null;
  let level3: TFdLevel | null = null;
  let currentInline: TFdInlineField[] = schema.inlineList;

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  // Fenced-блок: заголовки и inline-поля внутри — литерал, не парсятся.
  for (const line of lines) {
    if (inFence) {
      if (isClosingFence(line, fenceChar, fenceLen)) inFence = false;
      continue;
    }

    const open = openFence(line);
    if (open) {
      inFence = true;
      fenceChar = open.char;
      fenceLen = open.len;
      continue;
    }

    const heading = matchHeading(line);
    if (heading) {
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
      const item: TFdContentItem = { level1, level2, level3, inlineList: fields };
      schema.contentList.push(item);
      currentInline = item.inlineList;
      continue;
    }

    const fields = extractFields(line);
    if (fields.length > 0) {
      currentInline.push(...fields);
    }
  }

  return schema;
}
