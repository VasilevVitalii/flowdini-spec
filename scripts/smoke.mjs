// Смоук-тест собранного пакета: проверяет, что dist импортируется и работает
// как у потребителя (ESM-импорт из dist/index.js).
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { textToStructure, FdTaskFile, levelToText } from '../dist/index.js';

// textToStructure: title + idx
assert.deepStrictEqual(
  textToStructure('# question 2', true).itemList[0].topic.level1,
  { title: 'question', idx: 2 },
);
assert.deepStrictEqual(
  textToStructure('# question - 1', true).itemList[0].topic.level1,
  { title: 'question -', idx: 1 },
);

// inline fields: запятая — разделитель списка
assert.deepStrictEqual(textToStructure('[par:: a, b]', true).inlineList, [
  { param: 'par', valueList: ['a', 'b'] },
]);

// allowText: false → text всегда null
assert.deepStrictEqual(textToStructure('# h\nbody', false).itemList[0].text, null);

// сериализация: levelToText
assert.deepStrictEqual(levelToText({ title: 'chapter', idx: 2 }, 1), '# chapter 2');

// FdTaskFile: list / read / write
const root = await mkdtemp(path.join(tmpdir(), 'flowdini-smoke-'));
try {
  await writeFile(path.join(root, 'a.md'), '# chapter 1');
  await mkdir(path.join(root, 'sub'));
  await writeFile(path.join(root, 'sub', 'b.md'), '[p:: v]\n## chapter 2');

  const tf = new FdTaskFile(root);
  assert.deepStrictEqual(await tf.list(), ['a.md', 'sub/b.md']);

  const text = await tf.read('sub/b.md');
  const schema = textToStructure(text, true);
  assert.deepStrictEqual(schema.inlineList, [{ param: 'p', valueList: ['v'] }]);
  assert.deepStrictEqual(schema.itemList[0].topic.level2, {
    title: 'chapter',
    idx: 2,
  });

  await tf.write('sub/c.md', '# chapter 3');
  assert.deepStrictEqual(await tf.read('sub/c.md'), '# chapter 3');
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('smoke OK');
