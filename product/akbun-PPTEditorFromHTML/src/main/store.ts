/**
 * 문서(JSON 모델) 영속. 진실의 원본은 이 디렉터리의 JSON이고 HTML은 export 산출물이다.
 * 배경은 knowledge/decisions/2026-07-model-first-json-source.md 참조.
 */

import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface DocSummary {
  /** 저장 파일명(확장자 제외). 문서의 식별자다. */
  name: string;
  path: string;
  title: string;
  updatedAt: string;
}

export class DocStore {
  readonly dir: string;

  constructor(documentsDir: string) {
    this.dir = path.join(documentsDir, "akbun-PPTEditorFromHTML");
    fsSync.mkdirSync(this.dir, { recursive: true });
  }

  /** 렌더러가 넘긴 이름이 디렉터리를 벗어나지 못하게 파일명만 남긴다. */
  private filePath(name: string): string {
    const safe = path.basename(name).replace(/\.json$/, "");
    if (!safe) throw new Error("문서 이름이 비어 있다");
    return path.join(this.dir, `${safe}.json`);
  }

  async list(): Promise<DocSummary[]> {
    const names = await fs.readdir(this.dir);
    const summaries: DocSummary[] = [];
    for (const file of names.filter((n) => n.endsWith(".json"))) {
      const full = path.join(this.dir, file);
      try {
        const [stat, raw] = await Promise.all([fs.stat(full), fs.readFile(full, "utf-8")]);
        const doc = JSON.parse(raw) as { title?: string };
        summaries.push({
          name: file.replace(/\.json$/, ""),
          path: full,
          title: doc.title ?? file,
          updatedAt: stat.mtime.toISOString(),
        });
      } catch {
        // 깨진 파일은 목록에서 숨긴다. 지우지는 않는다.
      }
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(name: string): Promise<unknown> {
    return JSON.parse(await fs.readFile(this.filePath(name), "utf-8"));
  }

  async save(name: string, doc: unknown): Promise<void> {
    await fs.writeFile(this.filePath(name), JSON.stringify(doc), "utf-8");
  }

  async remove(name: string): Promise<void> {
    await fs.rm(this.filePath(name), { force: true });
  }

  async removeAll(): Promise<void> {
    const names = await fs.readdir(this.dir);
    await Promise.all(
      names
        .filter((file) => file.endsWith(".json"))
        .map((file) => fs.rm(path.join(this.dir, file), { force: true })),
    );
  }
}
