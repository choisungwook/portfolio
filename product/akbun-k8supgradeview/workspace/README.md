# akbun-k8supgradeview

EKS 업그레이드 작업 중 노드와 파드 상태를 한눈에 확인하는 데스크톱 앱이다. Electron + TypeScript로 만들었고 클러스터 조회는 Kubernetes client 라이브러리 대신 kubectl을 그대로 실행한다. teleport 같은 proxy 환경에서도 kubectl 명령만 바꾸면 동작하도록 하기 위함이다.

## 기능

- 노드 목록 조회: 이름, Internal IP, kubelet 버전, 상태, age, 소속 그룹(karpenter nodepool 또는 managed nodegroup)
- 노드 필터: Karpenter 노드, Managed NodeGroup 노드, cordon(SchedulingDisabled) 노드
- 노드 클릭 시 해당 노드에 스케줄된 파드 목록 표시
- 파드 목록 조회: namespace, 파드 이름, 상태, 스케줄된 노드. namespace 필터와 이름 검색 지원
- Settings에서 kubectl 실행 명령 변경. teleport를 쓰면 tsh kubectl로 설정한다
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
- src/renderer: 화면. 탭(Nodes, Pods, Settings)과 테이블 렌더링
- 노드 분류 기준: karpenter.sh/nodepool 또는 karpenter.sh/provisioner-name label이 있으면 Karpenter 노드, eks.amazonaws.com/nodegroup label이 있으면 Managed NodeGroup 노드로 판단한다
