export interface TFdInlineField {
  param: string;
  valueList: string[];
}

export interface TFdLevel {
  title: string;
  idx: number | null;
}

export interface TFdContentItem {
  level1: TFdLevel | null;
  level2: TFdLevel | null;
  level3: TFdLevel | null;
  inlineList: TFdInlineField[];
}

export interface TFdSchema {
  /** Преамбула: inline-поля до первого заголовка. */
  inlineList: TFdInlineField[];
  contentList: TFdContentItem[];
}

export interface FdMdFilter {
  list: string[];
  action: 'allow' | 'deny';
}

export interface FdMdParams {
  dir: string;
  filter?: FdMdFilter;
}
