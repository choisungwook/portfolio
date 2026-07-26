# 아키텍처

Electron + TypeScript 데스크톱 앱이다. 클러스터 조회는 Kubernetes client 라이브러리 없이 kubectl 명령을 직접 실행한다.

## 프로세스 구조

- `workspace/src/main/`: Electron main 프로세스. kubectl 실행, 설정 파일 저장, IPC 핸들러를 담당한다.
  - `main.ts`: 윈도우 생성과 IPC 핸들러 등록
  - `kubectl.ts`: kubectl 실행과 노드/파드 JSON 파싱
  - `settings.ts`: userData 경로의 settings.json 읽기/쓰기
  - `preload.ts`: contextBridge로 renderer에 `window.api` 노출
- `workspace/src/renderer/`: 화면. Nodes, Pods, Settings 3개 탭과 테이블 렌더링. 프레임워크 없이 DOM API만 사용한다.

renderer는 `nodeIntegration: false`, `contextIsolation: true`이며 main 프로세스와는 IPC(`kubectl:nodes`, `kubectl:pods`, `settings:get`, `settings:save`)로만 통신한다.

## kubectl 실행 흐름

설정된 kubectl 명령 문자열을 공백으로 분리해 shell 없이 execFile로 실행한다. proxy 환경(예: teleport)에서는 Settings 탭에서 명령을 tsh kubectl로 바꾸면 된다. shell을 거치지 않으므로 명령 문자열에 의한 인젝션이 없다.

노드 조회와 파드 조회에 사용하는 명령:

```bash
kubectl get nodes -o json
kubectl get pods --all-namespaces -o json
kubectl get pods --all-namespaces -o json --field-selector spec.nodeName=<노드이름>
```

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
