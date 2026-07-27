---
type: Decision
title: Utilize 탭은 over-provisioning manifest를 만들기만 하고 적용하지 않는다
description: Karpenter over-provisioning manifest 생성 기능의 출력 형태와 생성 로직의 위치를 정한다.
tags: [kubernetes, karpenter, electron]
timestamp: 2026-07-27T00:00:00Z
---

## 결정

Utilize 탭은 namespace 목록을 조회해 사용자가 고르게 하고, 고른 수만큼 placeholder Deployment를 만들어 `---`로 이어 붙인 문자열을 화면에 보여준다. 클러스터에 apply하지 않는다.

PriorityClass는 선택한 namespace 개수와 무관하게 맨 앞에 한 번만 넣는다. 우선순위는 `-1`, `globalDefault: false`다.

생성 로직은 renderer가 아니라 main의 `overprovision.ts`에 순수 함수로 두고 `overprovision:build` IPC로 부른다.

placeholder 컨테이너 image의 기본값은 `registry.k8s.io/pause:3.10`이고 화면에서 바꿀 수 있다.

## 이유

- 이 앱에서 클러스터를 바꾸는 동작은 cordon 하나뿐이고 그것도 확인 dialog를 붙였다. over-provisioning은 노드를 실제로 늘리는 작업이라 영향이 더 크다. 적용까지 앱이 하면 확인 절차와 실패 복구를 함께 만들어야 하는데, 만들어 주기만 해도 목적은 달성된다. 사용자가 결과를 읽고 `kubectl apply -f -`로 넘기는 편이 무엇이 나가는지 눈으로 확인하게 되어 더 안전하다.
- 문서를 `---`로 잇는 이유는 apply를 한 번으로 끝내기 위해서다. namespace마다 파일을 나누면 사용자가 파일 개수만큼 명령을 반복해야 한다.
- PriorityClass는 cluster scope 리소스다. namespace마다 만들면 이름이 겹쳐 apply가 실패한다. Deployment는 namespace마다 필요하지만 PriorityClass는 하나면 되므로 개수를 다르게 둔다.
- 우선순위를 음수로 두는 것이 이 패턴의 핵심이다. 기본 우선순위가 0이라 placeholder가 그보다 낮아야 실제 워크로드가 밀어낼 수 있다. 양수나 0이면 placeholder가 노드를 붙잡고 놓지 않아 오히려 자원을 낭비한다.
- 생성 로직을 main에 둔 이유는 검증 때문이다. 이 결과물은 사용자가 그대로 클러스터에 넣는 값이라 문서 구분자나 들여쓰기가 어긋나면 apply가 실패한다. 화면에서 눈으로 확인하기 어려운 규칙이라 순수 함수로 떼어 두고 `test/overprovision.test.js`가 문자열을 직접 검증한다. 저장소의 다른 테스트도 같은 방식으로 main의 파싱 규칙을 검증하고 있다.
- YAML 라이브러리를 넣지 않고 문자열로 만든다. 만드는 문서 모양이 고정되어 있어 라이브러리가 주는 이득이 적고, 번들러 없이 tsc만 쓰는 빌드 구성을 그대로 두고 싶었다. 대신 사용자가 넣는 값(namespace, image, cpu)은 형식을 먼저 검증해 줄바꿈 하나로 문서 구조가 바뀌는 일을 막는다.
- cpu request가 limit보다 크면 apply는 성공하고 파드만 뜨지 않는다. 화면에서 만들 때 막지 않으면 클러스터에 넣고 한참 뒤에야 알게 되므로 생성 단계에서 걸러 낸다. `500m`과 `0.5`가 같은 값이라 비교 전에 단위를 맞춘다.
- pause image를 쓰는 이유는 placeholder가 아무 일도 하지 않고 종료 신호만 기다리면 되기 때문이다. Karpenter 문서와 blueprint의 over-provisioning 예제도 같은 image를 쓴다. 기본값을 고정하지 않고 바꿀 수 있게 둔 이유는 registry를 직접 미러링하는 환경이 흔하고, 클러스터 버전에 따라 쓰는 tag가 다를 수 있어서다.

## Citations

1. eliminate kubernetes node scaling lag with pod priority and over provisioning - https://aws.amazon.com/blogs/containers/eliminate-kubernetes-node-scaling-lag-with-pod-priority-and-over-provisioning/
2. Overprovision Node Capacity For A Cluster - https://kubernetes.io/docs/tasks/administer-cluster/node-overprovisioning/
3. dependencies: start using registry.k8s.io/pause:3.10 - https://github.com/kubernetes/kubernetes/pull/125112
