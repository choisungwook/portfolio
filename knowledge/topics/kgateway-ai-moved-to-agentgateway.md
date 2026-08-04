---
type: Topic
title: kgateway의 AI·추론 라우팅은 Envoy data plane을 떠나 agentgateway로 갔다
description: kgateway 문서를 따라 하다 InferencePool이 아무 일도 하지 않는 이유와, 버전으로 판정하는 방법.
tags: [kubernetes, kgateway, gateway-api, ai]
timestamp: 2026-08-04T00:00:00Z
---

## 문제

kgateway로 LLM 트래픽을 다루려고 검색하면 `--set inferenceExtension.enabled=true`로 설치하고 InferencePool을 만들라는 글이 먼저 나온다. v2.4에서 그대로 따라 하면 helm은 성공하고 InferencePool도 apply되지만 아무 일도 일어나지 않는다. 오류가 없어서 설정이 틀렸다고 의심하게 되는데, 사실은 기능 자체가 그 자리에 없다.

## 무슨 일이 있었나

kgateway는 data plane을 두 갈래로 나눴다. Envoy는 API gateway 용도로 남기고, AI·MCP·추론 연결은 agentgateway가 맡는다. v2.1에서 Envoy 기반 AI Gateway와 Envoy 기반 Inference Extension을 deprecated로 표시했고 v2.2에서 제거를 예고했다. 그 결과 문서는 `/docs/envoy/`와 `/docs/agentgateway/`로 갈라졌고, 검색이 물어다 주는 글은 대개 갈라지기 전 것이다.

Gateway API Inference Extension 쪽 getting started도 이 변화를 반영했다. 구현체 탭에 kgateway가 없고 GKE, Istio, agentgateway, NGINX Gateway Fabric만 남아 있다.

## 설치본으로 판정하는 방법

문서를 믿기 전에 chart를 본다. 두 가지면 갈린다.

- `helm show values oci://cr.kgateway.dev/kgateway-dev/charts/kgateway --version <버전>`에 `inferenceExtension` 키가 있는가. v2.4.2에는 없다.
- control plane의 ClusterRole에 `inference.networking.k8s.io` apiGroup이 있는가. 없으면 InferencePool을 읽을 권한조차 없다는 뜻이라 논쟁의 여지가 없다.

같은 방법이 GatewayClass에도 통한다. v2.4.2 chart가 만드는 클래스는 `kgateway`와 `kgateway-waypoint` 둘뿐이라 `agentgateway` 클래스를 기대하는 문서는 그 시점 것이 아니다.

이 판정은 kgateway에만 쓰는 요령이 아니다. control plane이 어떤 CRD를 읽는지는 ClusterRole에 다 적혀 있어서, "이 버전이 이 리소스를 처리하는가"는 문서보다 RBAC이 정확하다.

## 그래서 어떻게 하는가

GPU가 한 장인 실습 환경이라면 InferencePool을 억지로 붙일 이유가 없다. 고를 대상이 하나뿐이라 KV 캐시 적중이나 GPU 사용률로 고르는 라우팅이 줄 것이 없다. 표준 HTTPRoute로 백엔드를 붙이고, 생성 트래픽에 맞춰 timeout과 retry만 조정하면 kgateway가 할 몫은 끝난다.

모델 인지 라우팅이 실제로 필요해지는 시점은 GPU가 여러 장이 되고 나서이고, 그때는 kgateway가 아니라 agentgateway를 올리는 작업이 된다.

## 관련

- [kgateway quickstart 핸즈온](../../kubernetes/kgateway/quickstart/) - 이 판정을 하며 만든 실습
