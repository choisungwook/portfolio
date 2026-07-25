/**
 * 렌더러 UI. 홈(파일 목록) 화면과 재생(파형) 화면을 전환한다.
 * 재생은 HTMLAudioElement(blob URL)로 하고, Web Audio는 파형 계산에만 쓴다.
 */

const SKIP_SEC = 5;
const SPEED_STEP = 0.1;
const SPEED_MIN = 0.5;
const SPEED_MAX = 2.0;

const homeScreen = document.getElementById("home-screen") as HTMLElement;
const playerScreen = document.getElementById("player-screen") as HTMLElement;
const settingsScreen = document.getElementById("settings-screen") as HTMLElement;
const fileList = document.getElementById("file-list") as HTMLUListElement;
const emptyHint = document.getElementById("empty-hint") as HTMLElement;
const trackName = document.getElementById("track-name") as HTMLElement;
const waveLoading = document.getElementById("wave-loading") as HTMLElement;
const waveCanvas = document.getElementById("wave") as HTMLCanvasElement;
const timeNow = document.getElementById("time-now") as HTMLElement;
const timeTotal = document.getElementById("time-total") as HTMLElement;
const playButton = document.getElementById("play") as HTMLButtonElement;
const speedLabel = document.getElementById("speed") as HTMLElement;
const loopAButton = document.getElementById("loop-a") as HTMLButtonElement;
const loopBButton = document.getElementById("loop-b") as HTMLButtonElement;
const loopClearButton = document.getElementById("loop-clear") as HTMLButtonElement;

const audio = new Audio();
let audioUrl: string | null = null;
let waveform: Waveform | null = null;
let currentItem: LibraryItem | null = null;
let loopA: number | null = null;
let loopB: number | null = null;
let animationId = 0;

// ---------- 테마 ----------

/** "system" | "light" | "dark". system이면 data-theme을 지워 CSS가 시스템 설정을 따르게 한다. */
function applyTheme(theme: string): void {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  waveform?.refreshColors();
}

const THEMES = ["system", "light", "dark"];

/** localStorage에 빈 값이나 옛 값이 남아 있어도 data-theme=""가 되지 않게 막는다. */
function normalizeTheme(value: string | null): string {
  return value !== null && THEMES.includes(value) ? value : "system";
}

const themeSelect = document.getElementById("theme-select") as HTMLSelectElement;
themeSelect.value = normalizeTheme(localStorage.getItem("theme"));
applyTheme(themeSelect.value);
themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));

// system 모드에서 OS 설정이 바뀌면 canvas 색도 다시 읽는다.
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  waveform?.refreshColors();
});

// ---------- 홈 화면 ----------

async function refreshLibrary(items?: LibraryItem[]): Promise<void> {
  const library = items ?? (await window.api.listLibrary());
  fileList.innerHTML = "";
  emptyHint.hidden = library.length > 0;

  // 폴더로 불러온 파일은 폴더 아래에 묶고, 파일로 불러온 것은 그대로 한 줄씩 놓는다.
  const folders = new Map<string, HTMLUListElement>();
  for (const item of library) {
    if (item.folder === undefined) {
      fileList.appendChild(buildFileRow(item));
      continue;
    }
    let children = folders.get(item.folder);
    if (!children) {
      children = buildFolderGroup(item.folder);
      folders.set(item.folder, children);
    }
    children.appendChild(buildFileRow(item));
  }
}

/**
 * 폴더 한 칸을 만들어 목록에 붙이고, 하위 파일을 담을 ul을 돌려준다.
 * 접기와 펼치기는 details/summary가 스스로 하므로 따로 다루지 않는다.
 */
function buildFolderGroup(folder: string): HTMLUListElement {
  const group = document.createElement("li");
  group.className = "folder-group";

  const details = document.createElement("details");
  details.open = true;

  const header = document.createElement("summary");
  header.className = "folder-header";
  const name = document.createElement("span");
  name.className = "folder-name";
  // 렌더러에는 path 모듈이 없다. 구분자를 둘 다 나눠 OS와 상관없이 마지막 이름만 보여준다.
  name.textContent = `📁 ${folder.split(/[\\/]/).pop() || folder}`;
  const pathLabel = document.createElement("span");
  pathLabel.className = "file-meta";
  pathLabel.textContent = folder;

  const removeButton = document.createElement("button");
  removeButton.className = "file-remove";
  removeButton.textContent = "폴더 삭제";
  removeButton.addEventListener("click", async (event) => {
    // summary 안의 클릭은 접기/펼치기까지 일으키므로 막는다.
    event.preventDefault();
    event.stopPropagation();
    if (!confirm(`${folder}\n\n이 폴더의 파일을 목록에서 모두 지운다. 실제 파일은 남는다.`)) return;
    await refreshLibrary(await window.api.removeFolder(folder));
  });

  header.append(name, pathLabel, removeButton);

  const children = document.createElement("ul");
  children.className = "folder-children";
  details.append(header, children);
  group.appendChild(details);
  fileList.appendChild(group);
  return children;
}

function buildFileRow(item: LibraryItem): HTMLLIElement {
  const row = document.createElement("li");
  row.className = "file-row";

  const info = document.createElement("div");
  info.className = "file-info";
  const name = document.createElement("span");
  name.className = "file-name";
  name.textContent = item.name;
  const meta = document.createElement("span");
  meta.className = "file-meta";
  const duration = item.durationSec !== null ? formatTime(item.durationSec) : "--:--";
  meta.textContent = `${duration} · ${item.path}`;
  info.append(name, meta);
  info.addEventListener("click", () => {
    openPlayer(item).catch((error) => {
      window.api.logError("renderer", `파일 열기 실패: ${item.path}: ${String(error)}`);
      alert(`파일을 열 수 없다: ${item.name}`);
      goHome();
    });
  });

  const removeButton = document.createElement("button");
  removeButton.className = "file-remove";
  removeButton.textContent = "삭제";
  removeButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    await refreshLibrary(await window.api.removeFile(item.path));
  });

  row.append(info, removeButton);
  return row;
}

document.getElementById("add-files")!.addEventListener("click", async () => {
  await refreshLibrary(await window.api.addFiles());
});

document.getElementById("add-folder")!.addEventListener("click", async () => {
  await refreshLibrary(await window.api.addFolder());
});

document.getElementById("refresh-library")!.addEventListener("click", async () => {
  await refreshLibrary(await window.api.refreshLibrary());
});

document.getElementById("remove-all")!.addEventListener("click", async () => {
  if (!confirm("목록의 모든 파일을 지운다. 실제 파일은 남는다.")) return;
  await refreshLibrary(await window.api.removeAll());
});

// ---------- 설정 화면 ----------

async function openSettings(): Promise<void> {
  const info = await window.api.appInfo();
  (document.getElementById("library-path") as HTMLElement).textContent = info.libraryPath;
  (document.getElementById("log-path") as HTMLElement).textContent = info.logPath;
  (document.getElementById("app-version") as HTMLElement).textContent = info.version;
  homeScreen.hidden = true;
  playerScreen.hidden = true;
  settingsScreen.hidden = false;
}

function closeSettings(): void {
  settingsScreen.hidden = true;
  // 재생 중이던 파일이 있으면 재생 화면으로 돌아간다.
  if (currentItem) playerScreen.hidden = false;
  else homeScreen.hidden = false;
}

document.getElementById("settings-close")!.addEventListener("click", closeSettings);

for (const button of document.querySelectorAll<HTMLButtonElement>("button.reveal")) {
  button.addEventListener("click", async () => {
    const id = button.dataset.target === "library" ? "library-path" : "log-path";
    await window.api.reveal(document.getElementById(id)!.textContent!);
  });
}

window.api.onMenu((name) => {
  if (name === "settings") void openSettings();
});

// ---------- 화면 전환 ----------

async function openPlayer(item: LibraryItem): Promise<void> {
  currentItem = item;
  trackName.textContent = item.name;
  homeScreen.hidden = true;
  playerScreen.hidden = false;
  waveLoading.hidden = false;
  waveform?.dispose();
  waveform = null;
  setLoop(null, null);

  const bytes = await window.api.readAudio(item.path);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  releaseAudioUrl();
  audioUrl = URL.createObjectURL(new Blob([bytes]));
  audio.src = audioUrl;
  audio.playbackRate = parseSpeedLabel();

  const audioContext = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await audioContext.decodeAudioData(arrayBuffer as ArrayBuffer);
  } catch {
    alert(`디코딩할 수 없는 파일이다: ${item.name}`);
    goHome();
    return;
  } finally {
    await audioContext.close();
  }

  waveform = new Waveform(waveCanvas, decoded);
  waveform.onSeek = (timeSec) => {
    audio.currentTime = timeSec;
    void audio.play();
  };
  // 파형 드래그로 구간을 잡는다. 기존 구간이 있어도 그대로 새 구간으로 바꾼다.
  waveform.onLoopSelect = (a, b) => setLoop(a, b);
  waveLoading.hidden = true;

  if (item.durationSec === null) {
    await window.api.setDuration(item.path, decoded.duration);
  }
  timeTotal.textContent = formatTime(decoded.duration);
  startAnimation();
}

function releaseAudioUrl(): void {
  if (!audioUrl) return;
  URL.revokeObjectURL(audioUrl);
  audioUrl = null;
}

function goHome(): void {
  currentItem = null;
  audio.pause();
  audio.removeAttribute("src");
  releaseAudioUrl();
  stopAnimation();
  waveform?.dispose();
  waveform = null;
  playerScreen.hidden = true;
  homeScreen.hidden = false;
  void refreshLibrary();
}

document.getElementById("go-home")!.addEventListener("click", goHome);
document.getElementById("zoom-in")!.addEventListener("click", () => waveform?.zoom(1.5));
document.getElementById("zoom-out")!.addEventListener("click", () => waveform?.zoom(1 / 1.5));

// ---------- 재생 컨트롤 ----------

function togglePlay(): void {
  if (!audio.paused) {
    audio.pause();
    return;
  }
  // 구간 반복이 있고 재생 위치가 구간 밖이면 A부터 시작한다.
  if (loopA !== null && loopB !== null && (audio.currentTime < loopA || audio.currentTime >= loopB)) {
    audio.currentTime = loopA;
  }
  void audio.play();
}

playButton.addEventListener("click", togglePlay);
audio.addEventListener("play", () => (playButton.textContent = "⏸"));
audio.addEventListener("pause", () => (playButton.textContent = "▶"));

function skip(deltaSec: number): void {
  audio.currentTime = Math.min(audio.duration || 0, Math.max(0, audio.currentTime + deltaSec));
}

document.getElementById("back5")!.addEventListener("click", () => skip(-SKIP_SEC));
document.getElementById("fwd5")!.addEventListener("click", () => skip(SKIP_SEC));

function parseSpeedLabel(): number {
  return parseFloat(speedLabel.textContent!.replace("x", ""));
}

function changeSpeed(deltaStep: number): void {
  const next = Math.min(SPEED_MAX, Math.max(SPEED_MIN, audio.playbackRate + deltaStep));
  audio.playbackRate = Math.round(next * 10) / 10;
  speedLabel.textContent = `${audio.playbackRate.toFixed(1)}x`;
}

document.getElementById("speed-down")!.addEventListener("click", () => changeSpeed(-SPEED_STEP));
document.getElementById("speed-up")!.addEventListener("click", () => changeSpeed(SPEED_STEP));

// ---------- 구간 반복 (A-B) ----------

function setLoop(a: number | null, b: number | null): void {
  loopA = a;
  loopB = b;
  loopAButton.classList.toggle("active", loopA !== null);
  loopBButton.classList.toggle("active", loopB !== null);
  loopAButton.textContent = loopA !== null ? `Ⓐ ${formatTime(loopA)}` : "Ⓐ";
  loopBButton.textContent = loopB !== null ? `Ⓑ ${formatTime(loopB)}` : "Ⓑ";
  waveform?.setLoop(loopA, loopB);
}

loopAButton.addEventListener("click", () => {
  const a = audio.currentTime;
  setLoop(a, loopB !== null && loopB > a ? loopB : null);
});

loopBButton.addEventListener("click", () => {
  if (loopA === null || audio.currentTime <= loopA) return;
  setLoop(loopA, audio.currentTime);
});

loopClearButton.addEventListener("click", () => setLoop(null, null));

// ---------- 프레임 루프: 재생 헤드, 구간 반복, 시간 표시 ----------

function startAnimation(): void {
  stopAnimation();
  const tick = (): void => {
    if (loopA !== null && loopB !== null && audio.currentTime >= loopB) {
      audio.currentTime = loopA;
    }
    timeNow.textContent = formatTime(audio.currentTime);
    if (waveform) {
      waveform.setPlayhead(audio.currentTime);
      if (!audio.paused) waveform.followPlayhead();
    }
    animationId = requestAnimationFrame(tick);
  };
  animationId = requestAnimationFrame(tick);
}

function stopAnimation(): void {
  if (animationId) cancelAnimationFrame(animationId);
  animationId = 0;
}

// ---------- 키보드 단축키 ----------

window.addEventListener("keydown", (event) => {
  if (playerScreen.hidden) return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlay();
  } else if (event.code === "ArrowLeft") {
    skip(-SKIP_SEC);
  } else if (event.code === "ArrowRight") {
    skip(SKIP_SEC);
  }
});

// ---------- 오류 로그: 렌더러에서 잡히지 않은 오류를 main의 로그 파일로 보낸다 ----------

window.addEventListener("error", (event) => {
  window.api.logError("renderer", `${event.message} (${event.filename}:${event.lineno})`);
});

window.addEventListener("unhandledrejection", (event) => {
  window.api.logError("renderer", `unhandledrejection: ${String(event.reason)}`);
});

void refreshLibrary();
