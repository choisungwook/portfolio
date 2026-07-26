/**
 * 앱 셸. 홈(문서 목록·임포트)과 편집 화면 전환, 페이지 목록, 자동 저장, export를 담당한다.
 * index.html이 importer.js → exporter.js → editor.js → renderer.js 순서로 로드한다(전역 script).
 */

const homeSection = document.getElementById("home") as HTMLElement;
const editorSection = document.getElementById("editor") as HTMLElement;
const docListEl = document.getElementById("doc-list") as HTMLElement;
const emptyHintEl = document.getElementById("empty-hint") as HTMLElement;
const pageListEl = document.getElementById("page-list") as HTMLElement;
const stageContainer = document.getElementById("stage") as HTMLElement;
const docTitleEl = document.getElementById("doc-title") as HTMLElement;
const saveStateEl = document.getElementById("save-state") as HTMLElement;

let current: { name: string; doc: SheetDoc } | null = null;
let pageIndex = 0;
let saveTimer: number | null = null;

// ---------- 화면 전환 ----------

async function showHome(): Promise<void> {
  current = null;
  editorSection.hidden = true;
  homeSection.hidden = false;
  await refreshDocList();
}

async function refreshDocList(): Promise<void> {
  const docs = await window.api.listDocs();
  docListEl.textContent = "";
  emptyHintEl.hidden = docs.length !== 0;
  for (const summary of docs) {
    const row = document.createElement("div");
    row.className = "doc-item";

    const info = document.createElement("button");
    info.className = "doc-info";
    info.innerHTML = `<b></b><small></small>`;
    (info.querySelector("b") as HTMLElement).textContent = summary.title;
    (info.querySelector("small") as HTMLElement).textContent =
      `${summary.name} · ${summary.updatedAt.slice(0, 10)}`;
    info.onclick = () => void openDoc(summary.name);

    const remove = document.createElement("button");
    remove.className = "doc-remove";
    remove.textContent = "삭제";
    remove.title = "문서를 지운다. 편집 내용이 삭제된다";
    remove.onclick = async (event) => {
      event.stopPropagation();
      if (!confirm(`"${summary.title}" 문서를 지울까? 편집 내용이 삭제된다.`)) return;
      await window.api.removeDoc(summary.name);
      await refreshDocList();
    };

    row.append(info, remove);
    docListEl.appendChild(row);
  }
}

async function openDoc(name: string): Promise<void> {
  const doc = await window.api.loadDoc(name);
  current = { name, doc };
  pageIndex = 0;
  homeSection.hidden = true;
  editorSection.hidden = false;
  docTitleEl.textContent = doc.title;
  saveStateEl.textContent = "저장됨";
  renderPageList();
  renderStage();
}

// ---------- 임포트 / export ----------

/** 파일명에서 문서 이름을 만든다. 이미 있으면 -2, -3을 붙여 기존 편집본을 지키지 않는다. */
async function uniqueDocName(sourcePath: string): Promise<string> {
  const base = (sourcePath.split("/").pop() ?? "studysheet").replace(/\.html?$/i, "");
  const existing = new Set((await window.api.listDocs()).map((d) => d.name));
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * 골라 온 HTML들을 모델로 바꿔 목록에 추가한다. 학습지 형식이 아닌 파일은 건너뛴다.
 * 폴더 불러오기가 임의 HTML을 섞어 와도 목록이 오염되지 않게 하기 위함이다.
 */
async function importPicked(picked: { path: string; html: string }[]): Promise<void> {
  if (picked.length === 0) return;
  let imported = 0;
  const skipped: string[] = [];
  for (const file of picked) {
    try {
      const doc = importStudysheet(file.html, file.path);
      const name = await uniqueDocName(file.path);
      await window.api.saveDoc(name, doc);
      imported++;
    } catch {
      skipped.push(file.path.split("/").pop() ?? file.path);
    }
  }
  await refreshDocList();
  if (skipped.length > 0) {
    alert(
      `학습지 ${imported}개를 불러왔다.\n학습지 형식이 아니라 건너뜀 (${skipped.length}개): ${skipped.join(", ")}`,
    );
  }
}

async function runImport(): Promise<void> {
  await importPicked(await window.api.importHtml());
}

async function runImportFolder(): Promise<void> {
  await importPicked(await window.api.importFolder());
}

async function runExport(): Promise<void> {
  if (!current) return;
  stageFlush();
  const html = exportStudysheet(current.doc);
  const saved = await window.api.exportHtml(html, current.doc.sourcePath);
  if (saved) saveStateEl.textContent = `내보냄: ${saved.split("/").pop()}`;
}

// ---------- 자동 저장 ----------

/** 조작이 잦으므로 0.5초 뒤로 미뤄 한 번만 쓴다. */
function scheduleSave(): void {
  if (!current) return;
  saveStateEl.textContent = "저장 중…";
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    if (!current) return;
    void window.api.saveDoc(current.name, current.doc).then(() => {
      saveStateEl.textContent = "저장됨";
    });
  }, 500);
}

// ---------- 편집 화면 ----------

/** 페이지 라벨: 표지는 "표지", 내용 페이지는 첫 객체의 "N. 섹션명" 텍스트를 쓴다. */
function pageLabel(page: SheetPage, index: number): string {
  if (page.cls.includes("cover")) return "표지";
  const sec = page.objects[0]?.html.match(/class="sec"[^>]*>([^<]+)</);
  return sec ? sec[1].trim() : `${index + 1} 페이지`;
}

function renderPageList(): void {
  if (!current) return;
  pageListEl.textContent = "";
  current.doc.pages.forEach((page, i) => {
    const button = document.createElement("button");
    button.className = "page-item" + (i === pageIndex ? " on" : "");
    button.textContent = `${i + 1}. ${pageLabel(page, i)}`;
    button.onclick = () => {
      stageFlush();
      pageIndex = i;
      renderPageList();
      renderStage();
    };
    pageListEl.appendChild(button);
  });
}

function renderStage(): void {
  if (!current) return;
  stageRender(current.doc, pageIndex, stageContainer, scheduleSave);
}

// ---------- 배선 ----------

(document.getElementById("btn-import") as HTMLButtonElement).onclick = () => void runImport();
(document.getElementById("btn-import-folder") as HTMLButtonElement).onclick = () =>
  void runImportFolder();
(document.getElementById("btn-refresh") as HTMLButtonElement).onclick = () =>
  void refreshDocList();
(document.getElementById("btn-remove-all") as HTMLButtonElement).onclick = async () => {
  if (!confirm("모든 문서를 지울까? 편집 내용이 삭제된다.")) return;
  await window.api.removeAllDocs();
  await refreshDocList();
};
(document.getElementById("btn-home") as HTMLButtonElement).onclick = () => void showHome();
(document.getElementById("btn-export") as HTMLButtonElement).onclick = () => void runExport();

window.api.onMenu((name) => {
  if (name === "import") void runImport();
  if (name === "export") void runExport();
});

// 창 크기가 바뀌면 스테이지 배율을 다시 계산한다.
let resizeTimer: number | null = null;
window.addEventListener("resize", () => {
  if (resizeTimer !== null) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null;
    stageFlush();
    renderStage();
  }, 150);
});

// rem이 논리 해상도(1280x720) 기준으로 풀리도록 root 글씨 크기를 고정한다.
pinRootFontSize();
void showHome();
