---
type: Decision
title: 고정 논리 해상도 1280x720 + Shadow DOM 캔버스로 그린다
description: iframe 스테이지 1차 구현을 폐기하고, 슬라이드를 1280x720 논리 px에서 한 번 레이아웃한 뒤 scale/zoom으로 화면에 맞추는 Figma/PPT 방식으로 바꿨다.
tags: [editor, rendering, shadow-dom, akbun-PPTEditorFromHTML]
timestamp: 2026-07-26T00:00:00Z
---

## 결정

측정·편집·export 모두 슬라이드를 1280x720 논리 px로 레이아웃한다. 글씨 크기는 html font-size 24.48px(템플릿 공식을 1280x720에서 계산한 값)로 고정하고, 화면 표시는 에디터에서 transform: scale, export 파일에서는 주입한 fit 스크립트의 zoom으로 창에 맞춘다. 편집 스테이지와 측정은 iframe이 아니라 앱 문서 안의 Shadow DOM 캔버스에 그린다. 학습지 CSS는 html/body/:root 선택자를 .ppte-canvas로 재작성하고 @media 규칙을 제거해서 주입한다.

## 이유

- 1차 구현은 학습지 전체를 iframe(srcdoc, sandbox)에 띄우고 그 위에서 편집했다. 검증에서 근본 결함이 드러났다: 템플릿 글씨는 뷰포트 기준(min(2vw,3.4vh))인데 페이지 폭 공식에는 고정 104px 항이 있어 창 크기마다 글씨:페이지 비율이 달라진다. 좌표를 얼려 놓으면 창 크기가 바뀔 때 줄바꿈이 변해 객체가 겹쳤다. 보정 상수로 쫓아가는 건 두더지 잡기였다.
- 고정 논리 해상도는 이 문제를 부류째 없앤다. 줄바꿈·좌표가 1280x720에서 한 번 결정되면 어떤 창에서도 전체가 비율대로 커지고 작아질 뿐이다. PowerPoint 슬라이드 쇼, Figma 줌, reveal.js가 같은 원리다.
- Shadow DOM은 iframe이 주던 스타일 격리를 같은 문서 안에서 준다. 드래그·선택·contenteditable 이벤트가 문서 경계를 넘지 않아 에디터 코드가 단순해진다.
- 검증에서 잡은 함정 두 개가 이 결정의 세부를 정했다.
  - 템플릿 색 변수는 :root에 선언되는데 Shadow DOM 안에서는 :root가 매칭되지 않는다. :root/html/body를 .ppte-canvas로 재작성해야 노랑·빨강이 산다.
  - @media (max-width:640px) 모바일 규칙이 측정 시점의 창 크기에 따라 켜져 좌표를 오염시켰다(브라우저 pane이 좁게 열린 순간 padding 20px로 측정됨). 캔버스 CSS에서 media 규칙을 제거해 측정을 창 크기와 무관하게 만들었다.
- rem은 Shadow DOM 안에서도 문서 root 기준이라, 앱 문서 root font-size를 24.48px로 고정한다(pinRootFontSize). 앱 UI CSS는 px만 쓰므로 부작용이 없다.
- 대가: 원본 템플릿의 17px 하한·40px 상한, 좁은 화면 세로 읽기 모드, 인쇄 펼침이 사라진다. 편집된 학습지는 16:9 슬라이드 전용이다.
