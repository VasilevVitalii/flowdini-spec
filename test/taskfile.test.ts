import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FdTaskFile } from '../src/FdTaskFile.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'fdmd-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('FdTaskFile', () => {
  it('list собирает .md рекурсивно, отдаёт отсортированные относительные пути', async () => {
    await writeFile(path.join(root, 'a.md'), '# a');
    await mkdir(path.join(root, 'sub'));
    await writeFile(path.join(root, 'sub', 'b.md'), '# b');
    await writeFile(path.join(root, 'sub', 'not.txt'), 'x');
    await writeFile(path.join(root, '.hidden.md'), '# h');

    const tf = new FdTaskFile(root);
    expect(await tf.list()).toEqual(['a.md', 'sub/b.md']);
  });

  it('read возвращает содержимое файла', async () => {
    await writeFile(path.join(root, 'a.md'), '# chapter 1');
    const tf = new FdTaskFile(root);
    expect(await tf.read('a.md')).toBe('# chapter 1');
  });

  it('write создаёт файл и родительские каталоги', async () => {
    const tf = new FdTaskFile(root);
    await tf.write('sub/deep/b.md', '# b');
    expect(await readFile(path.join(root, 'sub', 'deep', 'b.md'), 'utf8')).toBe('# b');
  });

  it('read вне каталога → ошибка', async () => {
    const tf = new FdTaskFile(root);
    await expect(tf.read('../outside.md')).rejects.toThrow('вне каталога');
  });

  it('write вне каталога → ошибка', async () => {
    const tf = new FdTaskFile(root);
    await expect(tf.write('../outside.md', 'x')).rejects.toThrow('вне каталога');
  });

  it('абсолютный путь вне каталога → ошибка', async () => {
    const tf = new FdTaskFile(root);
    await expect(tf.read('/etc/passwd')).rejects.toThrow('вне каталога');
  });
});
