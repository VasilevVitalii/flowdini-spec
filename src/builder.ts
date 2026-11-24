import type {
  TFdContent,
  TFdItem,
  TFdLevel,
  TFdTopic,
  TFdTopicField,
} from './types.js';

export function newInlineField(source: 'topic' | 'body' = 'topic'): TFdTopicField {
  return { param: '', valueList: [], source };
}

export function newLevel(): TFdLevel {
  return { title: '', idx: 0 };
}

export function newTopic(): TFdTopic {
  return { level1: null, level2: null, level3: null, inlineList: [] };
}

export function newItem(): TFdItem {
  return { topic: newTopic(), text: null };
}

export function newContent(): TFdContent {
  return { inlineList: [], itemList: [], text: null };
}

/** Фабрики пустых структур (без `this` — безопасны при деструктуризации). */
export const builder = {
  newInlineField,
  newLevel,
  newTopic,
  newItem,
  newContent,
};
