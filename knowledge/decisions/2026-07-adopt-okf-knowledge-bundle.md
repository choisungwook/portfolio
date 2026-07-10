---
type: Decision
title: OKF 기반 knowledge 번들 도입
description: agent가 축적하는 지식을 Google이 제안한 Open Knowledge Format 0.1로 기록하기로 했다.
tags: [agent, okf, knowledge]
timestamp: 2026-07-10T00:00:00Z
---

## 결정

agent가 작업하며 얻은 의사결정, 반복 절차, 도메인 통찰을 `knowledge/` 디렉터리에 OKF 0.1 형식으로 기록한다. 별도 도구나 플랫폼 없이 markdown + YAML frontmatter만 사용한다. 스펙 원문은 [OKF v0.1 스펙 사본](../references/okf-spec-0.1.md)으로 저장소 안에 보관해 외부 fetch 없이 참조한다.

## 이유

- 이 저장소는 3년 넘게 운영했고 앞으로도 계속 운영한다. 지식 형식은 도구 수명보다 오래 가야 하므로, 특정 벤더나 SDK에 묶이지 않는 "그냥 markdown, 그냥 파일" 형식이 장기 운영에 적합하다.
- 기존 워크플로우(git, PR, Issue ADR)와 같은 버전 관리 흐름 안에서 지식을 diff·리뷰할 수 있다.
- OKF는 필수 필드가 `type` 하나뿐이라 기록 부담이 낮고, frontmatter와 cross-link만으로 agent가 지식을 탐색(progressive disclosure)할 수 있다.

## Citations

[1] [How the open Knowledge format can improve data sharing - Google Cloud Blog](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)
[2] [OKF v0.1 스펙 사본](../references/okf-spec-0.1.md)
