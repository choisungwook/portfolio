---
type: Playbook
title: 분석 기능 추가 절차
description: core 분석 함수부터 IPC, 렌더러 탭까지 새 분석 기능을 추가하는 순서.
tags: [electron, workflow]
timestamp: 2026-07-18T00:00:00Z
---

## 절차

1. **core에 순수 함수를 추가한다.** src/core/analyzer.ts에 HeapSnapshot을 입력받는 함수를 만든다. Electron API를 import하지 않는다.
2. **합성 덤프를 보강한다.** 새 기능이 검증할 힙 구조가 src/tools/synthetic.ts에 없으면 레코드를 추가한다.
3. **vitest 테스트를 쓴다.** tests/analyzer.test.ts에 buildSample() 기반 테스트를 추가한다.
4. **CLI 리포트에 반영할지 판단한다.** 리포트에 넣을 기능이면 src/core/report.ts에 섹션을 추가한다.
5. **IPC를 연결한다.** src/main/main.ts에 ipcMain.handle 핸들러를 등록하고, 반환 객체는 JSON 직렬화 가능한 DTO로 만든다. src/main/preload.ts에 브리지 메서드를 추가한다.
6. **렌더러 타입과 UI를 갱신한다.** src/renderer/api.d.ts에 DTO 타입을 선언하고(5번의 반환 형태와 수동으로 맞춘다), static/index.html에 탭·패널을, src/renderer/renderer.ts에 렌더링 로직을 추가한다. renderer에서 import/export를 쓰면 안 된다.
7. **검증한다.** 아래 명령이 모두 통과해야 한다.

```bash
npm run build && npm test
node dist/tools/make-sample.js sample.hprof && node dist/cli.js sample.hprof
```

GUI 동작 확인이 필요하면 로컬 데스크톱 환경에서 npm start로 띄운다. 원격 컨테이너에서는 Electron 바이너리를 받을 수 없으므로 CI(PR 또는 workflow_dispatch)로 패키징까지 검증한다.
