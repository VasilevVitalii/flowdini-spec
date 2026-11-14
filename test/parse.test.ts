import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/parse.js';

describe('parseMarkdown', () => {
  it('базовый пример из спеки', () => {
    const content = [
      '# chapter 1',
      '## chapter 2',
      '[par1:: val1] [par2:: val1, val2]',
      '### chapter 3',
      '[par1:: val4, val5]',
    ].join('\n');

    expect(parseMarkdown(content)).toEqual({
      inlineList: [],
      contentList: [
        {
          level1: { title: 'chapter', idx: 1 },
          level2: null,
          level3: null,
          inlineList: [],
        },
        {
          level1: { title: 'chapter', idx: 1 },
          level2: { title: 'chapter', idx: 2 },
          level3: null,
          inlineList: [
            { param: 'par1', valueList: ['val1'] },
            { param: 'par2', valueList: ['val1', 'val2'] },
          ],
        },
        {
          level1: { title: 'chapter', idx: 1 },
          level2: { title: 'chapter', idx: 2 },
          level3: { title: 'chapter', idx: 3 },
          inlineList: [{ param: 'par1', valueList: ['val4', 'val5'] }],
        },
      ],
    });
  });

  it('преамбула: поля до первого заголовка', () => {
    const content = '[p:: v]\n# h1';
    expect(parseMarkdown(content)).toEqual({
      inlineList: [{ param: 'p', valueList: ['v'] }],
      contentList: [
        {
          level1: { title: 'h1', idx: null },
          level2: null,
          level3: null,
          inlineList: [],
        },
      ],
    });
  });

  it('### без предков → level1/level2 null', () => {
    const content = '### chapter 3';
    expect(parseMarkdown(content).contentList[0]).toEqual({
      level1: null,
      level2: null,
      level3: { title: 'chapter', idx: 3 },
      inlineList: [],
    });
  });

  it('поле на строке заголовка → в новую запись, из текста заголовка вычищается', () => {
    const content = '# chapter 1\n## chapter 2 [par:: val]';
    const schema = parseMarkdown(content);
    expect(schema.contentList[1]).toEqual({
      level1: { title: 'chapter', idx: 1 },
      level2: { title: 'chapter', idx: 2 },
      level3: null,
      inlineList: [{ param: 'par', valueList: ['val'] }],
    });
  });

  it('fenced-блок: заголовки и поля внутри игнорируются', () => {
    const content = [
      '```',
      '# not a heading',
      '[par:: val]',
      '```',
      '## real heading',
    ].join('\n');
    const schema = parseMarkdown(content);
    expect(schema.inlineList).toEqual([]);
    expect(schema.contentList).toEqual([
      {
        level1: null,
        level2: { title: 'real heading', idx: null },
        level3: null,
        inlineList: [],
      },
    ]);
  });

  it('одиночный : в значении не разваливает', () => {
    const content = '[fd-from:: AI:Architect]';
    expect(parseMarkdown(content).inlineList).toEqual([
      { param: 'fd-from', valueList: ['AI:Architect'] },
    ]);
  });

  it('сплит значения по запятой', () => {
    const content = '[par:: val1, val2]';
    expect(parseMarkdown(content).inlineList).toEqual([
      { param: 'par', valueList: ['val1', 'val2'] },
    ]);
  });

  it('уровни 4+ игнорируются', () => {
    const content = '# a\n#### deep\n## b';
    const schema = parseMarkdown(content);
    expect(schema.contentList.map((c) => c.level2)).toEqual([
      null,
      { title: 'b', idx: null },
    ]);
  });

  it('CRLF-переносы обрабатываются', () => {
    const content = '# a\r\n## b\r\n[par:: val]';
    const schema = parseMarkdown(content);
    expect(schema.contentList[1].inlineList).toEqual([
      { param: 'par', valueList: ['val'] },
    ]);
  });

  it('пустое значение → valueList: []', () => {
    const content = '[par:: ]';
    expect(parseMarkdown(content).inlineList).toEqual([
      { param: 'par', valueList: [] },
    ]);
  });

  describe('разбор title + idx', () => {
    it('# question 2 → title "question", idx 2', () => {
      const content = '# question 2';
      expect(parseMarkdown(content).contentList[0].level1).toEqual({
        title: 'question',
        idx: 2,
      });
    });

    it('# question  (пробел в конце) → title "question", idx null', () => {
      const content = '# question ';
      expect(parseMarkdown(content).contentList[0].level1).toEqual({
        title: 'question',
        idx: null,
      });
    });

    it('# question -1 → title "question", idx -1', () => {
      const content = '# question -1';
      expect(parseMarkdown(content).contentList[0].level1).toEqual({
        title: 'question',
        idx: -1,
      });
    });

    it('# question - 1 → title "question -", idx 1', () => {
      const content = '# question - 1';
      expect(parseMarkdown(content).contentList[0].level1).toEqual({
        title: 'question -',
        idx: 1,
      });
    });

    it('без числа → idx null', () => {
      const content = '# intro';
      expect(parseMarkdown(content).contentList[0].level1).toEqual({
        title: 'intro',
        idx: null,
      });
    });
  });
});
