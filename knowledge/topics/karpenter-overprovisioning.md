---
type: Topic
title: Karpenter over-provisioning은 음수 우선순위 placeholder로 노드를 미리 잡아 둔다
description: 노드 provisioning 대기 시간을 줄이려고 빈 파드를 미리 띄우는 패턴의 동작 원리와 대가.
tags: [kubernetes, karpenter, aws, eks]
timestamp: 2026-07-27T00:00:00Z
---

## 문제

Karpenter는 파드가 Pending이 된 뒤에야 노드를 만든다. EC2 인스턴스를 띄우고 kubelet이 붙어 Ready가 되기까지 걸리는 시간이 그대로 파드의 대기 시간이 된다. 평소에는 견딜 만하지만 노드가 한꺼번에 빠지는 상황(업그레이드, 대량 스케일아웃)에서는 이 지연이 한 번에 몰린다.

## 동작

빈 파드를 미리 띄워 노드를 잡아 두고, 실제 워크로드가 오면 그 자리를 내주게 한다. 세 가지가 맞물려야 성립한다.

- **음수 우선순위**: PriorityClass의 value를 음수로 둔다. 기본 우선순위가 0이라 음수여야 kube-scheduler가 placeholder를 preempt 대상으로 본다. 양수나 0이면 placeholder가 노드를 붙잡고 놓지 않아 자원만 낭비한다. 이 부호 하나가 패턴의 성패를 가른다.
- **자리를 차지하는 resource request**: placeholder가 실제로 노드를 점유해야 하므로 request가 있어야 한다. 확보하려는 여유 용량은 request와 replica의 곱이다.
- **밀려나면 다시 Pending**: preempt된 placeholder는 사라지지 않고 Pending으로 돌아간다. 그 Pending이 Karpenter에게 다음 노드를 만들라는 신호가 되어 버퍼가 스스로 채워진다.

컨테이너는 아무 일도 하지 않고 종료 신호만 기다리면 되므로 Kubernetes의 pause image를 쓴다. `terminationGracePeriodSeconds`는 0으로 둔다. 기본값 30초를 두면 밀려나는 데 그만큼 걸려 실제 워크로드가 늦게 뜬다.

## 대가

확보한 여유는 그대로 비용이다. placeholder가 잡고 있는 노드는 아무 일도 하지 않으면서 요금이 나간다. 그래서 "얼마나 미리 잡아 둘 것인가"는 기술 선택이 아니라 대기 시간과 비용을 저울질하는 운영 판단이고, 클러스터마다 답이 다르다. 업그레이드처럼 기간이 정해진 작업에서는 작업 동안만 올렸다가 끝나면 replica를 0으로 되돌리는 쪽이 상시 버퍼보다 계산이 쉽다.

## 관련

- [Utilize 탭 ADR](../../product/akbun-k8supgradeview/adr/2026-07-overprovision-manifest-generator.md): 이 manifest를 만들어 주는 도구에서 내린 결정
