import type {
  TFdContent,
  TFdInlineField,
  TFdItem,
  TFdLevel,
  TFdTopic,
} from './types.js';

export function newInlineField(): TFdInlineField {
  return { param: '', valueList: [] };
}

export function newLevel(): TFdLevel {
  return { title: '', idx: null };
}

export function newTopic(): TFdTopic {
  return { level1: null, level2: null, level3: null, inlineList: [] };
}

export function newItem(): TFdItem {
  return { topic: newTopic(), text: null };
}

export function newContent(): TFdContent {
  return { inlineList: [], itemList: [] };
}

/** Фабрики пустых структур (без `this` — безопасны при деструктуризации). */
export const builder = {
  newInlineField,
  newLevel,
  newTopic,
  newItem,
  newContent,
};
