# 아키텍처

Electron + TypeScript 데스크톱 앱이다. 클러스터 조회는 Kubernetes client 라이브러리 없이 kubectl 명령을 직접 실행한다.

## 프로세스 구조

- `workspace/src/main/`: Electron main 프로세스. kubectl 실행, 설정 파일 저장, IPC 핸들러를 담당한다.
  - `main.ts`: 윈도우 생성과 IPC 핸들러 등록
  - `kubectl.ts`: kubectl 실행과 노드/파드 JSON 파싱
  - `settings.ts`: userData 경로의 settings.json 읽기/쓰기
  - `preload.ts`: contextBridge로 renderer에 `window.api` 노출
- `workspace/src/renderer/`: 화면. Nodes, Pods, Karpenter Event, NodePool / EC2NodeClass, Settings 5개 탭과 테이블 렌더링. 프레임워크 없이 DOM API만 사용한다.

renderer는 `nodeIntegration: false`, `contextIsolation: true`이며 main 프로세스와는 IPC(`kubectl:nodes`, `kubectl:pods`, `kubectl:karpenter-events`, `kubectl:karpenter-logs`, `kubectl:karpenter-resources`, `settings:get`, `settings:save`)로만 통신한다.

## kubectl 실행 흐름

설정된 kubectl 명령 문자열을 공백으로 분리해 shell 없이 execFile로 실행한다. proxy 환경(예: teleport)에서는 Settings 탭에서 명령을 tsh kubectl로 바꾸면 된다. shell을 거치지 않으므로 명령 문자열에 의한 인젝션이 없다.

노드 조회와 파드 조회에 사용하는 명령:

```bash
kubectl get nodes -o json
kubectl get pods --all-namespaces -o json
kubectl get pods --all-namespaces -o json --field-selector spec.nodeName=<노드이름>
```

Karpenter Event 탭이 사용하는 명령. namespace, label selector, 조회 범위는 Settings 값이다.

```bash
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

event는 core/v1과 events.k8s.io/v1의 필드 이름이 달라 둘 다 읽는다. 시각은 `lastTimestamp`, `series.lastObservedTime`, `eventTime`, `firstTimestamp`, `metadata.creationTimestamp` 순으로 찾고, 대상은 `involvedObject` 또는 `regarding`, 본문은 `message` 또는 `note`를 쓴다. 목록은 오래된 것부터 시간순으로 정렬한다.

로그는 label selector로 파드를 먼저 찾고 파드마다 따로 조회한다. 한 파드의 조회가 실패해도 나머지 로그는 보여줘야 하므로 실패를 예외로 던지지 않고 `PodLog.error`에 담아 화면에 표시한다.

| 설정 | 기본값 |
|---|---|
| `karpenterNamespace` | `karpenter` |
| `karpenterPodLabelSelector` | `app.kubernetes.io/name=karpenter` |
| `karpenterLogSinceMinutes` | `15` (1~1440으로 제한) |

## NodePool / EC2NodeClass 탭

두 리소스를 name, ami, weight 세 칼럼으로 같이 보여준다. NodePool에는 ami가 없고 EC2NodeClass에는 weight가 없으므로 없는 필드는 `-`로 채운다. `kubectl get`의 List 항목에는 kind가 없어서 어느 리소스를 읽는지는 조회부가 알려준다.

ami는 `spec.amiSelectorTerms`를 `alias=al2023@latest` 같은 표기로 이어 붙여 보여주고, term이 없으면 예전 필드인 `spec.amiFamily`를 쓴다. 둘 다 없으면 `-`다.

karpenter가 없거나 CRD 조회 권한이 없는 클러스터도 있으므로 두 조회는 서로 독립이다. 한쪽이 실패하면 그 표 위에만 이유를 적고 다른 표는 그대로 보여준다.

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
