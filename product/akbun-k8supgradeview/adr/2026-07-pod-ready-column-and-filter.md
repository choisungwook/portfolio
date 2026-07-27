---
type: Decision
title: Pods 탭에 Ready 칼럼을 두고 Ready 필터는 상태 필터와 따로 둔다
description: 파드가 실제로 트래픽을 받는지 확인하려고 Ready 표기와 필터를 상태와 분리해 넣는다.
tags: [kubernetes, electron]
timestamp: 2026-07-27T00:00:00Z
---

## 결정

Pods 탭과 노드 탭의 파드 표에 Ready 칼럼을 넣는다. 값은 kubectl get pods의 READY 칸과 같은 "준비된 컨테이너/전체 컨테이너" 표기다. 준비된 개수는 status.containerStatuses에서 ready가 true인 것을 세고, 전체 개수는 spec.containers에서 읽는다.

Ready 필터는 "Ready 아닌 파드만" 토글 하나로 두고, 기존 "Running 아닌 파드만" 토글과 합치지 않는다. namespace 필터, 이름 검색, 상태 필터와 모두 AND로 걸린다.

## 이유

- status는 파드가 어느 phase에 있는가를, Ready는 컨테이너가 트래픽을 받을 준비가 되었는가를 말한다. Running이면서 Ready가 아닌 파드는 Service endpoint에 들어가 있지 않아서, 노드를 비우기 전에 옮겨 간 파드가 실제로 일하고 있는지 확인하려면 두 값을 나란히 봐야 한다.
- 두 필터를 하나로 합치면 "Running인데 Ready가 아닌" 교집합을 만들 수 없다. 업그레이드 중에 가장 먼저 봐야 하는 줄이 그 교집합이라 따로 뒀다.
- 전체 컨테이너 수를 containerStatuses가 아니라 spec.containers에서 읽는다. 아직 스케줄되지 않았거나 image를 받는 중인 파드는 containerStatuses가 비어 있어서, 그 배열로 세면 0/0으로 뭉개져 어느 파드가 몇 개짜리인지 알 수 없다.
- init container와 ephemeral container는 세지 않는다. kubectl의 READY 칸과 다른 숫자를 보여주면 두 화면을 나란히 놓고 볼 때 어느 쪽이 맞는지 다시 따져야 한다.
- allReady 판정을 main에서 함께 계산해 PodInfo에 담는다. 화면에서 "1/2" 문자열을 다시 파싱하면 필터와 색 두 곳에서 같은 파싱이 반복되고, 한쪽만 고치면 색과 필터가 어긋난다.
- Ready 칸의 색은 초록과 빨강 둘뿐이다. 상태와 달리 개수가 다 찼는가 아닌가의 문제라 중간 단계를 둘 자리가 없다.
