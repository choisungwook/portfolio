---
type: Decision
title: NodePool 표는 숫자 칼럼을 정렬하고 EC2NodeClass 표는 평평하게 되돌린다
description: NodePool의 AMI 칼럼을 없애고 Weight/Nodes 정렬을 넣으며, EC2NodeClass 그룹핑을 걷어낸다.
tags: [kubernetes, karpenter, electron]
timestamp: 2026-07-27T00:00:00Z
---

## 결정

NodePool 표에서 AMI 칼럼을 지운다. Weight와 Nodes 헤더를 누르면 숫자 크기순으로 정렬하고, 값이 `-`인 줄은 방향과 상관없이 맨 뒤에 둔다.

EC2NodeClass 표는 name과 ami 두 칼럼만 두고, NodePool 이름으로 묶던 그룹핑을 걷어내 조회 순서대로 평평하게 나열한다. [이름 복사 ADR](2026-07-name-copy-and-error-highlight.md)에서 넣었던 그룹핑을 되돌리는 결정이다.

파싱 단계에서도 화면에 쓰지 않는 값을 만들지 않는다. `NodePoolInfo`에서 `ami`를, EC2NodeClass에서 `weight`를 뺀다.

## 이유

- NodePool의 AMI 칼럼은 늘 `-`였다. AMI는 NodePool이 아니라 EC2NodeClass가 가진 값이라 채울 방법이 없었고, 두 리소스를 한 화면에 나란히 두느라 칼럼을 맞춘 흔적이었다. 값이 들어올 일이 없는 칸은 표의 폭만 차지한다.
- Weight와 Nodes는 숫자 칸이다. 문자열로 견주면 `10`이 `9`보다 앞에 오므로 수로 바꿔 비교한다. 다른 표의 정렬과 조작을 맞추려고 Pods 탭과 같은 헤더 클릭 방식을 쓴다.
- `-`를 0으로 읽지 않는 이유는 그 값이 "0개"가 아니라 "모르는 값"이기 때문이다. weight의 `-`는 지정하지 않았다는 뜻이고 nodes의 `-`는 노드 조회가 실패했다는 뜻이다. 크기로 견줄 수 없는 값을 숫자 사이에 끼워 넣으면 정렬 결과가 거짓말을 하므로 늘 맨 뒤로 보낸다. 오름차순과 내림차순이 서로 뒤집힌 모양이 아니게 되지만, "모르는 값은 아래"가 표에서 더 익숙한 규칙이라 그쪽을 택했다.
- 그룹핑은 "이 NodePool이 지금 어떤 AMI로 노드를 띄우는가"를 화면이 대신 이어 주려는 것이었다. 대신 표가 두 가지를 떠안았다. 한 EC2NodeClass를 여러 NodePool이 참조하면 같은 줄이 여러 번 나오고, 그룹이 비는 경우가 둘(참조 없음, 참조가 가리키는 클래스를 못 찾음)이라 안내 문구도 둘로 갈렸다. 리소스 목록을 보러 온 화면에 실제 리소스 수보다 많은 줄이 나오는 셈이다.
- 그룹핑을 걷어내도 연결이 사라지지는 않는다. `nodeClassRef` 이름은 NodePool 표의 NodeClass 칼럼에 그대로 있어서, 두 표를 잇는 값은 여전히 화면에 보인다.
- EC2NodeClass의 weight는 그 리소스에 없는 필드라 늘 `-`였다. NodePool의 ami와 같은 이유로 뺀다. 화면에 쓰지 않는 값을 파싱 단계에서 만들지 않으면 두 리소스를 한 타입으로 묶을 이유도 없어져 `NodePoolInfo`와 `Ec2NodeClassInfo`를 각자 필요한 필드만 갖도록 나눴다.
