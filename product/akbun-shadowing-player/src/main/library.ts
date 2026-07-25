/** 불러온 음성 파일 목록을 userData/library.json에 저장하고 읽는다. */

import * as fs from "node:fs";
import * as path from "node:path";

export interface LibraryItem {
  path: string;
  name: string;
  durationSec: number | null;
  addedAt: string;
  /** 폴더 불러오기로 들어온 파일만 가진다. 홈 화면에서 폴더 단위로 묶는 기준이다. */
  folder?: string;
}

export class Library {
  private items: LibraryItem[] = [];
  private readonly filePath: string;

  constructor(userDataDir: string) {
    this.filePath = path.join(userDataDir, "library.json");
    this.load();
  }

  /** 설정 화면에 보여줄 메타데이터 파일 경로. */
  get storePath(): string {
    return this.filePath;
  }

  list(): LibraryItem[] {
    return this.items;
  }

  has(filePath: string): boolean {
    return this.items.some((item) => item.path === filePath);
  }

  /** 새 파일 경로들을 추가한다. 이미 있는 경로는 건너뛴다. folder를 주면 폴더 소속으로 묶는다. */
  add(filePaths: string[], folder?: string): LibraryItem[] {
    const known = new Set(this.items.map((item) => item.path));
    for (const filePath of filePaths) {
      if (known.has(filePath)) continue;
      this.items.push({
        path: filePath,
        name: path.basename(filePath),
        durationSec: null,
        addedAt: new Date().toISOString(),
        ...(folder ? { folder } : {}),
      });
    }
    this.save();
    return this.items;
  }

  /** 목록에는 있지만 디스크에서 사라진 파일인지. */
  missing(filePath: string): boolean {
    return !fs.existsSync(filePath);
  }

  /** 디스크에서 사라진 파일을 목록에서 지운다. */
  prune(): LibraryItem[] {
    const remaining = this.items.filter((item) => !this.missing(item.path));
    if (remaining.length !== this.items.length) {
      this.items = remaining;
      this.save();
    }
    return this.items;
  }

  remove(filePath: string): LibraryItem[] {
    this.items = this.items.filter((item) => item.path !== filePath);
    this.save();
    return this.items;
  }

  /** 목록을 통째로 비운다. 실제 파일은 지우지 않는다. */
  removeAll(): LibraryItem[] {
    this.items = [];
    this.save();
    return this.items;
  }

  /** 폴더 한 칸을 통째로 지운다. 같은 폴더 소속 항목만 사라진다. */
  removeFolder(folder: string): LibraryItem[] {
    this.items = this.items.filter((item) => item.folder !== folder);
    this.save();
    return this.items;
  }

  setDuration(filePath: string, durationSec: number): void {
    const item = this.items.find((entry) => entry.path === filePath);
    if (!item) return;
    item.durationSec = durationSec;
    this.save();
  }

  private load(): void {
    try {
      this.items = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
    } catch {
      this.items = [];
    }
  }

  private save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.items, null, 2));
  }
}
