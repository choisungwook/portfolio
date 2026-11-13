---
type: Decision
title: AI 제품의 브라우저 접근 경로는 설치 파일로 확인한다
description: Claude desktop, Claude in Chrome, Codex의 CDP 사용 여부를 문서 대신 확장 manifest, Native Messaging host, app.asar 문자열로 검증한다.
tags: [cdp, chrome-extension, native-messaging, electron]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-14T00:00:00Z }
sources:
  - id: chrome136
    resource: https://developer.chrome.com/blog/remote-debugging-port
    title: Changes to remote debugging switches to improve security
---

# AI 제품의 브라우저 접근 경로는 설치 파일로 확인한다

## 결정

시나리오 2는 제품 동작을 관찰하는 대신 로컬에 설치된 파일을 읽어 검증한다. 확장 manifest의 `debugger`·`nativeMessaging` 권한, 확장 번들 안의 `chrome.debugger.sendCommand`와 CDP 메서드 문자열, `NativeMessagingHosts` 등록 파일, Claude.app `app.asar`의 `webContents.debugger` 호출이 근거다. Aside와 Codex 데스크톱 앱은 설치하지 않았으므로 2차 자료로만 쓰고 문서에 미검증이라고 적는다.

## 이유

제품 공식 문서는 "브라우저를 조작한다"까지만 말하고 transport를 밝히지 않는다. 설치 파일은 누구나 같은 명령으로 재현할 수 있고 버전이 바뀌어도 같은 방법으로 다시 확인할 수 있다. 실습 Chrome은 Chrome 136부터 기본 프로필에서 `--remote-debugging-port`가 무시되므로[^chrome136] `--user-data-dir`로 분리하고, Playwright는 `connect_over_cdp`로 같은 Chrome에 붙여 `playwright install` 없이 raw CDP와 같은 조건에서 명령 수를 비교한다.

[^chrome136]: Chrome 136 원격 디버깅 스위치 변경.
