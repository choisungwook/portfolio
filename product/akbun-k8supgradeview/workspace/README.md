# akbun-k8supgradeview

EKS 업그레이드 작업 중 노드와 파드 상태를 한눈에 확인하는 데스크톱 앱이다. Electron + TypeScript로 만들었고 클러스터 조회는 Kubernetes client 라이브러리 대신 kubectl을 그대로 실행한다. teleport 같은 proxy 환경에서도 kubectl 명령만 바꾸면 동작하도록 하기 위함이다.

## 기능

- 노드 목록 조회: 이름, Internal IP, kubelet 버전, 상태, age, 소속 그룹(karpenter nodepool 또는 managed nodegroup)
- 노드 필터: Karpenter 노드, Managed NodeGroup 노드, cordon(SchedulingDisabled) 노드
- 노드 클릭 시 해당 노드에 스케줄된 파드 목록 표시
- 노드 행 끝 Action 칼럼의 버튼으로 cordon / uncordon 실행. 버튼 글자는 현재 상태에 따라 바뀌고 누르면 확인 창이 한 번 뜬다
- 파드 목록 조회: namespace, 파드 이름, 상태, 스케줄된 노드. namespace 필터와 이름 검색 지원
- 파드 정렬: Namespace와 Status 헤더를 누르면 알파벳 순으로 정렬하고, 같은 헤더를 다시 누르면 방향을 뒤집는다
- 파드 상태 필터: "Running 아닌 파드만" 버튼으로 Running에서 벗어난 파드만 남긴다
- 파드 describe: 파드 이름을 누르면 오른쪽에 사이드 패널이 열리고 kubectl describe pod 결과를 그대로 보여준다. 복사, 새로고침, 닫기(Escape) 지원
- Karpenter Event 탭: karpenter deployment에서 읽은 버전과 image, karpenter namespace의 event를 시간순으로, label selector로 찾은 karpenter 파드의 최근 로그를 함께 보여준다
- NodePool / EC2NodeClass 탭: NodePool은 name, nodeClass, weight, nodes(그 NodePool이 만든 노드 수), ready, age를, EC2NodeClass는 name, ami를 보여준다. 리소스에 없는 필드는 -로 표시한다
- NodePool 정렬: Weight와 Nodes 헤더를 누르면 숫자 크기순으로 정렬한다. 값이 없는(-) 줄은 늘 맨 뒤에 둔다
- Utilize 탭: Karpenter over-provisioning manifest 생성. namespace를 골라 그 수만큼 Deployment를 만들고 `---`로 이어 붙인다. cpu request와 limit, replica, pause image를 지정할 수 있다. 만들기만 하고 클러스터에 적용하지는 않는다
- Settings에서 kubectl 실행 명령 변경. teleport를 쓰면 tsh kubectl로 설정한다
- Settings에서 karpenter namespace(기본 karpenter), 파드 label selector(기본 app.kubernetes.io/name=karpenter), 로그 조회 범위(기본 15분) 변경
- 상단 메뉴 {앱 이름} > 업데이트 확인. GitHub Release의 최신 버전과 비교해 새 버전이면 dmg를 받아 앱을 교체하고 재실행한다

## 요구사항

- kubectl이 설치되어 있고 현재 kubeconfig context가 대상 클러스터를 가리켜야 한다
- teleport 사용 시 tsh 로그인이 되어 있어야 한다

## 개발 환경 실행

의존성을 설치하고 앱을 실행한다.

```bash
npm ci
npm run start
```

## 패키징

electron-builder로 현재 OS용 설치 파일을 만든다. 결과물은 release 디렉터리에 생긴다.

```bash
npm run dist
```

## 릴리즈

master 브랜치에 이 디렉터리 변경이 머지되면 GitHub Actions(release-k8supgradeview)가 package.json의 version을 읽어 akbun-k8supgradeview-v<version> 태그와 릴리즈를 만든다. macOS Apple Silicon(arm64) dmg만 빌드한다. 새 릴리즈를 내려면 package.json의 version을 올리고 머지한다.

## 구조

- src/main: Electron main 프로세스. kubectl 실행, 설정 저장, IPC 핸들러
- src/renderer: 화면. 탭(Nodes, Pods, Karpenter Event, NodePool / EC2NodeClass, Utilize, Settings)과 테이블 렌더링
- 노드 분류 기준: karpenter.sh/nodepool 또는 karpenter.sh/provisioner-name label이 있으면 Karpenter 노드, eks.amazonaws.com/nodegroup label이 있으면 Managed NodeGroup 노드로 판단한다
