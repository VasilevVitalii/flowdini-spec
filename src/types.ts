export interface TFdInlineField {
  param: string;
  valueList: string[];
  /** Откуда поле: `topic` — отдельная строка свойств сразу после заголовка; `body` — в теле раздела (остаётся в `text`); без `source` — преамбула файла. */
  source?: 'topic' | 'body';
}

export interface TFdLevel {
  /** Текст заголовка без `idx`. */
  title: string;
  /** Числовой суффикс заголовка; `0` — номера нет. */
  idx: number;
}

/** Поле топика: `source` обязателен (`topic` — строка свойств, `body` — поле в теле). */
export interface TFdTopicField extends TFdInlineField {
  source: 'topic' | 'body';
}

/** Адресуемый узел: заголовки 1–3 уровней + привязанные inline-поля. Без текста. */
export interface TFdTopic {
  level1: TFdLevel | null;
  level2: TFdLevel | null;
  level3: TFdLevel | null;
  inlineList: TFdTopicField[];
}

/** Элемент контента: узел (topic) + тело раздела. `text: null` — тела нет. */
export interface TFdItem {
  topic: TFdTopic;
  text: string | null;
}

/** Сегмент преамбулы: кусок текста или inline-поле (в исходном порядке). */
export type TFdPreambleSegment =
  | { kind: 'text'; text: string }
  | { kind: 'field'; field: TFdInlineField };

/** Одна строка преамбулы: чередующиеся text/field-сегменты. */
export type TFdPreambleLine = TFdPreambleSegment[];

/** Распарсенный контент одного файла: преамбула + элементы. */
export interface TFdContent {
  /** Преамбула: inline-поля до первого заголовка. */
  inlineList: TFdInlineField[];
  itemList: TFdItem[];
  /** Текст преамбулы (до первого заголовка) без inline-полей; `null` — текста нет. */
  text: string | null;
  /** Точный порядок преамбулы (строки до первого заголовка; в каждой строке
   *  text/field-сегменты чередуются, как в исходнике).
   *  Заполняет парсер; опционален — структуры, собранные вручную, его не имеют,
   *  и сериализация откатывается на `text` + `inlineList`. */
  preamble?: TFdPreambleLine[];
}
