---
type: Decision
title: 로컬 스택 구성과 도구 버전 고정
description: 호스트 Ollama(Metal), LiteLLM v1.110.2, 요청 로그용 PostgreSQL과 벤치마크 도구를 선택한 이유를 기록한다.
tags: [litellm, ollama, k6, xk6-sse, aiperf, guidellm]
generated: { by: codex/gpt-6, at: 2026-11-22T12:13:40+09:00 }
---

## 결정

1. Ollama(`qwen2.5:1.5b`)는 Docker 컨테이너가 아니라 호스트 macOS에서 실행하고, LiteLLM Proxy 컨테이너가 `host.docker.internal:11434`로 호출한다.
2. LiteLLM Proxy Docker 이미지는 `ghcr.io/berriai/litellm:v1.110.2` 고정 태그를 사용한다.
3. `xk6-sse` 빌드는 `k6 v0.54.0` + `github.com/phymbert/xk6-sse@v0.1.3` 조합으로 고정한다.
4. LLM 전용 벤치마크 도구는 LLMPerf 대신 NVIDIA AIPerf(`v0.13.0`)와 GuideLLM(`v0.8.1`)을 사용한다.
5. PostgreSQL을 같은 Compose 프로젝트에서 기동해 LiteLLM Admin UI에 요청 로그를 제공한다. 비교 스크립트는 응답 모드를 태그로 붙이고 Call ID를 출력한다.

## 이유

1. macOS Docker Desktop 컨테이너 안에서는 Apple Silicon Metal GPU 가속을 쓰지 못해 추론 속도가 급감한다. 호스트 Ollama를 쓰면 초당 50토큰 이상으로 빠르게 재현할 수 있다.
2. 2026년 10월 LiteLLM 공급망 사고(`v1.107.0` 및 당시 floating 태그) 이후 키 로테이션과 서명 검증이 적용된 `v1.110.x` 고정 태그를 써야 안전하다.
3. `xk6 build --with github.com/phymbert/xk6-sse@latest`는 최신 k6 코어(`v1.8.x`)와 `xk6-sse@v0.2.0`(`go.k6.io/k6/v2`) 간 API 충돌로 컴파일이 실패한다.
4. LLMPerf 저장소는 아카이브(Archived)되어 지원이 중단되었으며, 현역 표준인 AIPerf와 GuideLLM은 `uvx`만으로 별도 환경 오염 없이 macOS에서 즉시 실행된다.
5. 두 응답 모드가 URL과 모델 별칭을 공유하므로 요청 태그로 분류하고 Call ID로 클라이언트 측정값을 개별 로그와 연결한다. 태그를 쓰면 요청과 응답 본문을 DB에 저장하지 않고도 두 요청을 식별할 수 있다.
