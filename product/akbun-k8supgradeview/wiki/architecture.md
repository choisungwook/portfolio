# 아키텍처

Electron + TypeScript 데스크톱 앱이다. 클러스터 조회는 Kubernetes client 라이브러리 없이 kubectl 명령을 직접 실행한다.

## 프로세스 구조

- `workspace/src/main/`: Electron main 프로세스. kubectl 실행, 설정 파일 저장, IPC 핸들러를 담당한다.
  - `main.ts`: 윈도우 생성과 IPC 핸들러 등록
  - `kubectl.ts`: kubectl 실행과 노드/파드 JSON 파싱
  - `settings.ts`: userData 경로의 settings.json 읽기/쓰기
  - `preload.ts`: contextBridge로 renderer에 `window.api` 노출
- `workspace/src/renderer/`: 화면. Nodes, Pods, Karpenter Event, NodePool / EC2NodeClass, Settings 5개 탭과 테이블 렌더링. 프레임워크 없이 DOM API만 사용한다.

renderer는 `nodeIntegration: false`, `contextIsolation: true`이며 main 프로세스와는 IPC(`kubectl:nodes`, `kubectl:pods`, `kubectl:set-node-cordon`, `kubectl:karpenter-events`, `kubectl:karpenter-logs`, `kubectl:karpenter-resources`, `kubectl:karpenter-versions`, `clipboard:write`, `settings:get`, `settings:save`)로만 통신한다.

## kubectl 실행 흐름

설정된 kubectl 명령 문자열을 공백으로 분리해 shell 없이 execFile로 실행한다. proxy 환경(예: teleport)에서는 Settings 탭에서 명령을 tsh kubectl로 바꾸면 된다. shell을 거치지 않으므로 명령 문자열에 의한 인젝션이 없다.

노드 조회와 파드 조회에 사용하는 명령:

```bash
kubectl get nodes -o json
kubectl get pods --all-namespaces -o json
kubectl get pods --all-namespaces -o json --field-selector spec.nodeName=<노드이름>
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

## Karpenter Event 탭

버전은 karpenter deployment에서 읽는다. helm chart가 붙이는 `app.kubernetes.io/version` label을 먼저 보고, 없으면 container image의 tag를 쓴다. registry에 port가 붙은 image(`registry:5000/karpenter:1.1.0`)를 tag와 혼동하지 않도록 마지막 `/` 뒤에서만 `:`를 찾는다. tag 없이 digest만 있으면 `-`다. deployment 조회 권한이 없어도 event와 log는 봐야 하므로 실패는 값으로 담아 그 표 위에만 표시한다.

event는 core/v1과 events.k8s.io/v1의 필드 이름이 달라 둘 다 읽는다. 시각은 `lastTimestamp`, `series.lastObservedTime`, `eventTime`, `firstTimestamp`, `metadata.creationTimestamp` 순으로 찾고, 대상은 `involvedObject` 또는 `regarding`, 본문은 `message` 또는 `note`를 쓴다. 목록은 오래된 것부터 시간순으로 정렬한다. 읽을 수 없는 시각은 정렬 비교에서 0으로 맞춘다. `NaN`을 비교에 넣으면 순서가 보장되지 않기 때문이다.

로그는 label selector로 파드를 먼저 찾고 파드마다 따로 조회한다. 한 파드의 조회가 실패해도 나머지 로그는 보여줘야 하므로 실패를 예외로 던지지 않고 `PodLog.error`에 담아 화면에 표시한다.

event의 reason, object, message와 로그의 파드 이름, 본문에서는 error 낱말만 대소문자 구분 없이 빨갛게 칠한다(`.error-keyword`). 수백 줄에서 눈으로 찾는 시간을 줄이기 위해서다. 조각을 `textContent`로만 넣어 붙이므로 클러스터가 준 문자열이 HTML로 해석되지 않는다. 배경은 [하이라이트 ADR](../adr/2026-07-name-copy-and-error-highlight.md)에 있다.

| 설정 | 기본값 |
|---|---|
| `karpenterNamespace` | `karpenter` |
| `karpenterPodLabelSelector` | `app.kubernetes.io/name=karpenter` |
| `karpenterLogSinceMinutes` | `15` (1~1440으로 제한) |

## NodePool / EC2NodeClass 탭

NodePool은 name, nodeClass, ami, weight, nodes, ready, age를, EC2NodeClass는 name, ami, weight를 보여준다. NodePool에는 ami가 없고 EC2NodeClass에는 weight가 없으므로 없는 필드는 `-`로 채운다. `spec.weight`나 Ready condition처럼 있을 수도 없을 수도 있는 필드도 마찬가지다.

ami는 `spec.amiSelectorTerms`를 `alias=al2023@latest` 같은 표기로 이어 붙여 보여주고, term이 없으면 예전 필드인 `spec.amiFamily`를 쓴다. 둘 다 없으면 `-`다.

nodes는 NodePool status에 없어서 노드 목록의 `karpenter.sh/nodepool` label을 세어 채운다. 노드 조회가 실패하면 0과 구분해야 하므로 0이 아니라 `-`를 표시한다. `-`는 "셀 수 없었다"이고 0은 "정말 노드가 없다"다.

karpenter가 없거나 CRD 조회 권한이 없는 클러스터도 있으므로 세 조회(NodePool, EC2NodeClass, 노드)는 서로 독립이다. 한쪽이 실패하면 그 표 위에만 이유를 적고 다른 표는 그대로 보여준다.

EC2NodeClass 목록은 그 클래스를 참조하는 NodePool 이름으로 묶어서 보여준다. 묶는 기준은 NodePool의 `spec.template.spec.nodeClassRef.name`이다. 한 클래스를 여러 NodePool이 참조하면 같은 클래스가 여러 그룹에 나오고, 참조가 가리키는 클래스를 찾지 못한 NodePool은 그룹을 비우지 않고 찾지 못했다고 적는다. 어느 NodePool도 참조하지 않는 클래스는 "연결된 NodePool 없음"으로 맨 뒤에 묶는다. NodePool 조회가 실패해도 이 묶음으로 떨어져 EC2NodeClass 목록 자체는 그대로 보인다.

빈 값 처리 규칙은 화면에서 알아채기 어려워 `test/karpenter-resources.test.js`가 목업 데이터로 검증한다. 그룹 기준이 되는 `nodeClassRef` 파싱도 같은 테스트가 확인한다. 파싱 규칙을 고치면 이 테스트를 함께 본다.

## cordon / uncordon

Nodes 탭 노드 행 끝 Action 칼럼에 버튼 하나를 두고, 글자를 `unschedulable` 값에서 파생시켜 Cordon과 Uncordon을 오간다. 상태를 보여주는 칼럼을 따로 두지 않는 이유와 확인 dialog를 main에 둔 이유는 [cordon 토글 ADR](../adr/2026-07-node-cordon-toggle.md)에 있다.

실행 순서는 renderer 버튼 클릭 → main의 `kubectl:set-node-cordon` → 이름 검증 → 확인 dialog → kubectl 실행이다. 확인 창에서 취소하면 handler가 `false`를 돌려주고 renderer는 목록을 다시 부르지 않는다. 클러스터가 그대로이기 때문이다. 실행에 성공하면 노드 목록을 새로 불러 상태와 버튼 글자를 함께 갱신한다.

행 클릭은 파드 조회에 이미 쓰고 있으므로 버튼 클릭에서 `stopPropagation`으로 전파를 멈춘다. 실행 중에는 버튼을 `disabled`로 잠근다.

subcommand를 반대로 넘기면 노드를 열려다 닫으므로 `test/node-cordon.test.js`가 실제 실행 경로에서 넘어간 인자를 확인한다.

## 노드 이름 복사

Nodes 탭 Name 칼럼의 이름 오른쪽에 복사 버튼을 둔다. 클릭하면 renderer가 `clipboard:write` IPC로 이름을 넘기고 main이 electron `clipboard.writeText`로 복사한다. renderer의 `navigator.clipboard`를 쓰지 않는 이유는 focus와 권한 상태를 타서 조용히 실패하기 때문이며, 배경은 [이름 복사 ADR](../adr/2026-07-name-copy-and-error-highlight.md)에 있다.

복사에 성공하면 버튼 글자를 1.5초 동안 "복사됨"으로 바꾼다. 행 클릭은 파드 조회에 쓰고 있으므로 cordon 버튼과 마찬가지로 `stopPropagation`으로 전파를 멈춘다. `td`를 직접 flex로 만들면 표 정렬이 깨지므로 칸 안에 감싸는 요소(`.name-box`)를 하나 두고 그것을 flex로 만든다.

## 노드 분류 기준

| 분류 | 판단 기준 |
|---|---|
| Karpenter 노드 | `karpenter.sh/nodepool` 또는 구버전 `karpenter.sh/provisioner-name` label 존재 |
| Managed NodeGroup 노드 | `eks.amazonaws.com/nodegroup` label 존재 |
| Cordoned 노드 | `spec.unschedulable == true`, 상태에 SchedulingDisabled로 표시 |

## 업데이트 흐름

상단 메뉴 {앱 이름} > 업데이트 확인이 GitHub Release API에서 akbun-k8supgradeview-v 태그의 최신 버전을 찾아 현재 버전과 비교한다. 새 버전이면 dmg를 임시 디렉터리에 받아 교체 스크립트(SWAP_SCRIPT)를 분리 프로세스로 띄우고 앱을 종료한다. 스크립트가 dmg를 mount해 .app 번들을 교체하고 앱을 재실행한다. 구현은 `workspace/src/main/update.ts`에 있고 배경은 [업데이트 ADR](../adr/2026-07-update-download-and-swap.md)에 있다.

디스크 누수 방지 정리 지점이 세 곳이다. downloadDmg의 실패 시 삭제, 교체 스크립트의 trap, 앱 시작 때 cleanupTempDirs. 업데이트 코드를 고치면 test/update-disk-leak.test.js로 세 지점을 검증한다.

## 상태 표시 규칙

- 노드: Ready condition으로 Ready/NotReady를 정하고, unschedulable이면 `,SchedulingDisabled`를 붙인다.
- 파드: deletionTimestamp가 있으면 Terminating, container waiting reason이 있으면 그 reason(예: CrashLoopBackOff), 아니면 phase를 표시한다.
- age는 kubectl과 비슷하게 45s, 30m, 12h, 5d 형식으로 표시한다.
