/** main 프로세스 IPC 반환 형태와 수동으로 맞추는 전역 타입 선언. */

interface LibraryItem {
  path: string;
  name: string;
  durationSec: number | null;
  addedAt: string;
  folder?: string;
}

interface AppInfo {
  version: string;
  libraryPath: string;
  logPath: string;
}

interface Window {
  api: {
    listLibrary(): Promise<LibraryItem[]>;
    addFiles(): Promise<LibraryItem[]>;
    addFolder(): Promise<LibraryItem[]>;
    removeFile(path: string): Promise<LibraryItem[]>;
    refreshLibrary(): Promise<LibraryItem[]>;
    setDuration(path: string, durationSec: number): Promise<void>;
    readAudio(path: string): Promise<Uint8Array<ArrayBuffer>>;
    appInfo(): Promise<AppInfo>;
    reveal(path: string): Promise<void>;
    onMenu(handler: (name: string) => void): void;
    logError(source: string, message: string): void;
  };
}
