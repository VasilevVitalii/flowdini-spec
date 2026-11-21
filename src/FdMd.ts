import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import * as path from 'node:path';
import micromatch from 'micromatch';
import { parseMarkdown } from './parse.js';
import type { FdMdFilter, FdMdParams, TFdContent } from './types.js';

interface CacheEntry {
  mtimeMs: number;
  size: number;
  content: TFdContent;
}

function emptyContent(): TFdContent {
  return { inlineList: [], itemList: [] };
}

export class FdMd {
  private readonly dir: string;
  private readonly filter?: FdMdFilter;
  private fileList: string[] = [];
  private readonly cache = new Map<string, CacheEntry>();

  constructor(params: FdMdParams) {
    this.dir = path.resolve(params.dir);
    this.filter = params.filter;
  }

  async scan(): Promise<void> {
    const absFiles = await this.walk(this.dir);
    const relFiles = absFiles
      .map((f) => path.relative(this.dir, f).split(path.sep).join('/'))
      .sort();
    this.fileList = this.applyFilter(relFiles);
    this.cache.clear();
  }

  getFileList(): string[] {
    return [...this.fileList];
  }

  /** Кэш по `mtime + size`; ошибка чтения → пустой контент, кэш файла сбрасывается. */
  async getContent(fileItem: string): Promise<TFdContent> {
    const fullPath = path.resolve(this.dir, fileItem);

    let mtimeMs: number;
    let size: number;
    try {
      const stat = await fs.stat(fullPath);
      mtimeMs = stat.mtimeMs;
      size = stat.size;
    } catch {
      this.cache.delete(fileItem);
      return emptyContent();
    }

    const cached = this.cache.get(fileItem);
    if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
      return cached.content;
    }

    let content: TFdContent;
    try {
      const text = await fs.readFile(fullPath, 'utf8');
      content = parseMarkdown(text);
    } catch {
      this.cache.delete(fileItem);
      return emptyContent();
    }

    this.cache.set(fileItem, { mtimeMs, size, content });
    return content;
  }

  /** micromatch против относительного пути: `*` не пересекает `/`, `**` — пересекает; регистрозависимо. */
  private applyFilter(relFiles: string[]): string[] {
    if (!this.filter) return relFiles;
    const { list, action } = this.filter;
    const matches = (p: string): boolean =>
      list.some((pat) => micromatch.isMatch(p, pat));

    if (action === 'allow') return relFiles.filter(matches);
    return relFiles.filter((p) => !matches(p));
  }

  private async walk(dir: string): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    const out: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...(await this.walk(full)));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(full);
      }
    }
    return out;
  }
}
