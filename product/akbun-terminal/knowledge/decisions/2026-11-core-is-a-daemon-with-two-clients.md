---
type: Decision
title: core는 daemon이고 desktop과 tui는 그 client다
description: core를 static library에서 socket daemon으로 옮기고, 화면을 그리는 쪽을 desktop과 tui 두 client로 둔 결정과 이유
tags: [rust, swift, architecture, protocol, akbun-terminal]
generated: { by: claude-code, at: 2026-11-15T00:00:00Z }
---

## 결정

- core는 `akbun-terminal-core` daemon이다. shell(pty), project tree, agent 상태 판정을 소유하고 화면은 그리지 않는다.
- client는 2개다. `desktop/`의 Swift AppKit 앱과 `tui/`의 ratatui 앱. 둘 다 같은 Unix socket에 같은 protocol로 붙는다.
- wire는 한 줄에 JSON 하나다. 요청은 기존 envelope `{"v":3,"command":..}` 그대로이고, 응답은 `{"reply":..}`, 이벤트는 `{"event":..}`로 감싼다.
- shell은 daemon이 소유하므로 client가 닫혀도 계속 실행된다. 다른 client는 `sessions`로 목록을 받고 `attach`로 붙는다. `attach`는 그 session의 최근 출력 256 KiB를 `replay`로 돌려준다.
- daemon은 client가 필요할 때 띄운다. 연결과 session이 모두 없는 상태가 10초 이어지면 스스로 종료한다.
- desktop은 이번 변경에서 종료할 때 자기가 연 session을 닫는 기존 동작을 유지한다.
- agent끼리의 통신은 core의 CLI가 맡는다. `run`으로 이름 붙은 shell을 띄우고 `send`로 글을 입력하고 `read`로 화면을 읽고 `wait`로 작업이 멈출 때까지 기다린다. shell은 `AKBUN_TERMINAL_SESSION`으로 자기 id를 알고, 그 안에서 띄운 shell은 자식이 된다.
- agent 목록은 `sessions` 응답에서 `agent`가 있는 항목이다. client는 걸러서 그리기만 한다.
- 상태 판정은 daemon이 2초마다 직접 한다. client의 `detect`는 그 결과를 읽는다.

## 이유

- 이전 구조는 core를 static library로 Swift 실행파일에 링크했다. shell의 수명이 창의 수명과 같아서 창을 닫으면 agent가 함께 종료됐고, SSH로 붙은 원격 머신에서는 쓸 방법이 없었다.
- protocol을 처음부터 버전 붙은 JSON envelope으로 만들어 두었기 때문에 command와 response 타입은 그대로 두고 전송 경로만 C 함수 5개에서 socket으로 바꿨다. Swift 쪽 변경은 `CoreBridge` 한 파일에 모였다.
- replay를 화면 스냅샷이 아니라 원본 바이트의 끝부분으로 둔 이유: core의 `Screen`은 상태 판정용이라 글자만 기억하고 색은 버린다. 원본 바이트를 다시 흘리면 client의 emulator가 색까지 복원한다. 잘린 지점이 escape sequence 중간일 수 있지만 attach 직후 client가 보내는 resize가 전체 화면 프로그램을 다시 그리게 한다.
- replay ring을 session의 reader thread가 아니라 이벤트를 나눠 주는 hub가 관리한다. ring 복사와 구독 등록을 같은 lock 안에서 하면 붙는 순간의 바이트가 빠지거나 두 번 전달되지 않는다.
- `detect`의 "바뀐 것만" 응답을 연결마다 따로 계산한다. 판정 기억이 전역 하나면 client 2개가 번갈아 물을 때 서로의 변화를 가져가서 한쪽 사이드바 색이 갱신되지 않는다.
- tree를 바꾼 연결 외의 연결에는 `state` 이벤트를 보낸다. 변경 응답이 요청한 쪽에만 가면 두 client의 project 목록이 달라진다.
- 출력 바이트는 여전히 JSON 배열이다. in-process일 때도 같은 인코딩을 거쳤으므로 느려지지 않았고, 바꾸면 Swift decoder까지 함께 고쳐야 해서 이번 범위에서 뺐다.

## 이유: agent 통신

- 통신을 client가 아니라 core에 둔 이유: agent는 화면 없이 shell 안에서 CLI만 실행한다. client가 닫혀 있어도 agent끼리 일을 주고받아야 하므로 창에 묶인 기능이면 안 된다.
- 자식의 상태가 바뀔 때 부모 터미널에 알림을 자동으로 입력하지 않는다. 사람이 입력하던 줄에 글이 섞이는 문제를 다루려면 입력 중 여부를 판정해야 하는데 이번 범위에서 뺐다. 자식이 `send`로 보고한다.
- `send`가 `<akbun from="3 lead">`로 감싸는 이유: 받은 agent가 사용자의 지시와 다른 agent의 글을 구분하고, 답할 대상의 id를 알아야 한다.
- `wait`는 `send` 직후 4초 동안은 idle 판정으로 끝내지 않는다. agent가 작업 표시를 화면에 그리기 전에 판정하면 `send; wait`가 바로 반환된다.
- 판정을 daemon이 직접 하는 이유: `wait`와 `ls`는 어떤 client도 `detect`를 부르지 않을 때도 최신 상태가 필요하다.

## 남은 것

- desktop이 재실행될 때 살아 있는 session에 다시 붙는 동작. `sessions`와 `attach`는 이미 있으므로 `TerminalWindowController`가 workspace별로 tab을 복원하면 된다.
- desktop이 `state` 이벤트를 받아 사이드바를 갱신하는 동작. 지금은 tui에서 바꾼 project가 desktop을 다시 열어야 표시된다.
- desktop의 agent 목록 화면. tui에만 있다.
- Windows. socket이 Unix domain이라 지원하지 않는다.
