# YouTube Shadowing Tool

## 요약

- **한국인 영어 학습자를 위한 YouTube 쉐도잉 웹앱**이다.
- YouTube 영상 URL을 입력하면 쉐도잉에 최적화된 플레이어가 나온다.
- 속도 조절, 되감기, 앞으로가기 등 쉐도잉에 필요한 컨트롤을 제공한다.
- 브라우저 MediaRecorder API로 마이크 녹음 및 재생이 가능하다. 백엔드 없이 동작한다.
- 순수 HTML/JS/CSS로 구현하고, Cloudflare Pages에 배포한다.
- 배포 도메인: `learnenglish.akbun.com`

## 목차

- [기술 스택](#기술-스택)
- [주요 기능](#주요-기능)
- [파일 구조](#파일-구조)
- [화면 구성](#화면-구성)
- [녹음 기능 구현 방식](#녹음-기능-구현-방식)
- [배포 가이드](#배포-가이드)

## 기술 스택

| 항목 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | 순수 HTML/JS/CSS | 빌드 과정 없이 Cloudflare Pages에 바로 배포 가능 |
| 영상 재생 | YouTube IFrame Player API | 공식 API로 속도/시간 제어 가능 |
| 녹음 | MediaRecorder API | 모든 모던 브라우저 지원, 백엔드 불필요 |
| 배포 | Cloudflare Pages | 무료, 커스텀 도메인 지원 |

## 주요 기능

### 1. YouTube 영상 입력

- 메인 화면에서 YouTube URL을 입력한다.
- URL에서 video ID를 추출하여 영상을 로드한다.
- 지원 URL 형식: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/embed/`

### 2. 쉐도잉 플레이어

쉐도잉에 필요한 컨트롤을 제공한다.

- **재생/일시정지**: 토글 버튼
- **속도 조절**: 0.25x ~ 2.0x (0.25 단위)
- **되감기**: 1초, 3초, 5초, 10초 뒤로
- **앞으로가기**: 1초, 3초, 5초, 10초 앞으로
- **키보드 단축키**: Space(재생/정지), 화살표(되감기/앞으로), +/-(속도조절)

### 3. 마이크 녹음 및 재생

- 녹음 시작 버튼을 누르면 마이크 권한을 요청한다.
- **영상 재생과 동시에 녹음**이 가능하다. 쉐도잉하면서 자신의 목소리를 녹음한다.
- 녹음 완료 후 즉시 재생할 수 있다.
- 녹음 파일 다운로드 기능을 제공한다.
- 녹음 목록을 화면에 표시하여 여러 번 녹음하고 비교할 수 있다.

### 4. 상단 네비게이션

- **영상 입력하기** 버튼: 클릭하면 메인 화면으로 돌아가 새 영상을 입력할 수 있다.

## 파일 구조

```
youtube-shadowing/
├── index.html          # 메인 페이지 (SPA)
├── css/
│   └── style.css       # 스타일
├── js/
│   ├── app.js          # 앱 초기화, 라우팅
│   ├── player.js       # YouTube IFrame API 제어
│   └── recorder.js     # MediaRecorder 녹음/재생
└── plan.md             # 프로젝트 계획
```

## 화면 구성

### 메인 화면 (영상 입력)

```
┌─────────────────────────────────┐
│  🎧 YouTube Shadowing    [영상 입력하기] │
├─────────────────────────────────┤
│                                 │
│     YouTube 영상으로 영어 쉐도잉      │
│                                 │
│  ┌───────────────────┐ [시작]    │
│  │ YouTube URL 입력    │          │
│  └───────────────────┘          │
│                                 │
└─────────────────────────────────┘
```

### 쉐도잉 화면

```
┌─────────────────────────────────┐
│  🎧 YouTube Shadowing    [영상 입력하기] │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │                           │  │
│  │     YouTube Player        │  │
│  │                           │  │
│  └───────────────────────────┘  │
│                                 │
│  ◀◀10  ◀◀5  ◀◀3  ◀◀1  ▶/⏸  1▶▶  3▶▶  5▶▶  10▶▶ │
│                                 │
│  속도: [0.5x] [0.75x] [1x] [1.25x] [1.5x]       │
│                                 │
│  ── 녹음 ──────────────────────  │
│  [🎤 녹음 시작]  [⏹ 정지]          │
│                                 │
│  녹음 1: [▶ 재생] [⬇ 다운로드]     │
│  녹음 2: [▶ 재생] [⬇ 다운로드]     │
└─────────────────────────────────┘
```

## 녹음 기능 구현 방식

브라우저 MediaRecorder API를 사용하면 백엔드 없이 녹음이 가능하다.

**동작 원리:**

1. `navigator.mediaDevices.getUserMedia({ audio: true })`로 마이크 권한 요청
2. `MediaRecorder`로 오디오 스트림 녹음
3. 녹음 데이터는 `Blob` 객체로 브라우저 메모리에 저장
4. `URL.createObjectURL(blob)`로 재생 URL 생성
5. `<audio>` 태그로 재생, `<a download>`로 다운로드

**제약사항:**

- 녹음 파일은 브라우저 메모리에만 존재한다. 페이지를 닫으면 사라진다.
- HTTPS 환경에서만 마이크 접근이 가능하다. Cloudflare Pages는 기본 HTTPS이므로 문제없다.
- 모바일 브라우저에서도 동작하지만, iOS Safari는 일부 제약이 있을 수 있다.

## 배포 가이드

Cloudflare Pages 콘솔에서 직접 배포하는 방법이다.

### 1. Cloudflare Dashboard 접속

1. [Cloudflare Dashboard](https://dash.cloudflare.com) 로그인
2. 좌측 메뉴에서 **Workers & Pages** 클릭
3. **Create** 버튼 클릭
4. **Pages** 탭 선택

### 2. 프로젝트 연결

**방법 A: Git 연결 (추천)**

1. **Connect to Git** 선택
2. GitHub 계정 연결 후 해당 repository 선택
3. 빌드 설정:
   - **Production branch**: `main`
   - **Build command**: 비워둔다 (빌드 불필요)
   - **Build output directory**: `product/youtube-shadowing`
4. **Save and Deploy** 클릭

**방법 B: Direct Upload**

1. **Upload assets** 선택
2. 프로젝트 이름 입력: `youtube-shadowing`
3. `youtube-shadowing/` 디렉터리의 파일들을 드래그앤드롭으로 업로드
4. **Deploy site** 클릭

### 3. 커스텀 도메인 설정

1. Pages 프로젝트 → **Custom domains** 탭
2. **Set up a custom domain** 클릭
3. `learnenglish.akbun.com` 입력
4. Cloudflare에 `akbun.com` 도메인이 이미 등록되어 있으므로, CNAME 레코드가 자동 생성된다
5. DNS 전파 후 HTTPS가 자동 활성화된다

## 참고자료

- https://developers.google.com/youtube/iframe_api_reference
- https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- https://developers.cloudflare.com/pages
