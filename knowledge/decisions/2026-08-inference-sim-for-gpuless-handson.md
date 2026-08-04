---
type: Decision
title: GPU 없는 환경의 추론 인프라 핸즈온은 simulator를 model server 자리에 넣는다
description: llm-d 같은 추론 라우팅 계층을 배울 때 GPU를 조달하지 않고 inference simulator로 model server를 대체하기로 한 결정과 그 한계.
tags: [kubernetes, ai, handson, llmd]
timestamp: 2026-08-04T00:00:00Z
---

## 결정

추론 인프라 계층(라우팅, 스케줄링, 오토스케일링)을 배우는 핸즈온에서는 model server 자리에 simulator를 넣는다. GPU는 그 계층이 아니라 그 아래 계층을 배울 때 조달한다.

llm-d quickstart 핸즈온의 경우 맥 kind 클러스터에 llm-d-inference-sim을 4 replica로 띄우고, GPU 1장짜리 노드에는 실제 vLLM을 2 replica로 띄워 두 문서로 나눈다.

## 이유

배우려는 대상이 요청을 어디로 보내는가일 때, 그 판단의 입력은 pod의 큐 길이와 KV cache 사용률과 prefix 이력이다. simulator가 vLLM의 OpenAI API와 Prometheus 메트릭 이름을 그대로 내보내면 라우터 입장에서 진짜와 구분되지 않는다.

반대로 GPU를 넣으면 배우려는 것과 무관한 비용이 앞에 붙는다. 모델 가중치 다운로드, CUDA graph capture, GPU 메모리 배분이 실패 지점이 되고, 라우팅 동작을 보기 전에 지친다.

결정적으로 라우팅은 replica가 여러 개여야 관찰된다. GPU 1장으로 replica를 2개 이상 만들려면 time-slicing이 필요하고, time-slicing은 시간만 나누고 메모리는 나누지 않아서 vLLM의 gpu-memory-utilization을 손으로 낮춰야 한다. simulator는 이 제약 자체가 없다.

## 한계

simulator로 확인되지 않는 것을 문서에 명시하고, 그 부분은 GPU 환경으로 넘긴다.

- 추론 품질과 실제 토큰 처리량. simulator의 응답은 미리 정의된 문장이다.
- 실제 KV cache의 eviction. simulator를 쓰든 안 쓰든 근사 prefix scorer는 추정만 하지만, 추정이 언제 틀리는지는 실제 엔진에서만 보인다.
- GPU 메모리 압력에서 오는 장애. OOM으로 replica가 죽는 상황은 simulator에서 재현되지 않는다.
