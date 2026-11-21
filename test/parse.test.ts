import { describe, expect, it } from 'vitest';
import {
  contentToText,
  inlineFieldToText,
  itemToText,
  levelToText,
  textToStructure,
  topicToText,
} from '../src/parse.js';

describe('textToStructure (allowText: true)', () => {
  it('базовый пример из спеки', () => {
    const content = [
      '# chapter 1',
      '## chapter 2',
      '[par1:: val1] [par2:: val1, val2]',
      '### chapter 3',
      '[par1:: val4, val5]',
    ].join('\n');

    expect(textToStructure(content, true)).toEqual({
      inlineList: [],
      itemList: [
        {
          topic: {
            level1: { title: 'chapter', idx: 1 },
            level2: null,
            level3: null,
            inlineList: [],
          },
          text: null,
        },
        {
          topic: {
            level1: { title: 'chapter', idx: 1 },
            level2: { title: 'chapter', idx: 2 },
            level3: null,
            inlineList: [
              { param: 'par1', valueList: ['val1'], source: 'body' },
              { param: 'par2', valueList: ['val1', 'val2'], source: 'body' },
            ],
          },
          text: '[par1:: val1] [par2:: val1, val2]',
        },
        {
          topic: {
            level1: { title: 'chapter', idx: 1 },
            level2: { title: 'chapter', idx: 2 },
            level3: { title: 'chapter', idx: 3 },
            inlineList: [{ param: 'par1', valueList: ['val4', 'val5'], source: 'body' }],
          },
          text: '[par1:: val4, val5]',
        },
      ],
    });
  });

  it('преамбула: поля до первого заголовка', () => {
    const content = '[p:: v]\n# h1';
    expect(textToStructure(content, true)).toEqual({
      inlineList: [{ param: 'p', valueList: ['v'] }],
      itemList: [
        {
          topic: {
            level1: { title: 'h1', idx: null },
            level2: null,
            level3: null,
            inlineList: [],
          },
          text: null,
        },
      ],
    });
  });

  it('### без предков → level1/level2 null', () => {
    const content = '### chapter 3';
    expect(textToStructure(content, true).itemList[0]).toEqual({
      topic: {
        level1: null,
        level2: null,
        level3: { title: 'chapter', idx: 3 },
        inlineList: [],
      },
      text: null,
    });
  });

  it('поле на строке заголовка → в topic, из текста заголовка вычищается', () => {
    const content = '# chapter 1\n## chapter 2 [par:: val]';
    const res = textToStructure(content, true);
    expect(res.itemList[1]).toEqual({
      topic: {
        level1: { title: 'chapter', idx: 1 },
        level2: { title: 'chapter', idx: 2 },
        level3: null,
        inlineList: [{ param: 'par', valueList: ['val'], source: 'heading' }],
      },
      text: null,
    });
  });

  it('текст тела сохраняется в text', () => {
    const content = '# h\nline one\nline two';
    expect(textToStructure(content, true).itemList[0]).toEqual({
      topic: {
        level1: { title: 'h', idx: null },
        level2: null,
        level3: null,
        inlineList: [],
      },
      text: 'line one\nline two',
    });
  });

  it('пустое тело → text: null', () => {
    const content = '# h\n\n## next';
    expect(textToStructure(content, true).itemList[0].text).toBeNull();
  });

  it('fenced-блок: заголовки и поля внутри не парсятся, но идут в text', () => {
    const content = [
      '# h',
      '```',
      '# not a heading',
      '[par:: val]',
      '```',
      'tail',
    ].join('\n');
    const res = textToStructure(content, true);
    expect(res.inlineList).toEqual([]);
    expect(res.itemList[0].topic.inlineList).toEqual([]);
    expect(res.itemList[0].text).toBe('```\n# not a heading\n[par:: val]\n```\ntail');
  });

  it('одиночный : в значении не разваливает', () => {
    const content = '[fd-from:: AI:Architect]';
    expect(textToStructure(content, true).inlineList).toEqual([
      { param: 'fd-from', valueList: ['AI:Architect'] },
    ]);
  });

  it('сплит значения по запятой', () => {
    const content = '[par:: val1, val2]';
    expect(textToStructure(content, true).inlineList).toEqual([
      { param: 'par', valueList: ['val1', 'val2'] },
    ]);
  });

  it('уровни 4+ не создают раздел, строка уходит в text предыдущего', () => {
    const content = '# a\n#### deep\n## b';
    const res = textToStructure(content, true);
    expect(res.itemList.map((c) => c.topic.level2)).toEqual([
      null,
      { title: 'b', idx: null },
    ]);
    expect(res.itemList[0].text).toBe('#### deep');
  });

  it('CRLF-переносы обрабатываются', () => {
    const content = '# a\r\n## b\r\n[par:: val]';
    const res = textToStructure(content, true);
    expect(res.itemList[1].topic.inlineList).toEqual([
      { param: 'par', valueList: ['val'], source: 'body' },
    ]);
  });

  it('пустое значение → valueList: []', () => {
    const content = '[par:: ]';
    expect(textToStructure(content, true).inlineList).toEqual([
      { param: 'par', valueList: [] },
    ]);
  });

  describe('разбор title + idx', () => {
    it('# question 2 → title "question", idx 2', () => {
      const content = '# question 2';
      expect(textToStructure(content, true).itemList[0].topic.level1).toEqual({
        title: 'question',
        idx: 2,
      });
    });

    it('# question  (пробел в конце) → title "question", idx null', () => {
      const content = '# question ';
      expect(textToStructure(content, true).itemList[0].topic.level1).toEqual({
        title: 'question',
        idx: null,
      });
    });

    it('# question -1 → title "question", idx -1', () => {
      const content = '# question -1';
      expect(textToStructure(content, true).itemList[0].topic.level1).toEqual({
        title: 'question',
        idx: -1,
      });
    });

    it('# question - 1 → title "question -", idx 1', () => {
      const content = '# question - 1';
      expect(textToStructure(content, true).itemList[0].topic.level1).toEqual({
        title: 'question -',
        idx: 1,
      });
    });

    it('без числа → idx null', () => {
      const content = '# intro';
      expect(textToStructure(content, true).itemList[0].topic.level1).toEqual({
        title: 'intro',
        idx: null,
      });
    });
  });
});

describe('textToStructure (allowText: false)', () => {
  it('text везде null, но структура и inline-поля на месте', () => {
    const content = '# h\n[par:: val]\nbody line\n## h2';
    const res = textToStructure(content, false);
    expect(res.itemList).toHaveLength(2);
    expect(res.itemList[0].text).toBeNull();
    expect(res.itemList[0].topic.inlineList).toEqual([
      { param: 'par', valueList: ['val'], source: 'body' },
    ]);
    expect(res.itemList[1].text).toBeNull();
  });

  it('преамбула индексируется и без текста', () => {
    const content = '[p:: v]\n# h';
    const res = textToStructure(content, false);
    expect(res.inlineList).toEqual([{ param: 'p', valueList: ['v'] }]);
    expect(res.itemList[0].text).toBeNull();
  });
});

describe('сериализация', () => {
  it('inlineFieldToText', () => {
    expect(inlineFieldToText({ param: 'par', valueList: ['a', 'b'] })).toBe(
      '[par:: a, b]',
    );
  });

  it('levelToText: idx в конец', () => {
    expect(levelToText({ title: 'chapter', idx: 2 }, 1)).toBe('# chapter 2');
  });

  it('levelToText: без idx', () => {
    expect(levelToText({ title: 'chapter', idx: null }, 3)).toBe('### chapter');
  });

  it('topicToText: самый глубокий уровень + поля в ту же строку', () => {
    const topic = {
      level1: { title: 'chapter', idx: 1 },
      level2: { title: 'chapter', idx: 2 },
      level3: null,
      inlineList: [{ param: 'par', valueList: ['val'] }],
    };
    expect(topicToText(topic)).toBe('## chapter 2 [par:: val]');
  });

  it('topicToText: пустой топик → пустая строка', () => {
    expect(topicToText({ level1: null, level2: null, level3: null, inlineList: [] })).toBe('');
  });

  it('itemToText: заголовок + текст через перенос', () => {
    const item = {
      topic: {
        level1: { title: 'h', idx: null },
        level2: null,
        level3: null,
        inlineList: [],
      },
      text: 'line one\nline two',
    };
    expect(itemToText(item)).toBe('# h\nline one\nline two');
  });

  it('itemToText: без текста — только заголовок', () => {
    const item = {
      topic: {
        level1: { title: 'h', idx: null },
        level2: null,
        level3: null,
        inlineList: [],
      },
      text: null,
    };
    expect(itemToText(item)).toBe('# h');
  });

  it('contentToText: преамбула + элементы', () => {
    const content = {
      inlineList: [{ param: 'p', valueList: ['v'] }],
      itemList: [
        {
          topic: {
            level1: { title: 'h', idx: null },
            level2: null,
            level3: null,
            inlineList: [],
          },
          text: 'body',
        },
      ],
    };
    expect(contentToText(content)).toBe('[p:: v]\n# h\nbody');
  });
});

describe('fd-reply и вложенные скобки', () => {
  it('адрес [[...]] в значении на строке заголовка парсится целиком', () => {
    const content = '## Q 1 [fd-reply:: [[#PART 2##CHAPTER 3]]]';
    const res = textToStructure(content, true);
    expect(res.itemList[0].topic.inlineList).toEqual([
      { param: 'fd-reply', valueList: ['[[#PART 2##CHAPTER 3]]'], source: 'heading' },
    ]);
  });

  it('fd-reply в теле раздела', () => {
    const content = '## Q 1\n[fd-reply:: [[#PART 2##CHAPTER 3]]]';
    const res = textToStructure(content, true);
    expect(res.itemList[0].topic.inlineList).toEqual([
      { param: 'fd-reply', valueList: ['[[#PART 2##CHAPTER 3]]'], source: 'body' },
    ]);
  });
});

describe('round-trip без дублирования полей', () => {
  it('поля тела остаются в text и не поднимаются в заголовок', () => {
    const src = [
      '## Q 1 [fd-from:: AI.ARCHITECT] [fd-to:: HUMAN.ANALYST]',
      '[fd-created:: 2026-11-14T10:30]',
      'Как бизнес-процесс обрабатывает возвраты?',
    ].join('\n');
    const content = textToStructure(src, true);
    expect(contentToText(content)).toBe(src);
  });

  it('topicToText не выводит body-поля', () => {
    const topic = {
      level1: null,
      level2: { title: 'Q', idx: 1 },
      level3: null,
      inlineList: [
        { param: 'fd-to', valueList: ['HUMAN.ANALYST'], source: 'heading' as const },
        { param: 'fd-created', valueList: ['x'], source: 'body' as const },
      ],
    };
    expect(topicToText(topic)).toBe('## Q 1 [fd-to:: HUMAN.ANALYST]');
  });
});
