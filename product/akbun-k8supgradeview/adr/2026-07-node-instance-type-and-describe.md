# 노드 Instance Type 칼럼과 노드 describe를 파드와 같은 사이드 패널에 둔다

## 결정

- Nodes 탭에 Instance Type 칼럼을 두고 `node.kubernetes.io/instance-type` label에서 읽는다. 그 label이 없으면 예전 이름인 `beta.kubernetes.io/instance-type`을 본다. 둘 다 없으면 `-`가 아니라 빈 칸으로 둔다.
- 노드 이름을 누르면 `kubectl describe node`의 출력을 파드와 같은 `#pod-detail-panel`에 띄운다. 패널 상태는 `detailTarget`에 kind를 담아 노드와 파드를 함께 다룬다.
- 파드 이름 칸에도 노드와 같은 복사 버튼을 둔다. 이름 칸을 만드는 함수를 `appendNameCell` 하나로 합친다.
- 사이드 패널 너비를 `min(720px, 90vw)`에서 `min(1100px, 95vw)`로 넓힌다.

## 이유

instance type은 업그레이드 중에 노드를 고르는 기준이 된다. 같은 NodePool이 만든 노드라도 타입이 섞여 있어서, 어느 노드를 먼저 비울지 정하려면 `kubectl get nodes -o wide`를 따로 돌려야 했다. label에서 읽으므로 조회를 늘리지 않고 이미 받아 오는 노드 JSON에서 꺼낸다.

값이 없을 때 `-`를 적지 않는 이유는 두 상황이 구분되어야 하기 때문이다. EC2가 아닌 노드에는 이 label이 애초에 없다. `-`는 다른 칼럼에서 "값을 못 읽었다"는 뜻으로 쓰고 있어서, 원래 없는 값에까지 쓰면 조회가 실패한 것처럼 읽힌다.

노드 describe는 파드와 답하는 질문이 같다. 표의 칼럼으로는 taint, allocatable, condition의 자세한 사유가 보이지 않는다. 패널을 하나 더 만드는 대신 파드가 쓰던 패널을 그대로 쓰면, 여는 방법과 닫는 방법, focus 처리, 늦게 온 응답을 버리는 규칙이 한 벌로 남는다. 노드는 cluster scope라 namespace가 없어서 대상에 kind를 담아 명령만 가른다.

파드 이름도 노드와 마찬가지로 `kubectl logs`나 `kubectl exec`에 그대로 붙여 쓰는 값이다. 노드에만 복사 버튼이 있을 이유가 없어서 이름 칸 함수를 하나로 합쳤다.

패널이 넓어진 이유는 describe 출력의 한 줄이 길기 때문이다. 720px에서는 event message와 annotation이 여러 줄로 접혀 원문의 줄 단위가 무너졌다. 화면을 거의 덮지만 패널을 열었다는 것은 지금 그 대상을 읽겠다는 뜻이라 표를 함께 볼 필요가 적다.
