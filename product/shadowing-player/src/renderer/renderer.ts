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

// ---------- 홈 화면 ----------

async function refreshLibrary(items?: LibraryItem[]): Promise<void> {
  const library = items ?? (await window.api.listLibrary());
  fileList.innerHTML = "";
  emptyHint.hidden = library.length > 0;
  for (const item of library) {
    fileList.appendChild(buildFileRow(item));
  }
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
  info.addEventListener("click", () => openPlayer(item));

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

// ---------- 화면 전환 ----------

async function openPlayer(item: LibraryItem): Promise<void> {
  currentItem = item;
  trackName.textContent = item.name;
  homeScreen.hidden = true;
  playerScreen.hidden = false;
  waveLoading.hidden = false;
  waveform = null;
  setLoop(null, null);

  const bytes = await window.api.readAudio(item.path);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(new Blob([bytes]));
  audio.src = audioUrl;
  audio.playbackRate = parseSpeedLabel();

  const audioContext = new AudioContext();
  const decoded = await audioContext.decodeAudioData(arrayBuffer as ArrayBuffer);
  await audioContext.close();

  waveform = new Waveform(waveCanvas, decoded);
  waveform.onSeek = (timeSec) => {
    audio.currentTime = timeSec;
    void audio.play();
  };
  waveLoading.hidden = true;

  if (item.durationSec === null) {
    await window.api.setDuration(item.path, decoded.duration);
  }
  timeTotal.textContent = formatTime(decoded.duration);
  startAnimation();
}

function goHome(): void {
  audio.pause();
  stopAnimation();
  playerScreen.hidden = true;
  homeScreen.hidden = false;
  void refreshLibrary();
}

document.getElementById("go-home")!.addEventListener("click", goHome);
document.getElementById("zoom-in")!.addEventListener("click", () => waveform?.zoom(1.5));
document.getElementById("zoom-out")!.addEventListener("click", () => waveform?.zoom(1 / 1.5));

// ---------- 재생 컨트롤 ----------

function togglePlay(): void {
  if (audio.paused) void audio.play();
  else audio.pause();
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
  loopAButton.textContent = loopA !== null ? `A ${formatTime(loopA)}` : "구간 시작 A";
  loopBButton.textContent = loopB !== null ? `B ${formatTime(loopB)}` : "구간 끝 B";
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

void refreshLibrary();
