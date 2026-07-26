---
type: Decision
title: Kubernetes client 라이브러리 대신 kubectl 직접 실행
description: 클러스터 조회를 client 라이브러리가 아닌 kubectl 명령 실행으로 구현하고 명령을 설정으로 바꿀 수 있게 한다.
tags: [kubernetes, electron]
timestamp: 2026-07-25T00:00:00Z
---

## 결정

노드/파드 조회는 kubectl 명령을 execFile로 직접 실행해 `-o json` 출력을 파싱한다. 실행할 명령 문자열은 Settings에서 바꿀 수 있으며 기본값은 kubectl이다. 명령은 공백으로 분리해 shell 없이 실행한다.

## 이유

- teleport 같은 proxy 환경에서는 kubectl 앞에 다른 명령(tsh kubectl)을 감싸야 한다. client 라이브러리는 kubeconfig를 직접 읽으므로 이런 wrapper를 지원하기 어렵지만, 명령 실행 방식은 문자열 하나만 바꾸면 된다.
- 사용자가 이미 kubectl로 인증을 맞춰 둔 환경을 그대로 재사용한다. exec plugin, SSO 등 인증 방식을 앱이 따로 구현할 필요가 없다.
- shell을 거치지 않고 execFile로 실행해 설정 문자열에 의한 command injection을 차단한다.
