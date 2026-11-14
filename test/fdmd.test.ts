import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FdMd } from '../src/FdMd.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'fdmd-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('FdMd', () => {
  it('scan собирает .md рекурсивно, getFileList отдаёт относительные пути', async () => {
    await writeFile(path.join(root, 'a.md'), '# a');
    await mkdir(path.join(root, 'sub'));
    await writeFile(path.join(root, 'sub', 'b.md'), '# b');
    await writeFile(path.join(root, 'sub', 'not.txt'), 'x');
    await writeFile(path.join(root, '.hidden.md'), '# h');

    const fd = new FdMd({ dir: root });
    await fd.scan();
    expect(fd.getFileList()).toEqual(['a.md', 'sub/b.md']);
  });

  it('getSchema возвращает схему файла', async () => {
    await writeFile(path.join(root, 'a.md'), '# chapter 1\n## chapter 2');
    const fd = new FdMd({ dir: root });
    await fd.scan();
    const schema = await fd.getSchema('a.md');
    expect(schema.contentList).toHaveLength(2);
    expect(schema.contentList[1].level2).toEqual({ title: 'chapter', idx: 2 });
  });

  it('кэш: без изменений не перечитывает, после изменения — перечитывает', async () => {
    const file = path.join(root, 'a.md');
    await writeFile(file, '# v1');
    const fd = new FdMd({ dir: root });
    await fd.scan();

    const s1 = await fd.getSchema('a.md');
    const s2 = await fd.getSchema('a.md');
    expect(s2).toBe(s1); // тот же закэшированный объект

    await writeFile(file, '# v1\n## v2');
    const s3 = await fd.getSchema('a.md');
    expect(s3).not.toBe(s1);
    expect(s3.contentList).toHaveLength(2);
  });

  it('повторный scan сбрасывает кэш', async () => {
    const file = path.join(root, 'a.md');
    await writeFile(file, '# v1');
    const fd = new FdMd({ dir: root });
    await fd.scan();
    const s1 = await fd.getSchema('a.md');

    await fd.scan();
    const s2 = await fd.getSchema('a.md');
    expect(s2).not.toBe(s1);
  });

  it('удалённый файл → пустая схема', async () => {
    const file = path.join(root, 'a.md');
    await writeFile(file, '# v1');
    const fd = new FdMd({ dir: root });
    await fd.scan();
    await rm(file);

    const schema = await fd.getSchema('a.md');
    expect(schema).toEqual({ inlineList: [], contentList: [] });
  });

  it('фильтр deny: 111.md и *2.md в корне исключаются, в подпапках — нет', async () => {
    await writeFile(path.join(root, '111.md'), '# 111');
    await writeFile(path.join(root, 'xx2.md'), '# xx2');
    await writeFile(path.join(root, 'keep.md'), '# keep');
    await mkdir(path.join(root, 'sub'));
    await writeFile(path.join(root, 'sub', '111.md'), '# sub111');
    await writeFile(path.join(root, 'sub', 'yy2.md'), '# subyy2');

    const fd = new FdMd({
      dir: root,
      filter: { list: ['111.md', '*2.md'], action: 'deny' },
    });
    await fd.scan();
    expect(fd.getFileList()).toEqual(['keep.md', 'sub/111.md', 'sub/yy2.md']);
  });

  it('фильтр allow: оставляет только подходящие', async () => {
    await writeFile(path.join(root, 'keep.md'), '# k');
    await writeFile(path.join(root, 'skip.md'), '# s');
    await mkdir(path.join(root, 'sub'));
    await writeFile(path.join(root, 'sub', 'keep.md'), '# k2');

    const fd = new FdMd({
      dir: root,
      filter: { list: ['**/*.md'], action: 'allow' },
    });
    await fd.scan();
    expect(fd.getFileList()).toEqual(['keep.md', 'skip.md', 'sub/keep.md']);
  });
});
