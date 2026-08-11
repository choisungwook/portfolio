# 아키텍처

Electron + TypeScript 데스크톱 앱이다. 클러스터 조회는 Kubernetes client 라이브러리 없이 kubectl 명령을 직접 실행한다.

## 프로세스 구조

- `workspace/src/main/`: Electron main 프로세스. kubectl 실행, 설정 파일 저장, IPC 핸들러를 담당한다.
  - `main.ts`: 윈도우 생성과 IPC 핸들러 등록
  - `kubectl.ts`: kubectl 실행과 노드/파드/namespace JSON 파싱
  - `overprovision.ts`: over-provisioning manifest 문자열 생성. kubectl을 부르지 않는 순수 함수다
  - `settings.ts`: userData 경로의 settings.json 읽기/쓰기
  - `preload.ts`: contextBridge로 renderer에 `window.api` 노출
- `workspace/src/renderer/`: 화면. Nodes, Pods, Karpenter Event, NodePool / EC2NodeClass, Utilize, Settings 6개 탭과 테이블 렌더링. 프레임워크 없이 DOM API만 사용한다.

renderer는 `nodeIntegration: false`, `contextIsolation: true`이며 main 프로세스와는 IPC(`kubectl:nodes`, `kubectl:pods`, `kubectl:describe-pod`, `kubectl:describe-node`, `kubectl:set-node-cordon`, `kubectl:karpenter-events`, `kubectl:karpenter-logs`, `kubectl:karpenter-resources`, `kubectl:karpenter-versions`, `kubectl:namespaces`, `overprovision:build`, `clipboard:write`, `settings:get`, `settings:save`)로만 통신한다.

## kubectl 실행 흐름

설정된 kubectl 명령 문자열을 공백으로 분리해 shell 없이 execFile로 실행한다. proxy 환경(예: teleport)에서는 Settings 탭에서 명령을 tsh kubectl로 바꾸면 된다. shell을 거치지 않으므로 명령 문자열에 의한 인젝션이 없다.

노드 조회와 파드 조회에 사용하는 명령:

```bash
kubectl get nodes -o json
kubectl get pods --all-namespaces -o json
kubectl get pods --all-namespaces -o json --field-selector spec.nodeName=<노드이름>
```

이름을 눌러 describe 사이드 패널을 열 때 사용하는 명령. 노드는 cluster scope라 namespace를 붙이지 않는다:

```bash
kubectl describe pod <파드이름> -n <namespace>
kubectl describe node <노드이름>
```

Utilize 탭이 manifest를 만들 대상 목록을 채울 때 사용하는 명령:

```bash
kubectl get namespaces -o json
```

Nodes 탭의 Action 버튼이 사용하는 명령. 이 앱에서 유일하게 클러스터 상태를 바꾼다.

```bash
kubectl cordon <노드이름>
kubectl uncordon <노드이름>
```

Karpenter Event 탭이 사용하는 명령. namespace, label selector, 조회 범위는 Settings 값이다.

```bash
kubectl get deployments -n <namespace> -l <label selector> -o json
kubectl get events -n <namespace> -o json
kubectl get pods -n <namespace> -l <label selector> -o json
kubectl logs <파드이름> -n <namespace> --all-containers=true --timestamps --since=<분>m
```

NodePool / EC2NodeClass 탭이 사용하는 명령. 둘 다 cluster scope 리소스다. 다른 CRD와 이름이 겹치지 않도록 group까지 붙여 조회한다.

```bash
kubectl get nodepools.karpenter.sh -o json
kubectl get ec2nodeclasses.karpenter.k8s.aws -o json
```

## 표 정렬

정렬과 필터는 모두 renderer 안에서만 돈다. 목록은 이미 한 번에 다 받아 두므로 정렬만 바꿀 때는 kubectl을 다시 부르지 않는다.

정렬 대상은 모든 표의 모든 칼럼이다. Nodes, 노드의 파드, Pods, Karpenter Version, Karpenter Event, NodePool, EC2NodeClass 일곱 표가 같은 배선을 쓴다. 예외는 Nodes 표의 Action 칼럼 하나인데, 값이 아니라 버튼이라 견줄 것이 없다.

칸마다 값의 종류가 달라 견주는 방법도 달라야 화면에 보이는 대로 정렬된다. 그래서 칼럼마다 종류(`SortKind`)를 붙인다.

| 종류 | 쓰는 칸 | 견주는 방법 |
|---|---|---|
| `text` | 이름, namespace, status, group 등 | `localeCompare` |
| `natural` | kubelet/karpenter 버전, 파드 Ready(`2/2`) | 숫자를 수로 읽는 `localeCompare`(`numeric: true`). `v1.9`가 `v1.29`보다, `2/2`가 `10/10`보다 앞에 온다 |
| `number` | NodePool weight와 nodes, event count | 수로 바꿔 뺀다. 알파벳 순이면 `10`이 `9`보다 앞에 온다 |
| `ip` | 노드 Internal IP | octet을 하나씩 수로 견준다. 글자로 견주면 `10.0.0.10`이 `10.0.0.9`보다 앞에 온다 |
| `age` | 노드, 파드, NodePool의 Age | `creationTimestamp`를 견주고 뒤집는다. 화면에 보이는 값은 나이라 최신일수록 어리다. 오름차순이 "어린 것부터"로 읽혀야 한다 |
| `time` | Karpenter Event의 Time | 시각을 그대로 견준다. 오름차순이 "오래된 것부터"다 |

Age를 화면 문자열(`45s`, `5d`)로 견주지 않는 이유는 단위가 섞여 있어 글자로 견주면 시간 순서와 어긋나기 때문이다. 원본 timestamp가 손에 있으므로 그것으로 견주고 표시만 축약한다.

값이 없거나(`-`, 빈 값) 읽을 수 없는 줄은 숫자와 시각 칸에서 방향과 상관없이 늘 맨 뒤로 보낸다. `-`는 0이나 가장 오래된 시각이 아니라 "모르는 값"(weight 미지정, 노드 조회 실패)이라 크기로 견줄 수 없다. 글자 칸에서는 `-`도 그대로 견줄 수 있는 글자라 예외로 두지 않는다.

정렬 기준 값이 같을 때는 표마다 정한 2차 기준(`tiebreak`, 대개 이름)을 쓴다. 그래야 같은 값이 몰려 있는 칸으로 정렬해도 새로고침할 때마다 순서가 흔들리지 않는다.

표마다 정렬 상태를 따로 들고 있다. 상태는 `createSortController`가 만든 closure 안에 가둬 두어 표끼리 서로의 정렬을 건드릴 수 없다. controller는 그릴 때 쓸 `apply`, 헤더 표시를 맞추는 `refreshIndicators`, 헤더에 처리를 붙이는 `register` 셋만 밖으로 낸다. 정렬은 원본 배열을 건드리지 않고 사본을 만들어 돌려주므로 필터와 조회 결과가 그대로 남는다. 노드 탭의 파드 표도 조회 결과를 `nodePods`에 들고 있어야 정렬만 바꿀 때 kubectl을 다시 부르지 않는다.

정렬을 한 번도 고르지 않았으면 kubectl이 준 순서를 그대로 둔다. 기본값을 정렬된 상태로 두면 kubectl 출력과 화면이 달라져 두 결과를 나란히 볼 때 헷갈린다. 헤더를 누르면 오름차순부터 시작하고, 같은 헤더를 다시 누르면 방향만 뒤집는다. 어느 칼럼으로 어느 방향인지는 헤더의 `.sort-arrow`에 ▲/▼로 표시하고, 화살표가 붙고 빠질 때 헤더 너비가 흔들리지 않도록 CSS에서 자리를 미리 잡아 둔다. 정렬 상태는 새로고침해도 유지된다.

헤더 배선은 `registerSortHeaders` 하나다. `th`는 원래 focus를 받지 않아 `tabindex="0"`과 `role="button"`을 주고 Enter와 Space keydown을 클릭과 같은 동작에 잇는다. 마우스 없이 키보드만 쓰는 경우에도 정렬에 닿게 하기 위함이며, Space는 기본 동작이 화면 스크롤이라 막는다. 화살표와 색은 눈으로만 읽히므로 같은 내용을 `aria-sort`(`ascending`/`descending`/`none`)로도 적는다. "Running 아닌 파드만"과 "Ready 아닌 파드만" 토글도 눌린 상태를 색뿐 아니라 `aria-pressed`로 알린다.

## Pods 탭 상태 필터

상태 필터는 "Running 아닌 파드만" 버튼 하나다. 업그레이드 중에는 정상인 파드보다 Running에서 벗어난 파드를 먼저 봐야 하는데, 벗어난 상태 이름이 Pending, Terminating, CrashLoopBackOff처럼 여럿이라 낱낱이 고르게 하면 새 상태가 나올 때마다 목록을 늘려야 한다. `status !== "Running"` 하나로 두면 상태 이름이 무엇이든 걸린다.

namespace 필터, 이름 검색, 상태 필터, Ready 필터는 서로 AND로 걸리고 그 결과에 정렬을 적용한다.

## Ready 칼럼과 Ready 필터

Ready는 `kubectl get pods`의 READY 칸과 같은 "준비된 컨테이너/전체 컨테이너" 표기다. 준비된 개수는 `status.containerStatuses`에서 `ready`가 true인 것을 세고, 전체 개수는 `spec.containers`에서 읽는다. 아직 스케줄되지 않았거나 image를 받는 중인 파드는 `containerStatuses`가 비어 있어서, 전체 개수까지 그 배열로 세면 `0/0`으로 뭉개진다. init container와 ephemeral container는 kubectl의 READY 칸에도 들어가지 않으므로 세지 않는다.

`allReady`(모든 컨테이너가 Ready인가)는 main에서 함께 계산해 `PodInfo`에 담는다. 화면이 `1/2` 같은 문자열을 다시 파싱하면 필터와 색 두 곳에서 같은 파싱을 반복하게 된다.

Ready 필터는 "Ready 아닌 파드만" 버튼 하나이고 상태 필터와 따로 둔다. 두 값이 답하는 질문이 다르기 때문이다. status가 Running이어도 probe를 통과하지 못한 컨테이너가 있으면 그 파드는 Service의 endpoint에 들어가지 않는다. 노드를 비우기 전에 옮겨 간 파드가 실제로 트래픽을 받는지 확인하려면 "Running인데 Ready가 아닌" 줄을 봐야 하는데, 필터가 하나로 합쳐져 있으면 그 교집합을 만들 수 없다.

Pods 탭의 두 토글은 노드 필터와 같은 `.filter-button` 모양을 쓴다. 다만 노드 필터는 하나만 켜지는 라디오라 클릭할 때 나머지 버튼의 `active`를 지우므로, 그 클릭 핸들러는 `.filter-button[data-filter]`에만 건다. 클래스 이름만으로 고르면 파드 토글을 누를 때 노드 필터가 전체로 되돌아가고 다른 토글의 켜진 표시도 함께 지워진다.

Ready 칸도 상태처럼 색으로 먼저 읽히게 한다. 다만 상태와 달리 중간 단계를 두지 않고 모두 Ready면 초록, 아니면 빨강 두 가지만 쓴다. Ready는 개수가 다 찼는가 아닌가의 문제라 그 사이에 둘 단계가 없다.

## describe 사이드 패널

Nodes 탭, Pods 탭, 노드 상세의 파드 표에서 이름 칸만 버튼(`.name-button`)이다. 누르면 화면 오른쪽에 `#pod-detail-panel`이 열리고 `kubectl describe`의 출력을 그대로 붙인다. 패널은 `position: fixed`로 표 위에 겹친다. 표를 밀어내면 칼럼이 접혀 어느 대상을 열었는지 보이지 않기 때문이다. 너비는 `min(1100px, 95vw)`다. describe는 한 줄이 길어 좁은 패널에서는 줄바꿈이 잦아 읽기 어렵다.

describe 결과는 파싱하지 않는다. main은 `describePod(namespace, name)`과 `describeNode(name)`이 문자열을 그대로 돌려주고, renderer는 error 낱말 하이라이트(`appendErrorHighlighted`)만 얹는다. 들여쓰기가 계층을 나타내는 출력이라 `white-space: pre-wrap`으로 원문 형태를 지키고, 조각은 `textContent`로만 넣어 클러스터가 준 문자열이 HTML로 해석되지 않게 한다.

패널은 `role="dialog"`로 선언하고, 이름 버튼으로 열 때 닫기 버튼으로 focus를 옮긴다. 표에 focus가 남아 있으면 키보드만 쓰는 경우 열린 패널에 닿을 수 없다. 연 버튼은 `detailOpener`에 들고 있다가 닫을 때 그 자리로 focus를 되돌린다. 패널 안의 새로고침으로 다시 읽을 때는 이미 패널 안에 있으므로 focus를 건드리지 않는다.

지금 보고 있는 대상은 `detailTarget`(kind, namespace, name)에 들고 있다. 노드와 파드가 한 패널을 쓰므로 kind까지 담아야 새로고침이 어느 명령을 다시 돌릴지 정할 수 있다. 조회하는 동안 다른 대상을 눌렀을 때 늦게 온 응답이 화면을 덮지 않도록 응답의 대상과 비교하는 데도 쓴다. 조회 실패는 상단 배너가 아니라 패널 안에 적는다. 패널이 오른쪽을 덮고 있어 배너가 눈에 들어오지 않는다.

이름 검증은 IPC 경계에서 노드와 같은 `assertResourceName`이 한다. shell을 거치지 않아 인젝션은 없지만 `-`로 시작하는 값은 kubectl이 이름이 아니라 옵션으로 읽는다. 배경은 [describe 사이드 패널 ADR](../adr/2026-07-pod-describe-side-panel.md)에 있다.

## Karpenter Event 탭

버전은 karpenter deployment에서 읽는다. helm chart가 붙이는 `app.kubernetes.io/version` label을 먼저 보고, 없으면 container image의 tag를 쓴다. registry에 port가 붙은 image(`registry:5000/karpenter:1.1.0`)를 tag와 혼동하지 않도록 마지막 `/` 뒤에서만 `:`를 찾는다. tag 없이 digest만 있으면 `-`다. deployment 조회 권한이 없어도 event와 log는 봐야 하므로 실패는 값으로 담아 그 표 위에만 표시한다.

event는 core/v1과 events.k8s.io/v1의 필드 이름이 달라 둘 다 읽는다. 시각은 `lastTimestamp`, `series.lastObservedTime`, `eventTime`, `firstTimestamp`, `metadata.creationTimestamp` 순으로 찾고, 대상은 `involvedObject` 또는 `regarding`, 본문은 `message` 또는 `note`를 쓴다. 목록은 오래된 것부터 시간순으로 정렬한다. 읽을 수 없는 시각은 정렬 비교에서 0으로 맞춘다. `NaN`을 비교에 넣으면 순서가 보장되지 않기 때문이다.

로그는 label selector로 파드를 먼저 찾고 파드마다 따로 조회한다. 한 파드의 조회가 실패해도 나머지 로그는 보여줘야 하므로 실패를 예외로 던지지 않고 `PodLog.error`에 담아 화면에 표시한다.

event의 reason, object, message와 로그의 파드 이름, 본문에서는 error를 대소문자 구분 없이 빨갛게 칠한다(`.error-keyword`). 낱말 경계를 두지 않아 `NodeClaimRegistrationError`처럼 다른 낱말 안에 든 error도 칠한다. 수백 줄에서 눈으로 찾는 시간을 줄이기 위해서다. 조각을 `textContent`로만 넣어 붙이므로 클러스터가 준 문자열이 HTML로 해석되지 않는다. 배경은 [하이라이트 ADR](../adr/2026-07-name-copy-and-error-highlight.md)에 있다.

| 설정 | 기본값 |
|---|---|
| `karpenterNamespace` | `karpenter` |
| `karpenterPodLabelSelector` | `app.kubernetes.io/name=karpenter` |
| `karpenterLogSinceMinutes` | `15` (1~1440으로 제한) |

## NodePool / EC2NodeClass 탭

NodePool은 name, nodeClass, weight, nodes, ready, age를, EC2NodeClass는 name, ami를 보여준다. `spec.weight`나 Ready condition처럼 있을 수도 없을 수도 있는 필드는 `-`로 채운다.

NodePool의 AMI 칼럼은 두지 않는다. AMI는 NodePool이 아니라 EC2NodeClass의 값이라 NodePool 표에서는 늘 `-`였다. 값이 들어올 일이 없는 칸이므로 지웠다.

EC2NodeClass의 ami는 `spec.amiSelectorTerms`를 `alias=al2023@latest` 같은 표기로 이어 붙여 보여주고, term이 없으면 예전 필드인 `spec.amiFamily`를 쓴다. 둘 다 없으면 `-`다.

두 표의 칼럼은 모두 헤더 클릭으로 정렬한다. 규칙은 [표 정렬](#표-정렬)에 있다.

nodes는 NodePool status에 없어서 노드 목록의 `karpenter.sh/nodepool` label을 세어 채운다. 노드 조회가 실패하면 0과 구분해야 하므로 0이 아니라 `-`를 표시한다. `-`는 "셀 수 없었다"이고 0은 "정말 노드가 없다"다.

karpenter가 없거나 CRD 조회 권한이 없는 클러스터도 있으므로 세 조회(NodePool, EC2NodeClass, 노드)는 서로 독립이다. 한쪽이 실패하면 그 표 위에만 이유를 적고 다른 표는 그대로 보여준다.

EC2NodeClass 목록은 조회한 순서대로 평평하게 나열한다. NodePool 이름으로 묶던 것을 걷어낸 이유는 [그룹핑 제거 ADR](../adr/2026-07-nodepool-sort-and-flat-ec2nodeclass.md)에 있다. NodePool과 EC2NodeClass를 잇는 `nodeClassRef` 이름은 NodePool 표의 NodeClass 칼럼에 그대로 남아 있어 연결은 여전히 읽을 수 있다.

빈 값 처리 규칙은 화면에서 알아채기 어려워 `test/karpenter-resources.test.js`가 목업 데이터로 검증한다. NodeClass 칼럼에 들어가는 `nodeClassRef` 파싱도 같은 테스트가 확인한다. 파싱 규칙을 고치면 이 테스트를 함께 본다.

## Utilize 탭 (over-provisioning manifest 생성)

over-provisioning은 우선순위가 음수인 placeholder 파드를 미리 띄워 노드를 확보해 두는 방법이다. 실제 워크로드가 뜨면 kube-scheduler가 placeholder를 밀어내고 그 자리에 들어가고, 밀려난 placeholder가 Pending이 되면서 Karpenter가 다음 노드를 만든다. 업그레이드처럼 노드가 한꺼번에 빠지는 작업에서 노드 provisioning 대기 시간을 줄이려고 쓴다.

이 탭은 문자열만 만들고 클러스터에는 손대지 않는다. 적용은 사용자가 결과를 복사해 `kubectl apply -f -`로 한다. cordon과 달리 확인 dialog를 두지 않는 이유도 이것이다.

생성 로직은 renderer가 아니라 main의 `overprovision.ts`에 둔다. 화면과 떨어진 순수 함수라 `test/overprovision.test.js`가 문자열을 직접 검증할 수 있기 때문이다. renderer는 `overprovision:build` IPC로 옵션을 넘기고 완성된 문자열만 받는다.

문서 구성은 PriorityClass 하나와 선택한 namespace 수만큼의 Deployment이고, `---`로 이어 붙여 한 번의 apply로 끝나게 한다. PriorityClass는 cluster scope 리소스라 namespace마다 만들 수 없으므로 개수와 무관하게 맨 앞에 한 번만 넣는다. 우선순위 값은 `-1`이고 `globalDefault: false`다. 기본 우선순위가 0이라 음수여야 실제 워크로드가 placeholder를 밀어낼 수 있다.

placeholder 컨테이너는 Kubernetes의 pause image를 쓴다. 아무 일도 하지 않고 종료 신호만 기다리면 되기 때문이고, Karpenter 문서와 blueprint의 over-provisioning 예제도 같은 image를 쓴다. 기본값은 `registry.k8s.io/pause:3.10`이며 화면에서 바꿀 수 있다. `terminationGracePeriodSeconds`는 0이다. 밀려날 때 기다릴 일이 없는데 기본값 30초를 두면 실제 워크로드가 그만큼 늦게 뜬다.

옵션은 namespace 선택, cpu request, cpu limit, replica, image 다섯이다. replica는 namespace마다 각각 적용된다. 선택 순서가 아니라 목록 순서로 문서를 만들어 같은 선택이면 같은 결과가 나오게 한다.

생성 전에 값을 검증한다. namespace 이름은 DNS label 형식, cpu는 `1`/`0.5`/`500m` 형식, replica는 1~1000 정수, image는 공백 없는 문자열이어야 한다. 형식을 먼저 막는 이유는 두 가지다. 사용자가 적는 값이 그대로 이어 붙으므로 줄바꿈 하나로 YAML 구조가 바뀔 수 있고, cpu request가 limit보다 크면 apply한 뒤에야 파드가 뜨지 않는 것을 알게 된다. request와 limit 비교는 `500m`과 `0.5`가 같은 값이라 단위를 맞춘 뒤에 한다. 검증에 걸리면 만들다 만 결과가 남지 않도록 이전 출력을 지우고 이유만 보여준다.

## cordon / uncordon

Nodes 탭 노드 행 끝 Action 칼럼에 버튼 하나를 두고, 글자를 `unschedulable` 값에서 파생시켜 Cordon과 Uncordon을 오간다. 상태를 보여주는 칼럼을 따로 두지 않는 이유와 확인 dialog를 main에 둔 이유는 [cordon 토글 ADR](../adr/2026-07-node-cordon-toggle.md)에 있다.

실행 순서는 renderer 버튼 클릭 → main의 `kubectl:set-node-cordon` → 이름 검증 → 확인 dialog → kubectl 실행이다. 확인 창에서 취소하면 handler가 `false`를 돌려주고 renderer는 목록을 다시 부르지 않는다. 클러스터가 그대로이기 때문이다. 실행에 성공하면 노드 목록을 새로 불러 상태와 버튼 글자를 함께 갱신한다.

행 클릭은 파드 조회에 이미 쓰고 있으므로 버튼 클릭에서 `stopPropagation`으로 전파를 멈춘다. 실행 중에는 버튼을 `disabled`로 잠근다.

subcommand를 반대로 넘기면 노드를 열려다 닫으므로 `test/node-cordon.test.js`가 실제 실행 경로에서 넘어간 인자를 확인한다.

## 이름 복사

Nodes, Pods, 노드 상세의 파드 표 Name 칼럼에서 이름 오른쪽에 복사 버튼을 둔다. 세 표 모두 `appendNameCell` 하나를 쓴다. 클릭하면 renderer가 `clipboard:write` IPC로 이름을 넘기고 main이 electron `clipboard.writeText`로 복사한다. renderer의 `navigator.clipboard`를 쓰지 않는 이유는 focus와 권한 상태를 타서 조용히 실패하기 때문이며, 배경은 [이름 복사 ADR](../adr/2026-07-name-copy-and-error-highlight.md)에 있다.

복사에 성공하면 버튼 글자를 1.5초 동안 "복사됨"으로 바꾼다. 행 클릭은 파드 조회에 쓰고 있으므로 cordon 버튼과 마찬가지로 `stopPropagation`으로 전파를 멈춘다. `td`를 직접 flex로 만들면 표 정렬이 깨지므로 칸 안에 감싸는 요소(`.name-box`)를 하나 두고 그것을 flex로 만든다.

## 노드 분류 기준

| 분류 | 판단 기준 |
|---|---|
| Karpenter 노드 | `karpenter.sh/nodepool` 또는 구버전 `karpenter.sh/provisioner-name` label 존재 |
| Managed NodeGroup 노드 | `eks.amazonaws.com/nodegroup` label 존재 |
| Cordoned 노드 | `spec.unschedulable == true`, 상태에 SchedulingDisabled로 표시 |
| Spot 노드 | capacity type label 값이 `spot` |
| On-Demand 노드 | capacity type label 값이 `on-demand` |

노드 필터 버튼은 이 분류를 그대로 쓰고 하나만 켜지는 라디오다. Karpenter와 Managed NodeGroup은 노드를 만든 주체를, Spot과 On-Demand는 그 노드를 산 방식을 가르는 서로 다른 축이라 버튼을 각각 둔다. "Karpenter의 spot 노드"처럼 두 축의 교집합은 Capacity 칼럼으로 정렬해 본다. 축마다 버튼을 곱해 두면 버튼이 네 개 더 늘어나는데, 업그레이드 중에 실제로 필요한 것은 spot 노드 전체를 한 번에 보는 쪽이었다.

필터 규칙은 `nodeMatchesFilter(node, filter)` 하나이고 표시 상태를 건드리지 않는 순수 함수다. 버튼의 `data-filter`가 그대로 이 함수의 인자가 되므로, 화면에만 버튼을 늘리면 아무것도 걸러지지 않는 버튼이 생긴다. 두 곳이 맞는지는 `test/node-capacity-type.test.js`가 확인한다.

## Capacity 칼럼

Nodes 탭의 Capacity 칼럼은 노드가 spot인지 on-demand인지 보여준다. label 이름이 노드를 만든 주체마다 달라 `karpenter.sh/capacity-type`, `eks.amazonaws.com/capacityType`, 직접 붙이는 `node.kubernetes.io/capacity-type` 셋을 이 순서로 본다.

값의 표기도 label마다 다르다. Karpenter는 `on-demand`, Managed NodeGroup은 `ON_DEMAND`로 적으므로 소문자로 내리고 `_`를 `-`로 바꿔 `spot`과 `on-demand` 두 값으로 맞춘다. 정규화를 main에서 해 두는 이유는 필터와 색 두 곳에서 같은 파싱을 반복하지 않기 위함이다. 아는 두 값이 아니면 읽은 값을 그대로 두어, 새 표기를 만나도 화면에 무엇이 붙어 있는지는 보이게 한다.

label이 하나도 없으면 빈 문자열로 두고 아무것도 적지 않는다. Instance Type과 같은 이유이며, spot 필터와 on-demand 필터 어느 쪽에도 걸리지 않는다.

## Instance Type 칼럼

Nodes 탭의 Instance Type 칼럼은 `node.kubernetes.io/instance-type` label에서 읽고, 그 label이 없으면 예전 이름인 `beta.kubernetes.io/instance-type`을 본다. 업그레이드 중에는 같은 NodePool에서도 노드마다 타입이 달라질 수 있어, 어느 노드를 먼저 비울지 정할 때 이 값을 본다.

둘 다 없으면 빈 문자열로 두고 아무것도 적지 않는다. EC2가 아닌 노드에는 이 label이 없는데, `-`를 적으면 "타입을 못 읽었다"와 "값이 원래 없다"가 같은 모양이 된다. 값이 있고 없고는 `test/node-instance-type.test.js`가 확인한다.

## 업데이트 흐름

상단 메뉴 {앱 이름} > 업데이트 확인이 GitHub Release API에서 akbun-k8supgradeview-v 태그의 최신 버전을 찾아 현재 버전과 비교한다. 새 버전이면 dmg를 임시 디렉터리에 받아 교체 스크립트(SWAP_SCRIPT)를 분리 프로세스로 띄우고 앱을 종료한다. 스크립트가 dmg를 mount해 .app 번들을 교체하고 앱을 재실행한다. 구현은 `workspace/src/main/update.ts`에 있고 배경은 [업데이트 ADR](../adr/2026-07-update-download-and-swap.md)에 있다.

디스크 누수 방지 정리 지점이 세 곳이다. downloadDmg의 실패 시 삭제, 교체 스크립트의 trap, 앱 시작 때 cleanupTempDirs. 업데이트 코드를 고치면 test/update-disk-leak.test.js로 세 지점을 검증한다.

## 상태 표시 규칙

- 노드: Ready condition으로 Ready/NotReady를 정하고, unschedulable이면 `,SchedulingDisabled`를 붙인다.
- 파드: deletionTimestamp가 있으면 Terminating, container waiting reason이 있으면 그 reason(예: CrashLoopBackOff), 아니면 phase를 표시한다.
- age는 kubectl과 비슷하게 45s, 30m, 12h, 5d 형식으로 표시한다.
