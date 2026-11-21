// Смоук-тест собранного пакета: проверяет, что dist импортируется и работает
// как у потребителя (ESM-импорт из dist/index.js).
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { parseMarkdown, FdMd } from '../dist/index.js';

// parseMarkdown: title + idx
assert.deepStrictEqual(
  parseMarkdown('# question 2').itemList[0].topic.level1,
  { title: 'question', idx: 2 },
);
assert.deepStrictEqual(
  parseMarkdown('# question - 1').itemList[0].topic.level1,
  { title: 'question -', idx: 1 },
);

// inline fields: запятая — разделитель списка
assert.deepStrictEqual(parseMarkdown('[par:: a, b]').inlineList, [
  { param: 'par', valueList: ['a', 'b'] },
]);

// FdMd: scan / getFileList / getContent
const root = await mkdtemp(path.join(tmpdir(), 'flowdini-smoke-'));
try {
  await writeFile(path.join(root, 'a.md'), '# chapter 1');
  await mkdir(path.join(root, 'sub'));
  await writeFile(path.join(root, 'sub', 'b.md'), '[p:: v]\n## chapter 2');

  const fd = new FdMd({ dir: root });
  await fd.scan();
  assert.deepStrictEqual(fd.getFileList(), ['a.md', 'sub/b.md']);

  const schema = await fd.getContent('sub/b.md');
  assert.deepStrictEqual(schema.inlineList, [{ param: 'p', valueList: ['v'] }]);
  assert.deepStrictEqual(schema.itemList[0].topic.level2, {
    title: 'chapter',
    idx: 2,
  });
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('smoke OK');
