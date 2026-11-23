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
      text: null,
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
              { param: 'par1', valueList: ['val1'], source: 'topic' },
              { param: 'par2', valueList: ['val1', 'val2'], source: 'topic' },
            ],
          },
          text: null,
        },
        {
          topic: {
            level1: { title: 'chapter', idx: 1 },
            level2: { title: 'chapter', idx: 2 },
            level3: { title: 'chapter', idx: 3 },
            inlineList: [{ param: 'par1', valueList: ['val4', 'val5'], source: 'topic' }],
          },
          text: null,
        },
      ],
    });
  });

  it('преамбула: поля до первого заголовка', () => {
    const content = '[p:: v]\n# h1';
    expect(textToStructure(content, true)).toEqual({
      inlineList: [{ param: 'p', valueList: ['v'] }],
      text: null,
      itemList: [
        {
          topic: {
            level1: { title: 'h1', idx: 0 },
            level2: null,
            level3: null,
            inlineList: [],
          },
          text: null,
        },
      ],
    });
  });

  it('преамбула-текст до первого заголовка → text', () => {
    const content = 'Вводный текст.\n\n# h1\nbody';
    const res = textToStructure(content, true);
    expect(res.text).toBe('Вводный текст.');
    expect(res.inlineList).toEqual([]);
  });

  it('файл без заголовков → весь текст в text (преамбула)', () => {
    const content = 'Строка один.\n\nСтрока два.';
    const res = textToStructure(content, true);
    expect(res.text).toBe('Строка один.\n\nСтрока два.');
    expect(res.inlineList).toEqual([]);
    expect(res.itemList).toEqual([]);
  });

  it('contentToText round-trip файла без заголовков', () => {
    const src = 'Строка один.\n\nСтрока два.';
    expect(contentToText(textToStructure(src, true))).toBe(src);
  });

  it('преамбула без заголовков сохраняет отступы вложенных списков', () => {
    const src = '- пункт\n   - вложенный пункт';
    expect(textToStructure(src, true).text).toBe(src);
    expect(contentToText(textToStructure(src, true))).toBe(src);
  });

  it('преамбула-текст с полем: текст отдельно, поле в inlineList', () => {
    const content = 'Заголовок проекта.\n[project:: returns]\n# h1';
    const res = textToStructure(content, true);
    expect(res.text).toBe('Заголовок проекта.');
    expect(res.inlineList).toEqual([{ param: 'project', valueList: ['returns'] }]);
  });

  it('contentToText round-trip преамбулы-текста', () => {
    const src = 'Вводный текст.\n[project:: returns]\n# h1\nbody';
    expect(contentToText(textToStructure(src, true))).toBe(src);
  });

  it('contentToText: тело со строкой-полем не сливается со свойствами (round-trip)', () => {
    // Пустая строка между свойствами и телом обязательна: без неё строка-поле в начале
    // тела при повторном разборе стала бы свойством топика (source 'body' → 'topic').
    const src = '# X 1\n[fd-from:: A]\n\n[note:: в теле]\nrest';
    const once = contentToText(textToStructure(src, true));
    expect(once).toBe(src);
    // Идемпотентность: повторный разбор/сериализация структуру не меняет.
    expect(contentToText(textToStructure(once, true))).toBe(once);
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

  it('поле на строке заголовка не парсится — остаётся в title', () => {
    const content = '# chapter 1\n## chapter 2 [par:: val]';
    const res = textToStructure(content, true);
    expect(res.itemList[1]).toEqual({
      topic: {
        level1: { title: 'chapter', idx: 1 },
        level2: { title: 'chapter 2 [par:: val]', idx: 0 },
        level3: null,
        inlineList: [],
      },
      text: null,
    });
  });

  it('текст тела сохраняется в text', () => {
    const content = '# h\nline one\nline two';
    expect(textToStructure(content, true).itemList[0]).toEqual({
      topic: {
        level1: { title: 'h', idx: 0 },
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
      { title: 'b', idx: 0 },
    ]);
    expect(res.itemList[0].text).toBe('#### deep');
  });

  it('CRLF-переносы обрабатываются', () => {
    const content = '# a\r\n## b\r\n[par:: val]';
    const res = textToStructure(content, true);
    expect(res.itemList[1].topic.inlineList).toEqual([
      { param: 'par', valueList: ['val'], source: 'topic' },
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

    it('# question  (пробел в конце) → title "question", idx 0', () => {
      const content = '# question ';
      expect(textToStructure(content, true).itemList[0].topic.level1).toEqual({
        title: 'question',
        idx: 0,
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

    it('без числа → idx 0', () => {
      const content = '# intro';
      expect(textToStructure(content, true).itemList[0].topic.level1).toEqual({
        title: 'intro',
        idx: 0,
      });
    });

    it('закрывающие # нормализуются: ## Q 1 ## → title "Q", idx 1', () => {
      const content = '## Q 1 ##';
      expect(textToStructure(content, true).itemList[0].topic.level2).toEqual({
        title: 'Q',
        idx: 1,
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
      { param: 'par', valueList: ['val'], source: 'topic' },
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
    expect(levelToText({ title: 'chapter', idx: 0 }, 3)).toBe('### chapter');
  });

  it('topicToText: поле без source не выводится (нет места для него)', () => {
    const topic = {
      level1: { title: 'chapter', idx: 1 },
      level2: { title: 'chapter', idx: 2 },
      level3: null,
      inlineList: [{ param: 'par', valueList: ['val'] }],
    };
    expect(topicToText(topic)).toBe('## chapter 2');
  });

  it('topicToText: topic-поля — отдельной строкой после заголовка', () => {
    const topic = {
      level1: null,
      level2: { title: 'Q', idx: 1 },
      level3: null,
      inlineList: [
        { param: 'fd-createdAt', valueList: ['2026-11-14 10:30:00'], source: 'topic' as const },
        { param: 'fd-from', valueList: ['AI.ARCHITECT'], source: 'topic' as const },
      ],
    };
    expect(topicToText(topic)).toBe('## Q 1\n[fd-createdAt:: 2026-11-14 10:30:00]\n[fd-from:: AI.ARCHITECT]');
  });

  it('topicToText: пустой топик → пустая строка', () => {
    expect(topicToText({ level1: null, level2: null, level3: null, inlineList: [] })).toBe('');
  });

  it('itemToText: заголовок + текст через перенос', () => {
    const item = {
      topic: {
        level1: { title: 'h', idx: 0 },
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
        level1: { title: 'h', idx: 0 },
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
            level1: { title: 'h', idx: 0 },
            level2: null,
            level3: null,
            inlineList: [],
          },
          text: 'body',
        },
      ],
      text: null,
    };
    expect(contentToText(content)).toBe('[p:: v]\n# h\nbody');
  });
});

describe('fd-reply и вложенные скобки', () => {
  it('fd-reply на отдельной строке свойств', () => {
    const content = '## Q 1\n[fd-reply:: [[#PART 2##CHAPTER 3]]]';
    const res = textToStructure(content, true);
    expect(res.itemList[0].topic.inlineList).toEqual([
      { param: 'fd-reply', valueList: ['[[#PART 2##CHAPTER 3]]'], source: 'topic' },
    ]);
    expect(res.itemList[0].text).toBeNull();
  });

  it('запятая внутри [[...]] не режет valueList', () => {
    const content = '[fd-reply:: [[#Итоги, часть 1]], [[#Итоги, часть 2]]]';
    const res = textToStructure(content, true);
    expect(res.inlineList).toEqual([
      { param: 'fd-reply', valueList: ['[[#Итоги, часть 1]]', '[[#Итоги, часть 2]]'] },
    ]);
  });
});

describe('краевые случаи полей', () => {
  it('незакрытая [ в значении поля — не поле, текст сохраняется', () => {
    const content = '# h\n[note:: see [broken';
    const res = textToStructure(content, true);
    expect(res.itemList[0].topic.inlineList).toEqual([]);
    expect(res.itemList[0].text).toBe('[note:: see [broken');
  });

  it('поле в inline-коде (`) не парсится', () => {
    const content = '# h\n`[par:: val]`';
    const res = textToStructure(content, true);
    expect(res.itemList[0].topic.inlineList).toEqual([]);
    expect(res.itemList[0].text).toBe('`[par:: val]`');
  });

  it('поле в inline-коде с двойными бэктиками не парсится', () => {
    const content = '# h\n``[par:: val]``';
    const res = textToStructure(content, true);
    expect(res.itemList[0].topic.inlineList).toEqual([]);
    expect(res.itemList[0].text).toBe('``[par:: val]``');
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

  it('topicToText выводит только topic-поля', () => {
    const topic = {
      level1: null,
      level2: { title: 'Q', idx: 1 },
      level3: null,
      inlineList: [
        { param: 'fd-to', valueList: ['HUMAN.ANALYST'], source: 'topic' as const },
        { param: 'fd-created', valueList: ['x'], source: 'body' as const },
      ],
    };
    expect(topicToText(topic)).toBe('## Q 1\n[fd-to:: HUMAN.ANALYST]');
  });
});
