/**
 * 브라우저용 window.api 구현. renderer는 그대로 두고 Electron main이 하던 일만 대신한다.
 * 파일 대화상자는 input[type=file], 목록과 파일 바이트는 IndexedDB가 맡는다.
 */

const DB_NAME = "akbun-shadowing-player";
const DB_VERSION = 1;
const STORE = "files";
const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "ogg", "flac"];

/** 빌드 스크립트가 package.json의 version으로 바꿔 넣는 자리다. */
const APP_VERSION = "__APP_VERSION__";

/** IndexedDB에는 목록 항목에 파일 바이트를 함께 담는다. 브라우저는 경로로 파일을 다시 읽을 수 없다. */
interface StoredItem extends LibraryItem {
  blob: Blob;
}

// ---------- IndexedDB ----------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "path" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

/** store 요청 하나를 트랜잭션 하나에서 돌리고 결과를 기다린다. */
async function run<T>(
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const result = request(db.transaction(STORE, mode).objectStore(STORE));
    result.onsuccess = () => resolve(result.result);
    result.onerror = () => reject(result.error);
  });
}

/** 저장된 항목에서 blob을 빼고 불러온 순서대로 돌려준다. */
async function listLibrary(): Promise<LibraryItem[]> {
  const stored = await run<StoredItem[]>("readonly", (store) => store.getAll());
  return stored
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.path.localeCompare(b.path))
    .map(({ blob: _blob, ...item }) => item);
}

// ---------- 파일 불러오기 ----------

/** 브라우저에는 절대 경로가 없다. 폴더로 불러온 파일은 폴더 안 상대 경로를 키로 쓴다. */
function itemPath(file: File): string {
  return file.webkitRelativePath || file.name;
}

function isAudio(file: File): boolean {
  return AUDIO_EXTENSIONS.includes(file.name.split(".").pop()?.toLowerCase() ?? "");
}

/**
 * 파일 선택 대화상자를 띄우고 고른 File을 돌려준다.
 * cancel 이벤트를 지원하지 않는 브라우저에서는 선택이 없으면 promise가 그대로 남는다.
 * 목록을 건드리지 않으므로 화면은 이전 상태를 유지한다.
 */
function pickFiles(directory: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    if (directory) input.webkitdirectory = true;
    else input.accept = AUDIO_EXTENSIONS.map((extension) => `.${extension}`).join(",");
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

/** 새 파일만 저장한다. 이미 같은 경로가 있으면 건너뛴다. folder를 주면 폴더 소속으로 묶는다. */
async function storeFiles(files: File[], folder?: string): Promise<LibraryItem[]> {
  const known = new Set((await listLibrary()).map((item) => item.path));
  const addedAt = new Date().toISOString();
  for (const file of files) {
    const path = itemPath(file);
    if (known.has(path)) continue;
    const item: StoredItem = {
      path,
      name: file.name,
      durationSec: null,
      addedAt,
      ...(folder ? { folder } : {}),
      blob: file,
    };
    try {
      await run("readwrite", (store) => store.put(item));
    } catch (error) {
      // 브라우저 저장 용량을 넘기면 여기서 멈춘다. 앞서 저장한 파일은 그대로 남긴다.
      console.error(`파일 저장 실패: ${path}: ${String(error)}`);
      alert(`브라우저 저장 공간이 부족해 더 담을 수 없다: ${file.name}`);
      break;
    }
  }
  return listLibrary();
}

async function addFiles(): Promise<LibraryItem[]> {
  return storeFiles((await pickFiles(false)).filter(isAudio));
}

async function addFolder(): Promise<LibraryItem[]> {
  const files = (await pickFiles(true)).filter(isAudio);
  const folder = files[0]?.webkitRelativePath.split("/")[0];
  return folder ? storeFiles(files, folder) : listLibrary();
}

// ---------- 목록 편집 ----------

async function removeFile(path: string): Promise<LibraryItem[]> {
  await run("readwrite", (store) => store.delete(path));
  return listLibrary();
}

async function removeFolder(folder: string): Promise<LibraryItem[]> {
  const items = await listLibrary();
  for (const item of items.filter((entry) => entry.folder === folder)) {
    await run("readwrite", (store) => store.delete(item.path));
  }
  return listLibrary();
}

async function removeAll(): Promise<LibraryItem[]> {
  await run("readwrite", (store) => store.clear());
  return listLibrary();
}

async function setDuration(path: string, durationSec: number): Promise<void> {
  const item = await run<StoredItem | undefined>("readonly", (store) => store.get(path));
  if (!item) return;
  await run("readwrite", (store) => store.put({ ...item, durationSec }));
}

async function readAudio(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const item = await run<StoredItem | undefined>("readonly", (store) => store.get(path));
  if (!item) throw new Error("목록에 없는 파일은 읽을 수 없다");
  return new Uint8Array(await item.blob.arrayBuffer());
}

// ---------- 화면 보정 ----------

let menuHandler: ((name: string) => void) | null = null;

/**
 * Electron 상단 메뉴가 없으므로 홈 화면에 설정 버튼을 넣는다.
 * 설정 화면의 폴더 열기 버튼은 브라우저에서 할 일이 없어 아예 지운다.
 */
function adjustDom(): void {
  const settings = document.createElement("button");
  settings.id = "open-settings";
  settings.textContent = "설정";
  settings.addEventListener("click", () => menuHandler?.("settings"));
  document.querySelector(".home-actions")?.appendChild(settings);

  for (const button of document.querySelectorAll("button.reveal")) button.remove();
}

// ---------- window.api ----------

window.api = {
  listLibrary,
  addFiles,
  addFolder,
  removeFile,
  removeFolder,
  removeAll,
  // 브라우저는 파일을 통째로 담아 두므로 사라진 파일을 골라낼 일이 없다.
  refreshLibrary: listLibrary,
  setDuration,
  readAudio,
  appInfo: async () => ({
    version: APP_VERSION,
    libraryPath: `IndexedDB · ${DB_NAME} / ${STORE}`,
    logPath: "브라우저 개발자 도구 콘솔",
  }),
  reveal: async () => {},
  onMenu: (handler) => {
    menuHandler = handler;
  },
  logError: (source, message) => console.error(`[${source}] ${message}`),
};

adjustDom();
