---
type: Topic
title: graphify CLI의 입력과 출력 형태
description: 스크립트에서 graphify를 호출할 때 필요한 명령 순서, 출력 경로, LLM 의존 여부
tags: [graphify, wiki, llm]
timestamp: 2026-09-09T00:00:00Z
---

## 확인한 사실

- PyPI 패키지는 graphifyy, 실행 파일은 graphify (uv tool install graphifyy)
- graphify extract <dir>는 <dir>/graphify-out/graph.json·manifest.json·cache/를 씀
- --code-only는 markdown을 건너뜀; markdown 추출은 --backend 또는 API 키 환경변수 필요
- graphify export wiki --graph <graph.json>은 graph.json 옆 wiki/에 index.md와 community별 article을 씀
- export wiki는 .graphify_analysis.json이 없으면 거부, 즉 extract가 클러스터링까지 끝나야 함
- extract는 파일 manifest로 증분 처리, --force로 전체 재추출

## 영향

- 빌드는 extract → export wiki 두 단계 고정, 중간 산출물 위치는 raw 디렉터리 기준으로 계산
- LLM 키 없이 통과하는 테스트는 runner를 가짜로 바꿔야 함
