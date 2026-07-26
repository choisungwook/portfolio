/**
 * 편집 스테이지. 앱 자신의 DOM에 Shadow DOM 캔버스(스타일 격리)로 현재 페이지를
 * 고정 논리 해상도(1280x720)로 그리고, 전체를 scale로 창 크기에 맞춘다.
 * 드래그 이동·리사이즈·더블클릭 텍스트 편집이 같은 문서 안에서 동작한다.
 * 모든 조작은 모델(SheetObject의 x/y/w/html)을 고치고, 화면은 그 결과다.
 */

/** 스테이지 전용 CSS. 캔버스(Shadow DOM) 안에만 적용되고 export 결과에는 들어가지 않는다. */
const STAGE_CSS = `
.page{position:relative;padding:0;border:none;overflow:hidden}
.ppte-obj{position:absolute;margin:0;cursor:grab;min-height:12px}
.ppte-obj>*{margin:0}
.ppte-obj.sel{outline:2px solid #4A90D9;outline-offset:1px}
.ppte-obj.editing{cursor:text;outline:2px dashed #4A90D9}
#ppte-handle{position:absolute;width:14px;height:14px;background:#4A90D9;
  border:2px solid #fff;border-radius:3px;cursor:nwse-resize;z-index:9}
`;

interface StageState {
  root: ShadowRoot;
  pageEl: HTMLElement;
  handle: HTMLElement;
  selected: HTMLElement | null;
  /** 화면 px → 논리 px 변환에 쓰는 배율. */
  scale: number;
  page: SheetPage;
  onChange: () => void;
}

let stage: StageState | null = null;

/** 이번 렌더링의 이벤트 리스너 수명. 다시 렌더링하면 abort로 이전 리스너를 정리한다. */
let stageAbort: AbortController | null = null;

/** 현재 페이지를 스테이지에 그린다. 페이지를 바꾸거나 문서를 열 때마다 다시 부른다. */
function stageRender(
  sheetDoc: SheetDoc,
  pageIndex: number,
  container: HTMLElement,
  onChange: () => void,
): void {
  container.textContent = "";
  stage = null;
  // window에 단 이전 렌더링의 드래그 리스너가 쌓이지 않게 정리한다.
  stageAbort?.abort();
  stageAbort = new AbortController();

  const scale = Math.min(
    (container.clientWidth - 24) / DESIGN_W,
    (container.clientHeight - 24) / DESIGN_H,
  );

  // transform은 레이아웃 크기를 바꾸지 않으므로, 축소된 크기의 sizer가 중앙 배치를 맡는다.
  const sizer = document.createElement("div");
  sizer.style.cssText = `width:${DESIGN_W * scale}px;height:${DESIGN_H * scale}px;position:relative`;
  const host = document.createElement("div");
  host.style.cssText = `width:${DESIGN_W}px;height:${DESIGN_H}px;transform:scale(${scale});transform-origin:0 0;position:absolute;left:0;top:0`;
  sizer.appendChild(host);
  container.appendChild(sizer);

  const page = sheetDoc.pages[pageIndex];
  const root = buildCanvas(host, extractCanvasCss(sheetDoc.shellHtml), STAGE_CSS);
  const canvas = root.querySelector(".ppte-canvas") as HTMLElement;

  const pageEl = document.createElement("section");
  pageEl.setAttribute("class", page.cls);
  pageEl.innerHTML = pageInnerHtml(page);
  canvas.appendChild(pageEl);

  const handle = document.createElement("div");
  handle.id = "ppte-handle";
  handle.hidden = true;
  pageEl.appendChild(handle);

  stage = { root, pageEl, handle, selected: null, scale, page, onChange };
  bindStageEvents(page, onChange);
}

/**
 * 진행 중인 텍스트 편집을 모델에 커밋한다.
 * 스테이지 밖 조작(페이지 전환, export, 저장) 전에 불러 편집 유실을 막는다.
 */
function stageFlush(): void {
  if (!stage) return;
  commitTextEdit(stage.page, stage.onChange);
}

/** wrapper(.ppte-obj)의 data-oid로 모델 객체를 찾는다. */
function findObject(page: SheetPage, wrapper: HTMLElement): SheetObject | null {
  const oid = wrapper.getAttribute("data-oid");
  return page.objects.find((o) => o.id === oid) ?? null;
}

/** 선택된 wrapper의 오른쪽 아래에 리사이즈 핸들을 붙인다. 좌표는 논리 px다. */
function syncHandle(): void {
  if (!stage) return;
  const { handle, selected, pageEl, scale } = stage;
  if (!selected) {
    handle.hidden = true;
    return;
  }
  const r = selected.getBoundingClientRect();
  const p = pageEl.getBoundingClientRect();
  handle.style.left = `${(r.right - p.left) / scale - 7}px`;
  handle.style.top = `${(r.bottom - p.top) / scale - 7}px`;
  handle.hidden = false;
}

function selectWrapper(wrapper: HTMLElement | null): void {
  if (!stage) return;
  if (stage.selected && stage.selected !== wrapper) {
    stage.selected.classList.remove("sel");
  }
  stage.selected = wrapper;
  wrapper?.classList.add("sel");
  syncHandle();
}

/** 이벤트의 실제 대상. Shadow DOM 밖에서는 target이 host로 뭉개지므로 composedPath를 쓴다. */
function realTarget(e: Event): HTMLElement | null {
  const first = e.composedPath()[0];
  return first instanceof HTMLElement ? first : null;
}

function bindStageEvents(page: SheetPage, onChange: () => void): void {
  if (!stage || !stageAbort) return;
  const { root } = stage;
  const { signal } = stageAbort;

  // 드래그 상태. null이면 드래그 중이 아니다.
  let drag: {
    kind: "move" | "resize";
    wrapper: HTMLElement;
    obj: SheetObject;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
  } | null = null;

  root.addEventListener("mousedown", (e) => {
    if (!stage) return;
    const target = realTarget(e);
    if (!target) return;

    if (target === stage.handle && stage.selected) {
      const obj = findObject(page, stage.selected);
      if (!obj) return;
      drag = {
        kind: "resize",
        wrapper: stage.selected,
        obj,
        startX: (e as MouseEvent).clientX,
        startY: (e as MouseEvent).clientY,
        origX: obj.x,
        origY: obj.y,
        origW: obj.w,
      };
      e.preventDefault();
      return;
    }

    const wrapper = target.closest<HTMLElement>(".ppte-obj");
    if (!wrapper) {
      commitTextEdit(page, onChange);
      selectWrapper(null);
      return;
    }
    if (wrapper.hasAttribute("contenteditable")) return; // 텍스트 편집 중에는 드래그하지 않는다

    commitTextEdit(page, onChange);
    selectWrapper(wrapper);
    const obj = findObject(page, wrapper);
    if (!obj) return;
    drag = {
      kind: "move",
      wrapper,
      obj,
      startX: (e as MouseEvent).clientX,
      startY: (e as MouseEvent).clientY,
      origX: obj.x,
      origY: obj.y,
      origW: obj.w,
    };
    e.preventDefault();
  }, { signal });

  // 드래그 중 마우스가 캔버스를 벗어나도 따라가도록 window에서 듣는다.
  window.addEventListener("mousemove", (e) => {
    if (!drag || !stage) return;
    // 화면 px 이동량 → scale로 나눠 논리 px → 페이지 대비 %
    const dxPct = ((e.clientX - drag.startX) / stage.scale / DESIGN_W) * 100;
    const dyPct = ((e.clientY - drag.startY) / stage.scale / DESIGN_H) * 100;

    if (drag.kind === "move") {
      drag.obj.x = Math.round((drag.origX + dxPct) * 100) / 100;
      drag.obj.y = Math.round((drag.origY + dyPct) * 100) / 100;
      drag.wrapper.style.left = `${drag.obj.x}%`;
      drag.wrapper.style.top = `${drag.obj.y}%`;
    } else {
      drag.obj.w = Math.max(2, Math.round((drag.origW + dxPct) * 100) / 100);
      drag.wrapper.style.width = `${drag.obj.w}%`;
    }
    syncHandle();
  }, { signal });

  window.addEventListener("mouseup", () => {
    if (!drag) return;
    drag = null;
    onChange();
  }, { signal });

  // 더블클릭 → 제자리 텍스트 편집. 바깥을 클릭하면 mousedown에서 커밋된다.
  root.addEventListener("dblclick", (e) => {
    const wrapper = realTarget(e)?.closest<HTMLElement>(".ppte-obj");
    if (!wrapper) return;
    wrapper.setAttribute("contenteditable", "true");
    wrapper.classList.add("editing");
    wrapper.focus();
  }, { signal });
}

/** 편집 중인 wrapper가 있으면 contenteditable을 끝내고 내용을 모델에 커밋한다. */
function commitTextEdit(page: SheetPage, onChange: () => void): void {
  if (!stage) return;
  const wrapper = stage.pageEl.querySelector<HTMLElement>(".ppte-obj[contenteditable]");
  if (!wrapper) return;
  wrapper.removeAttribute("contenteditable");
  wrapper.classList.remove("editing");
  const obj = findObject(page, wrapper);
  if (obj && obj.html !== wrapper.innerHTML) {
    obj.html = wrapper.innerHTML;
    onChange();
  }
  syncHandle();
}
