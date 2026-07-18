/**
 * 렌더러 UI 로직.
 *
 * import/export 없는 스크립트로 작성한다. tsconfig.renderer.json이
 * module: none으로 컴파일해 브라우저 script 태그로 바로 로드한다.
 */

const HISTOGRAM_ROW_LIMIT = 200;

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  let value = size / 1024;
  for (const unit of ["KB", "MB", "GB", "TB"]) {
    if (value < 1024) return `${value.toFixed(1)} ${unit}`;
    value /= 1024;
  }
  return `${value.toFixed(1)} PB`;
}

function setStatus(text: string): void {
  $("status").textContent = text;
}

function selectTab(name: string): void {
  document.querySelectorAll<HTMLElement>(".tab-panel").forEach((panel) => {
    panel.hidden = panel.dataset.tab !== name;
  });
  document.querySelectorAll<HTMLElement>(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === name);
  });
}

function addCell(row: HTMLTableRowElement, text: string, numeric = false): void {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (numeric) cell.classList.add("num");
  row.appendChild(cell);
}

function renderHistogram(stats: ClassStatDto[]): void {
  const tbody = $("histogram-body");
  tbody.innerHTML = "";
  for (const stat of stats.slice(0, HISTOGRAM_ROW_LIMIT)) {
    const row = document.createElement("tr");
    addCell(row, stat.name);
    addCell(row, stat.count.toLocaleString(), true);
    addCell(row, formatBytes(stat.shallow), true);
    addCell(row, stat.retained !== null ? formatBytes(stat.retained) : "-", true);
    row.title = "더블클릭하면 가장 큰 인스턴스의 GC root 경로를 연다";
    row.addEventListener("dblclick", () => showLargestPath(stat.name));
    tbody.appendChild(row);
  }
}

function renderLarge(large: LargeObjectDto[]): void {
  const tbody = $("large-body");
  tbody.innerHTML = "";
  for (const obj of large) {
    const row = document.createElement("tr");
    addCell(row, `0x${obj.objId.toString(16)}`);
    addCell(row, obj.className);
    addCell(row, formatBytes(obj.shallowSize), true);
    row.title = "더블클릭하면 GC root 경로를 연다";
    row.addEventListener("dblclick", () => showObjectPath(obj.objId));
    tbody.appendChild(row);
  }
}

function renderThreads(threads: ThreadDto[]): void {
  const lines: string[] = [];
  if (threads.length === 0) lines.push("스레드 정보가 없다.");
  for (const thread of threads) {
    lines.push(`"${thread.name}" (serial ${thread.serial})`);
    if (thread.frames.length > 0) {
      lines.push(...thread.frames.map((frame) => `  at ${frame}`));
    } else {
      lines.push("  (스택 정보 없음)");
    }
    lines.push("");
  }
  $("threads-pre").textContent = lines.join("\n");
}

function renderPathResult(result: PathResultDto | null): void {
  if (!result) return;
  const { target, steps } = result;
  const lines = [
    `[${target.className} 0x${target.objId.toString(16)}, ${formatBytes(target.shallowSize)}]`,
  ];
  if (!steps || steps.length === 0) {
    lines.push("  (GC root에서 도달할 수 없음 — 이미 수집 대상)");
  } else {
    steps.forEach((step, i) => {
      lines.push(`${"  ".repeat(i)}${step.refName} → ${step.className} (0x${step.objId.toString(16)})`);
    });
  }
  $("path-pre").textContent = lines.join("\n");
  selectTab("path");
}

async function showLargestPath(className: string): Promise<void> {
  renderPathResult(await window.api.largestPath(className));
}

async function showObjectPath(objId: number): Promise<void> {
  renderPathResult(await window.api.pathToRoot(objId));
}

async function analyzeFile(path: string): Promise<void> {
  setStatus(`분석 중... ${path}`);
  try {
    const result = await window.api.analyze(path);
    renderHistogram(result.stats);
    renderLarge(result.large);
    renderThreads(result.threads);
    setStatus(
      `${path} — 객체 ${result.objectCount.toLocaleString()}개,` +
        ` GC root ${result.rootCount.toLocaleString()}개`,
    );
    selectTab("histogram");
  } catch (error) {
    setStatus(`분석 실패: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function openAndAnalyze(): Promise<void> {
  const path = await window.api.openFile();
  if (path) await analyzeFile(path);
}

function init(): void {
  $("open-button").addEventListener("click", () => void openAndAnalyze());
  document.querySelectorAll<HTMLElement>(".tab-button").forEach((button) => {
    button.addEventListener("click", () => selectTab(button.dataset.tab!));
  });
  selectTab("histogram");
}

init();
