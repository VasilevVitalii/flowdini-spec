import { describe, expect, it } from 'vitest';
import { builder, newContent, newItem, newLevel, newTopic } from '../src/builder.js';

describe('builder', () => {
  it('newInlineField', () => {
    expect(builder.newInlineField()).toEqual({ param: '', valueList: [] });
  });

  it('newLevel', () => {
    expect(newLevel()).toEqual({ title: '', idx: null });
  });

  it('newTopic — все уровни null', () => {
    expect(newTopic()).toEqual({
      level1: null,
      level2: null,
      level3: null,
      inlineList: [],
    });
  });

  it('newItem — topic + text: null', () => {
    expect(newItem()).toEqual({
      topic: { level1: null, level2: null, level3: null, inlineList: [] },
      text: null,
    });
  });

  it('newContent — пустой', () => {
    expect(newContent()).toEqual({ inlineList: [], itemList: [] });
  });

  it('фабрики не зависят от this (деструктуризация)', () => {
    const { newTopic: makeTopic, newItem: makeItem } = builder;
    expect(makeTopic()).toEqual({
      level1: null,
      level2: null,
      level3: null,
      inlineList: [],
    });
    expect(makeItem().text).toBeNull();
  });
});
