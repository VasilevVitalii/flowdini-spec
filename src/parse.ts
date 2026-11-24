import type {
  TFdContent,
  TFdInlineField,
  TFdItem,
  TFdLevel,
  TFdPreambleLine,
  TFdTopic,
  TFdTopicField,
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
  let codeLen = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '`') {
      // Ран бэктиков — ограничитель inline-code: спан закрывается раном той же
      // длины, поэтому двойные бэктики (``...``) защищают содержимое от разбора.
      let n = 0;
      while (i + n < text.length && text[i + n] === '`') n++;
      if (!inCode) {
        inCode = true;
        codeLen = n;
      } else if (n === codeLen) {
        inCode = false;
      }
      i += n;
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
      // Незакрытая скобка — не поле; хвост уже отсканирован (k дошёл до конца),
      // перескакиваем на k, а не i++ — иначе O(n²) на строке из незакрытых `[`.
      i = k;
      continue;
    }
    fields.push({ param, value: text.slice(j + 2, k - 1), start: i, end: k });
    i = k;
  }
  return fields;
}

function extractTopicFields(text: string, source: 'topic' | 'body'): TFdTopicField[] {
  return scanFields(text).map((f) => ({ param: f.param, valueList: parseValue(f.value), source }));
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

/**
 * Разбить строку преамбулы на чередующиеся text/field-сегменты в исходном
 * порядке. Пустая строка — text-сегмент с пустым текстом (разделитель абзацев
 * сохраняется для точного round-trip; хвостовые срезает `finishPreamble`).
 */
function preambleSegments(line: string): TFdPreambleLine {
  const fields = scanFields(line);
  if (fields.length === 0) {
    // Пустая строка — text-сегмент с пустым текстом (разделитель абзацев,
    // сохраняется для точного round-trip; хвостовые срезает `finishPreamble`).
    return [{ kind: 'text', text: line }];
  }
  const segs: TFdPreambleLine = [];
  let prev = 0;
  for (const f of fields) {
    const textPart = line.slice(prev, f.start);
    if (textPart !== '') segs.push({ kind: 'text', text: textPart });
    segs.push({ kind: 'field', field: { param: f.param, valueList: parseValue(f.value) } });
    prev = f.end;
  }
  const tail = line.slice(prev);
  if (tail !== '') segs.push({ kind: 'text', text: tail });
  return segs;
}

/** Срезать хвостовые пустые строки преамбулы (разделитель перед первым заголовком). */
function finishPreamble(lines: TFdPreambleLine[]): TFdPreambleLine[] {
  const out = [...lines];
  while (out.length > 0) {
    const last = out[out.length - 1];
    const hasContent = last.some((s) => s.kind === 'field' || s.text.trim() !== '');
    if (!hasContent) out.pop();
    else break;
  }
  return out;
}

/** Производный текст преамбулы (text-сегменты, склеенные построчно) — совместимость. */
function preambleText(lines: TFdPreambleLine[]): string | null {
  const textLines: string[] = [];
  for (const line of lines) {
    let t = '';
    let hasField = false;
    for (const s of line) {
      if (s.kind === 'text') t += s.text;
      else hasField = true;
    }
    // Строка целиком из полей не вносит пустую строку в текст.
    if (hasField && t.trim() === '') continue;
    textLines.push(t);
  }
  const text = textLines.join('\n');
  return text.trim() === '' ? null : text.trimEnd();
}

/** Производный список полей преамбулы — совместимость. */
function preambleFields(lines: TFdPreambleLine[]): TFdInlineField[] {
  const fields: TFdInlineField[] = [];
  for (const line of lines) for (const s of line) if (s.kind === 'field') fields.push(s.field);
  return fields;
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
    const digits = m[2];
    const num = Number(digits);
    // Ведущие нули (`007`) и выход за безопасный диапазон — не номер:
    // иначе `[[#X 007]]` рассинхронизируется с каноничным `X 7`.
    if (!/^-?0\d/.test(digits) && Number.isSafeInteger(num)) {
      return { title: m[1], idx: num };
    }
    return { title: trimmed, idx: 0 };
  }
  return { title: trimmed, idx: 0 };
}

export const HEADING_RE = /^ {0,3}(#{1,3})(?:[ \t]+(.*))?$/;

/** Закрывающая последовательность `#` (после пробела) — синтаксис ATX, не текст. */
function stripClosingHashes(text: string): string {
  const m = /^(.*?)[ \t]+#+[ \t]*$/.exec(text);
  return m ? m[1] : text;
}

function matchHeading(line: string): { level: 1 | 2 | 3; text: string } | null {
  const m = HEADING_RE.exec(line);
  if (!m) return null;
  return { level: m[1].length as 1 | 2 | 3, text: stripClosingHashes(m[2] ?? '') };
}

const OPEN_FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

export function openFence(line: string): { char: string; len: number } | null {
  const m = OPEN_FENCE_RE.exec(line);
  if (!m) return null;
  return { char: m[1][0], len: m[1].length };
}

export function isClosingFence(line: string, char: string, len: number): boolean {
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
 *   тела; такие строки состоят только из полей; пустая строка завершает зону
 *   свойств, дальше — тело);
 * - `body` — в теле раздела (строка с обычным текстом или после начала тела).
 *
 * Поля `topic` не входят в `text` — это свойства топика, а не тело. Поля на
 * строке заголовка не поддерживаются (стали бы частью `title`).
 */
export function textToStructure(text: string, allowText: boolean): TFdContent {
  const result: TFdContent = { inlineList: [], itemList: [], text: null, preamble: [] };
  const lines = text.split(/\r?\n/);

  let level1: TFdLevel | null = null;
  let level2: TFdLevel | null = null;
  let level3: TFdLevel | null = null;
  let currentItem: TFdItem | null = null;
  let bodyLines: string[] = [];
  const preambleSegs: TFdPreambleLine[] = [];
  let inTopicProps = false;

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (const line of lines) {
    if (inFence) {
      if (allowText) {
        if (currentItem) bodyLines.push(line);
        else preambleSegs.push([{ kind: 'text', text: line }]);
      }
      if (isClosingFence(line, fenceChar, fenceLen)) inFence = false;
      continue;
    }

    const open = openFence(line);
    if (open) {
      inFence = true;
      fenceChar = open.char;
      fenceLen = open.len;
      inTopicProps = false; // fenced-блок — это тело
      if (allowText) {
        if (currentItem) bodyLines.push(line);
        else preambleSegs.push([{ kind: 'text', text: line }]);
      }
      continue;
    }

    const heading = matchHeading(line);
    if (heading) {
      if (allowText && currentItem) currentItem.text = finishText(bodyLines);
      bodyLines = [];
      if (result.itemList.length === 0) {
        const segs = finishPreamble(preambleSegs);
        if (allowText) {
          result.preamble = segs;
          result.text = preambleText(segs);
        }
        result.inlineList = preambleFields(segs);
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
      if (trimmed === '') {
        inTopicProps = false; // пустая строка завершает зону свойств — дальше тело
        continue;
      }
      if (scanFields(line).length > 0 && stripFields(line) === '') {
        // строка целиком из inline-полей → свойства топика (не тело)
        if (currentItem) currentItem.topic.inlineList.push(...extractTopicFields(line, 'topic'));
        continue;
      }
      inTopicProps = false; // строка содержит текст → начало тела
    }

    if (allowText) {
      if (currentItem) bodyLines.push(line);
      else preambleSegs.push(preambleSegments(line));
    } else if (!currentItem) {
      // allowText=false: текст преамбулы не хранится, но поля нужны для inlineList.
      preambleSegs.push(preambleSegments(line).filter((s) => s.kind === 'field'));
    }
    if (currentItem) {
      currentItem.topic.inlineList.push(...extractTopicFields(line, 'body'));
    }
  }

  if (allowText && currentItem) currentItem.text = finishText(bodyLines);

  // Файл без заголовков: весь текст — преамбула (иначе он теряется, так как
  // `result.text` выше присваивается только на первом заголовке).
  if (result.itemList.length === 0) {
    const segs = finishPreamble(preambleSegs);
    if (allowText) {
      result.preamble = segs;
      result.text = preambleText(segs);
    }
    result.inlineList = preambleFields(segs);
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
 * Самый глубокий заданный уровень топика + его heading-уровень (1|2|3).
 * Пустой топик → `null`. Единая точка для сериализации заголовка —
 * используется и в `topicToText`, и в каноничном форматтере движка.
 */
export function topicHeading(topic: TFdTopic): { heading: TFdLevel; level: 1 | 2 | 3 } | null {
  const heading = topic.level3 ?? topic.level2 ?? topic.level1;
  if (!heading) return null;
  const level: 1 | 2 | 3 = topic.level3 ? 3 : topic.level2 ? 2 : 1;
  return { heading, level };
}

/**
 * Заголовок самого глубокого заданного уровня; поля `topic` — отдельными
 * строками следом, поля `body` пропускаются (они уже в `text`). Пустой
 * топик → `''`.
 */
export function topicToText(topic: TFdTopic): string {
  const th = topicHeading(topic);
  if (th === null) return '';
  const head = levelToText(th.heading, th.level);
  const topicFields = topic.inlineList
    .filter((f) => f.source === 'topic')
    .map(inlineFieldToText);
  return [head, ...topicFields].join('\n');
}

export function itemToText(item: TFdItem): string {
  const head = topicToText(item.topic);
  if (item.text === null) return head;
  // Если тело начинается строкой, целиком состоящей из inline-полей, повторный
  // разбор примет её за свойство топика (`source: 'body'` → `'topic'`). Пустая
  // строка отделяет свойства от тела и сохраняет round-trip. В остальных
  // случаях её не добавляем: `# h1\nbody` без свойств должен переживать
  // round-trip без лишней пустой строки.
  const firstLine = item.text.split('\n')[0];
  const bodyStartsWithField =
    scanFields(firstLine).length > 0 && stripFields(firstLine) === '';
  return bodyStartsWithField ? `${head}\n\n${item.text}` : `${head}\n${item.text}`;
}

/** Преамбула (текст и поля в исходном порядке) + элементы, склеенные через `\n`. */
export function contentToText(content: TFdContent): string {
  const parts: string[] = [];
  const preamble = preambleToText(content);
  if (preamble !== '') parts.push(preamble);
  for (const item of content.itemList) parts.push(itemToText(item));
  return parts.join('\n');
}

/**
 * Преамбула как текст. Если парсер заполнил `preamble` — точный порядок
 * (текст и поля чередуются, как в исходнике). Иначе откат на `text` + `inlineList`
 * (структуры, собранные вручную).
 */
export function preambleToText(content: TFdContent): string {
  if (content.preamble !== undefined) {
    return content.preamble
      .map((line) =>
        line.map((s) => (s.kind === 'text' ? s.text : inlineFieldToText(s.field))).join(''),
      )
      .join('\n');
  }
  const parts: string[] = [];
  if (content.text !== null) parts.push(content.text);
  for (const field of content.inlineList) parts.push(inlineFieldToText(field));
  return parts.join('\n');
}

/**
 * Вырезать fenced-блоки (```...``` или ~~~...~~~), чтобы их содержимое
 * (примеры кода) не участвовало в дальнейшем разборе (например, проверке
 * ссылок). Единая точка — парсер знает формат fence.
 */
export function stripFences(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let fence: { char: string; len: number } | null = null;
  for (const line of lines) {
    if (fence) {
      if (new RegExp(`^ {0,3}${fence.char}{${fence.len},}\\s*$`).test(line)) fence = null;
      continue;
    }
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (m) {
      fence = { char: m[1][0], len: m[1].length };
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}
