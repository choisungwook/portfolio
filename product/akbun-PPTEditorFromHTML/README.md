# akbun-PPTEditorFromHTML

akbun-studysheet HTML 학습지를 PowerPoint처럼 편집하는 macOS 데스크톱 앱이다. 학습지를 한 번 임포트하면 모든 요소를 드래그 이동·리사이즈·제자리 텍스트 편집할 수 있고, 편집 결과를 퀴즈·페이지 넘김이 살아 있는 학습지 HTML로 다시 내보낸다.

## 동작 방식

- 임포트: 학습지 HTML을 파싱·렌더링해 요소 좌표를 재고 JSON 모델로 바꾼다. 이후 진실의 원본은 ~/Documents/akbun-PPTEditorFromHTML/의 JSON이다.
- 편집: 고정 1280x720 논리 해상도 캔버스에서 PPT처럼 조작한다. 편집은 자동 저장된다.
- 내보내기: 원본의 CSS/JS를 보존한 채 절대좌표 레이아웃으로 학습지 HTML을 생성한다. 브라우저만 있으면 열린다.

## 실행

개발 실행과 패키징 명령이다.

```bash
npm install
npm start       # 개발 실행
npm run dist    # release/에 arm64 dmg 생성
```

설치한 dmg가 무서명이라 처음 실행이 막히면 quarantine 속성을 지운다.

```bash
xattr -cr /Applications/akbun-PPTEditorFromHTML.app
```

## 문서

- 개발 규칙·로드맵: [AGENTS.md](./AGENTS.md)
- 구조: [wiki/architecture.md](./wiki/architecture.md)
- 의사결정: [knowledge/decisions/](./knowledge/decisions/index.md)
