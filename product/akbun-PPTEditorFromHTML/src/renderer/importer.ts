/**
 * 학습지 HTML 원문을 SheetDoc 모델로 바꾼다. iframe을 쓰지 않는다.
 * DOMParser(스크립트가 실행되지 않는 파서)로 구조를 읽고, Shadow DOM 캔버스에
 * 고정 논리 해상도(1280x720)로 렌더링해 요소 좌표를 잰다.
 * 임포트는 최초 1회만 일어나고, 이후 진실의 원본은 JSON 모델이다.
 * 배경은 knowledge/decisions/2026-07-import-measure-freeze.md 참조.
 */

/**
 * 고정 논리 해상도. 글씨 크기·줄바꿈·좌표가 전부 이 해상도에서 한 번 결정되고,
 * 화면 표시는 전체를 scale로 키우고 줄인다(PPT 슬라이드 쇼와 같은 원리).
 * 창 크기에 따라 줄바꿈이 변해 얼린 좌표와 어긋나는 문제를 근본에서 없앤다.
 */
const DESIGN_W = 1280;
const DESIGN_H = 720;
/** 템플릿 font 공식 clamp(17px,min(2vw,3.4vh),40px)을 1280x720에서 계산한 값. */
const DESIGN_FONT = "24.48px";

/** export 시 페이지를 고정 해상도 절대좌표 캔버스로 바꾸는 주입 CSS. */
const PPTE_LAYOUT_CSS = `
/* akbun-PPTEditorFromHTML가 주입한 절대좌표 레이아웃 */
html{font-size:${DESIGN_FONT}}
#book{width:${DESIGN_W}px;padding:0;margin:0 auto}
.page{position:relative;padding:0;width:${DESIGN_W}px;height:${DESIGN_H}px;aspect-ratio:auto}
.page.cover{padding:0}
.page.cover.on{display:block}
.ppte-obj{position:absolute;margin:0}
.ppte-obj>*{margin:0}
`;

/** export 시 주입하는 화면 맞춤 스크립트. 고정 해상도 슬라이드를 창 크기에 맞게 zoom한다. */
const PPTE_FIT_SCRIPT = `
(function(){
  var book=document.getElementById('book');
  if(!book)return;
  function fit(){
    var nav=document.getElementById('nav');
    var navH=nav?nav.offsetHeight:0;
    var s=Math.min(window.innerWidth*0.97/${DESIGN_W},(window.innerHeight-navH-24)/${DESIGN_H});
    book.style.zoom=String(s);
  }
  window.addEventListener('resize',fit);
  fit();
})();
`;

/**
 * 측정·편집 캔버스가 재현하는 "학습지 초기 화면" 상태.
 * 페이지 넘김 JS가 없는 환경이므로 페이지를 펼치고, 표지의 세로 중앙 정렬(flex)과
 * stepper 1단계 표시(런타임 초기 상태)를 CSS로 재현한다.
 */
const CANVAS_STATE_CSS = `
.page{display:block !important;width:${DESIGN_W}px;height:${DESIGN_H}px;aspect-ratio:auto}
.page.cover{display:flex !important;flex-direction:column;justify-content:center}
.stepper .step:first-child{display:block !important}
`;

function pageToken(index: number): string {
  return `<!--PPTE:PAGE:${index}-->`;
}

/** 소수 둘째 자리 %로 반올림한다. */
function toPct(value: number, base: number): number {
  return Math.round((value / base) * 10000) / 100;
}

/**
 * 뷰포트 크기에 반응하는 @media 규칙(좁은 화면 세로 모드, 인쇄)을 제거한다.
 * 측정과 스테이지는 고정 논리 해상도로 그려야 하는데, 창 크기에 따라 media 규칙이
 * 켜지면 좌표가 창 크기의 함수가 되어 버린다.
 */
function stripMediaRules(css: string): string {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  return Array.from(sheet.cssRules)
    .filter((rule) => !(rule instanceof CSSMediaRule))
    .map((rule) => rule.cssText)
    .join("\n");
}

/**
 * 파싱된 학습지 문서에서 캔버스용 CSS를 뽑는다.
 * html/body/:root 선택자는 Shadow DOM 안에 대응 요소가 없어 .ppte-canvas로 바꾼다.
 * (:root에는 색 변수가 선언되어 있어 바꾸지 않으면 노랑·빨강이 전부 사라진다.)
 */
function collectCanvasCss(doc: Document): string {
  const css = Array.from(doc.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n")
    .replace(/:root\b/g, ".ppte-canvas")
    .replace(/\bhtml\b/g, ".ppte-canvas")
    .replace(/\bbody\b/g, ".ppte-canvas");
  return stripMediaRules(css);
}

/** shell(원본 head의 style 포함)에서 캔버스용 CSS를 뽑는다. DOMParser는 스크립트를 실행하지 않는다. */
function extractCanvasCss(shellHtml: string): string {
  return collectCanvasCss(new DOMParser().parseFromString(shellHtml, "text/html"));
}

/**
 * 학습지 스타일이 적용된 Shadow DOM 캔버스를 만든다.
 * 측정(임포트)과 편집 스테이지가 같은 캔버스를 쓴다 — 같은 렌더링이어야 WYSIWYG다.
 * 반환된 root 안의 .ppte-canvas 아래에 페이지를 넣는다.
 */
function buildCanvas(host: HTMLElement, templateCss: string, extraCss: string): ShadowRoot {
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  root.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = templateCss + "\n" + CANVAS_STATE_CSS + "\n" + extraCss;
  root.appendChild(style);
  const canvas = document.createElement("div");
  canvas.className = "ppte-canvas";
  canvas.style.width = `${DESIGN_W}px`;
  root.appendChild(canvas);
  return root;
}

/** rem이 논리 해상도 기준으로 풀리도록 문서 root 글씨 크기를 고정한다. 앱 UI는 px만 쓴다. */
function pinRootFontSize(): void {
  document.documentElement.style.fontSize = DESIGN_FONT;
}

function importStudysheet(html: string, sourcePath: string | null): SheetDoc {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const sections = Array.from(parsed.querySelectorAll("section.page"));
  if (sections.length === 0) {
    throw new Error("section.page가 없다. akbun-studysheet HTML이 아니다");
  }

  const templateCss = collectCanvasCss(parsed);

  // 오프스크린 캔버스에 원본 flow 레이아웃 그대로 그려서 좌표를 잰다.
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${DESIGN_W}px`;
  document.body.appendChild(host);
  try {
    const root = buildCanvas(host, templateCss, "");
    const canvas = root.querySelector(".ppte-canvas") as HTMLElement;
    const liveSections = sections.map((section) => {
      const live = document.importNode(section, true);
      canvas.appendChild(live);
      return live;
    });

    const pages: SheetPage[] = liveSections.map((section) => {
      const pageRect = section.getBoundingClientRect();
      const objects: SheetObject[] = Array.from(section.children).map((child, k) => {
        const r = child.getBoundingClientRect();
        return {
          id: `o${k}`,
          x: toPct(r.left - pageRect.left, pageRect.width),
          y: toPct(r.top - pageRect.top, pageRect.height),
          w: toPct(r.width, pageRect.width),
          html: child.outerHTML,
        };
      });
      return { cls: section.getAttribute("class") ?? "page", objects };
    });

    // 페이지 내용을 토큰으로 바꾸고 레이아웃 CSS·화면 맞춤 스크립트를 붙여 껍데기를 만든다.
    // 원본의 style/script/nav가 그대로 남아 export 결과에서 인터랙션이 동작한다.
    sections.forEach((section, i) => {
      section.innerHTML = pageToken(i);
    });
    const layoutStyle = parsed.createElement("style");
    layoutStyle.textContent = PPTE_LAYOUT_CSS;
    parsed.head.appendChild(layoutStyle);
    const fitScript = parsed.createElement("script");
    fitScript.textContent = PPTE_FIT_SCRIPT;
    parsed.body.appendChild(fitScript);
    const shellHtml = "<!DOCTYPE html>\n" + parsed.documentElement.outerHTML;

    return {
      version: 1,
      title: parsed.title || "제목 없는 학습지",
      sourcePath,
      shellHtml,
      pages,
    };
  } finally {
    host.remove();
  }
}
