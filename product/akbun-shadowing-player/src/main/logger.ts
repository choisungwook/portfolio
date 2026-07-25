/**
 * 파일 로거. macOS 관례 위치인 ~/Library/Logs/<앱 이름>/main.log에 쓴다.
 * 로그 디렉터리 경로는 main.ts가 app.getPath("logs")로 얻어 넘긴다.
 *
 * rotation: main.log가 MAX_FILE_BYTES를 넘으면 main.log.1 ... main.log.5로
 * 번호를 밀어 보관하고 가장 오래된 파일을 지운다.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const MAX_FILE_BYTES = 1 * 1024 * 1024;
const MAX_ROTATED_FILES = 5;

export class Logger {
  private readonly logPath: string;

  constructor(logDir: string) {
    fs.mkdirSync(logDir, { recursive: true });
    this.logPath = path.join(logDir, "main.log");
  }

  info(source: string, message: string): void {
    this.write("INFO", source, message);
  }

  error(source: string, message: string): void {
    this.write("ERROR", source, message);
  }

  private write(level: string, source: string, message: string): void {
    const line = `${new Date().toISOString()} [${level}] [${source}] ${message}\n`;
    try {
      this.rotateIfNeeded();
      fs.appendFileSync(this.logPath, line);
    } catch {
      // 로그 기록 실패가 앱 동작을 막지 않도록 무시한다.
    }
  }

  private rotateIfNeeded(): void {
    let size: number;
    try {
      size = fs.statSync(this.logPath).size;
    } catch {
      return;
    }
    if (size < MAX_FILE_BYTES) return;

    fs.rmSync(`${this.logPath}.${MAX_ROTATED_FILES}`, { force: true });
    for (let n = MAX_ROTATED_FILES - 1; n >= 1; n--) {
      const from = `${this.logPath}.${n}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${this.logPath}.${n + 1}`);
    }
    fs.renameSync(this.logPath, `${this.logPath}.1`);
  }
}
