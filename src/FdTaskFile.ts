import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/** Сырой доступ к `.md`-файлам каталога задачи: список / чтение / запись. */
export class FdTaskFile {
  private readonly dir: string;

  constructor(taskDir: string) {
    this.dir = path.resolve(taskDir);
  }

  /** Рекурсивный обход `.md`-файлов (скрытые папки/файлы пропускаются), пути относительно `dir`. */
  async list(): Promise<string[]> {
    const abs = await this.walk(this.dir);
    return abs
      .map((f) => path.relative(this.dir, f).split(path.sep).join('/'))
      .sort();
  }

  async read(relativeFileName: string): Promise<string> {
    return fs.readFile(path.resolve(this.dir, relativeFileName), 'utf8');
  }

  /** Создаёт родительские каталоги при необходимости. */
  async write(relativeFileName: string, text: string): Promise<void> {
    const fullPath = path.resolve(this.dir, relativeFileName);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, text, 'utf8');
  }

  private async walk(dir: string): Promise<string[]> {
    let entries;
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
