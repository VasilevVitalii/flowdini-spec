export interface TFdInlineField {
  param: string;
  valueList: string[];
}

export interface TFdLevel {
  title: string;
  idx: number | null;
}

/** Адресуемый узел: заголовки (1–3 уровня) + привязанные inline-поля. Без текста. */
export interface TFdContentTopic {
  level1: TFdLevel | null;
  level2: TFdLevel | null;
  level3: TFdLevel | null;
  inlineList: TFdInlineField[];
}

/** Элемент контента: узел (topic) + необязательное тело раздела. */
export interface TFdContentItem {
  topic: TFdContentTopic;
  text?: string;
}

export interface TFdContent {
  /** Преамбула: inline-поля до первого заголовка. */
  inlineList: TFdInlineField[];
  itemList: TFdContentItem[];
}

export interface FdMdFilter {
  list: string[];
  action: 'allow' | 'deny';
}

export interface FdMdParams {
  dir: string;
  filter?: FdMdFilter;
}
