---
type: Decision
title: 이름 복사, EC2NodeClass 그룹핑, error 키워드 하이라이트
description: 업그레이드 작업 중 눈과 손이 자주 오가는 세 지점을 화면에서 줄이기로 한다.
tags: [kubernetes, electron, karpenter]
timestamp: 2026-07-27T00:00:00Z
---

## 결정

노드 이름 오른쪽에 복사 버튼을 둔다. 복사는 renderer의 `navigator.clipboard`가 아니라 main 프로세스의 `clipboard.writeText`를 IPC(`clipboard:write`)로 호출한다.

NodePool / EC2NodeClass 탭에서 EC2NodeClass 목록을 그 클래스를 참조하는 NodePool 이름으로 묶는다. 묶는 기준은 NodePool의 `spec.template.spec.nodeClassRef.name`이며, NodePool 표에도 NodeClass 칼럼을 더한다. 어느 NodePool도 참조하지 않는 클래스는 맨 뒤에 따로 묶는다.

Karpenter Event 탭의 event(reason, object, message)와 pod log(파드 이름, 본문)에서 error를 대소문자 구분 없이 빨갛게 칠한다. 낱말 경계를 두지 않아 NodeClaimRegistrationError나 errorCode처럼 다른 낱말 안에 든 error도 함께 칠한다.

## 이유

- 노드 이름은 이 앱을 보다가 터미널로 옮겨 갈 때 가장 자주 옮기는 값이다. 드래그 선택은 `ip-10-0-1-11.ap-northeast-2.compute.internal` 같은 긴 이름에서 앞뒤가 잘리기 쉬워 붙여넣고 나서야 틀린 것을 안다. 버튼은 값 전체를 그대로 넘긴다.
- 복사를 main에 둔 이유는 `navigator.clipboard`가 문서 focus와 권한 상태를 타기 때문이다. 실패해도 조용히 아무 일이 없어 사용자가 왜 안 되는지 알 수 없다. main의 clipboard는 그런 조건이 없고, 실패하면 IPC가 에러를 던져 화면 배너에 남는다.
- 업그레이드 때 실제로 묻는 질문은 "이 NodePool이 지금 어떤 AMI로 노드를 띄우는가"다. 두 목록을 따로 두면 `nodeClassRef`를 눈으로 이어야 하고, NodePool이 여럿이면 매번 다시 이어야 한다. 화면이 그 연결을 대신 그린다.
- 한 EC2NodeClass를 여러 NodePool이 참조할 수 있어 같은 클래스가 여러 그룹에 나온다. 중복을 없애려고 한 곳에만 두면 나머지 NodePool 아래가 비어 "이 NodePool에는 클래스가 없다"로 잘못 읽힌다. 참조 관계를 그대로 그리는 쪽을 택했다.
- 참조가 가리키는 클래스를 찾지 못한 NodePool은 그룹을 비우지 않고 찾지 못했다고 적는다. 오타나 삭제된 클래스는 노드가 안 떠서야 드러나는데, 목록에서 먼저 보이면 그 전에 안다.
- log는 한 파드에서만 수백 줄이 나온다. 눈으로 error를 찾는 동안 정작 봐야 할 줄을 지나친다. 색은 읽기 전에 위치를 알려주므로 훑는 시간이 줄어든다. Warning type의 글자색과 겹치지 않게 배경까지 준다.
- 낱말 경계(`\berror\b`)를 두지 않는다. karpenter가 실제로 뱉는 값은 `NodeClaimRegistrationError`, `errorCode`, `InsufficientCapacityError`처럼 다른 낱말에 붙어 있는 경우가 많아, 경계를 두면 정작 봐야 할 줄을 놓친다. 그 대신 terror 같은 오탐을 얻지만 클러스터 로그에 나오지 않는 낱말이라 비용이 없다.
- 하이라이트는 조각을 `textContent`로만 넣어 붙인다. event message와 log 본문은 클러스터가 준 문자열이라 HTML로 해석될 여지를 남기지 않는다.
