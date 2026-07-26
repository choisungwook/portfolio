/** main 프로세스 IPC 반환 형태와 수동으로 맞추는 전역 타입 선언. */

/** 학습지 한 장 위의 객체 하나. 좌표는 슬라이드 대비 %다. */
interface SheetObject {
  id: string;
  x: number;
  y: number;
  w: number;
  /** 원본 요소의 outerHTML. 태그·클래스·내용을 그대로 담는다. */
  html: string;
}

interface SheetPage {
  /** 원본 section의 class 속성값. 예: "page cover" */
  cls: string;
  objects: SheetObject[];
}

/** 문서 모델. JSON이 진실의 원본이고 HTML은 export 산출물이다. */
interface SheetDoc {
  version: 1;
  title: string;
  /** 임포트한 학습지 원본 경로. export 기본 경로로 쓴다. */
  sourcePath: string | null;
  /** 원본 HTML에서 각 페이지 내용을 <!--PPTE:PAGE:i--> 토큰으로 바꾼 껍데기. CSS/JS를 보존한다. */
  shellHtml: string;
  pages: SheetPage[];
}

interface DocSummary {
  name: string;
  path: string;
  title: string;
  updatedAt: string;
}

interface AppInfo {
  version: string;
  storePath: string;
}

interface Window {
  api: {
    listDocs(): Promise<DocSummary[]>;
    loadDoc(name: string): Promise<SheetDoc>;
    saveDoc(name: string, doc: SheetDoc): Promise<void>;
    removeDoc(name: string): Promise<void>;
    removeAllDocs(): Promise<void>;
    importHtml(): Promise<{ path: string; html: string }[]>;
    importFolder(): Promise<{ path: string; html: string }[]>;
    exportHtml(html: string, defaultPath: string | null): Promise<string | null>;
    appInfo(): Promise<AppInfo>;
    onMenu(handler: (name: string) => void): void;
  };
}
