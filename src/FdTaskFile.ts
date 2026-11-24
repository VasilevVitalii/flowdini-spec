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
    const fullPath = this.resolve(relativeFileName);
    await this.assertWithinRealDir(fullPath, relativeFileName);
    return fs.readFile(fullPath, 'utf8');
  }

  /** Создаёт родительские каталоги при необходимости. */
  async write(relativeFileName: string, text: string): Promise<void> {
    const fullPath = this.resolve(relativeFileName);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await this.assertParentWithinRealDir(fullPath, relativeFileName);
    // Отказ, если конечный компонент — симлинк: запись через ссылку наружу
    // обходит containment (lstat не раскрывает ссылку).
    try {
      const st = await fs.lstat(fullPath);
      if (st.isSymbolicLink()) {
        throw new Error(`Симлинк в пути записи: ${relativeFileName}`);
      }
    } catch (e) {
      if ((e as { code?: string }).code !== 'ENOENT') throw e;
    }
    await fs.writeFile(fullPath, text, 'utf8');
  }

  /**
   * Лексический `resolve` не ловит симлинки: realpath целевого файла обязан
   * лежать внутри realpath каталога — иначе `../`-через-ссылку выводит наружу.
   */
  private async assertWithinRealDir(fullPath: string, relativeFileName: string): Promise<void> {
    const dirReal = await fs.realpath(this.dir);
    const fileReal = await fs.realpath(fullPath);
    if (!this.isInside(fileReal, dirReal)) {
      throw new Error(`Файл вне каталога задачи (симлинк): ${relativeFileName}`);
    }
  }

  private async assertParentWithinRealDir(
    fullPath: string,
    relativeFileName: string,
  ): Promise<void> {
    const dirReal = await fs.realpath(this.dir);
    const parentReal = await fs.realpath(path.dirname(fullPath));
    if (parentReal !== dirReal && !this.isInside(parentReal, dirReal)) {
      throw new Error(`Каталог вне задачи (симлинк): ${relativeFileName}`);
    }
  }

  private isInside(p: string, dir: string): boolean {
    return p.startsWith(dir + path.sep);
  }

  /**
   * Абсолютный путь строго внутри каталога задачи. Путь с `..` или абсолютный,
   * выходящий за `dir`, отклоняется — защита от выхода за границы каталога.
   */
  private resolve(relativeFileName: string): string {
    const full = path.resolve(this.dir, relativeFileName);
    const rel = path.relative(this.dir, full);
    if (rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
      throw new Error(`Путь вне каталога задачи: ${relativeFileName}`);
    }
    return full;
  }

  private async walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
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
