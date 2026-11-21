export interface TFdInlineField {
  param: string;
  valueList: string[];
  /** Откуда поле: на строке заголовка (`heading`) или в теле раздела (`body`). Нужно сериализатору, чтобы не дублировать поля тела (они уже в `text`). Поля без `source` сериализуются в заголовок. */
  source?: 'heading' | 'body';
}

export interface TFdLevel {
  /** Текст заголовка без `idx`. */
  title: string;
  idx: number | null;
}

/** Адресуемый узел: заголовки 1–3 уровней + привязанные inline-поля. Без текста. */
export interface TFdTopic {
  level1: TFdLevel | null;
  level2: TFdLevel | null;
  level3: TFdLevel | null;
  inlineList: TFdInlineField[];
}

/** Элемент контента: узел (topic) + тело раздела. `text: null` — тела нет. */
export interface TFdItem {
  topic: TFdTopic;
  text: string | null;
}

/** Распарсенный контент одного файла: преамбула + элементы. */
export interface TFdContent {
  /** Преамбула: inline-поля до первого заголовка. */
  inlineList: TFdInlineField[];
  itemList: TFdItem[];
}
