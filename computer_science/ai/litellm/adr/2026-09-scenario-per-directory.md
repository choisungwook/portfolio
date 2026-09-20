---
type: Decision
title: 실습 환경을 시나리오별 디렉터리로 나눈다
description: install/ 두 종을 scenarios/ 아래 시나리오별 독립 환경으로 바꾸고 compose project 이름과 host port를 시나리오마다 다르게 둔다
tags: [litellm, docker-compose, workspace]
timestamp: 2026-09-20T00:00:00Z
---

## 결정

- `install/`을 `scenarios/`로 바꾸고 시나리오마다 디렉터리 하나를 둔다. 디렉터리는 자기 compose 파일, config, `.env.example`, 필요하면 자기 `docs/`와 `scripts/`를 갖는다.
- compose 파일 맨 위에 `name:`을 명시해 project 이름을 고정한다. set-model은 `litellm-set-model`, manual은 `litellm-manual`, bedrock-cost는 `litellm-bedrock-cost`다.
- host port를 시나리오마다 다르게 준다. 4000, 4010, 4020이고 컨테이너 안쪽은 모두 4000이다.
- 목록과 port 표는 `scenarios/README.md` 하나에 둔다. 시나리오를 추가하면 그 표에 한 줄 더한다.

## 이유

- 시나리오가 셋으로 늘면서 host port 4000이 겹쳤다. 하나를 띄운 채로 다른 하나를 올리면 포트 충돌로 뜨지 않는다.
- compose project 이름의 기본값은 디렉터리 이름이다. 볼륨 이름이 거기서 파생되므로 디렉터리를 옮기거나 이름을 바꾸면 기존 볼륨과 연결이 끊긴다. `name:`을 명시하면 디렉터리 위치와 무관해진다.
- bedrock-cost는 비용 측정이 목적이라 다른 시나리오의 요청이 같은 spend log에 섞이면 안 된다. DB를 공유하지 않는 것이 이 시나리오의 전제다.

## Citations

1. [scenarios/README.md](../scenarios/README.md)
2. [adr/2026-09-bedrock-cost-lab-fixtures.md](2026-09-bedrock-cost-lab-fixtures.md)
