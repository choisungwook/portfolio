# ADR

akbun-k8supgradeview 프로젝트의 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

* [kubectl 직접 실행](2026-07-kubectl-exec.md) - Kubernetes client 라이브러리 대신 kubectl 명령을 실행하기로 한 결정.
* [Electron + TypeScript, 번들러 없는 빌드](2026-07-electron-typescript.md) - 기술 스택과 tsc 단독 빌드 구성을 정한 결정.
* [package.json version 기반 macOS arm64 전용 릴리즈](2026-07-release-workflow.md) - version을 태그로 쓰고 macOS arm64 dmg만 빌드하기로 한 결정.
* [업데이트는 dmg 직접 내려받기와 번들 교체](2026-07-update-download-and-swap.md) - GitHub Release 조회와 .app 교체로 업데이트를 구현하고 디스크 누수 방지를 테스트로 검증하기로 한 결정.
* [cordon과 uncordon은 노드 행의 토글 버튼 하나로 둔다](2026-07-node-cordon-toggle.md) - Action 칼럼에 상태에서 파생되는 버튼 하나를 두고 실행 전 확인 dialog를 두기로 한 결정.
* [이름 복사, EC2NodeClass 그룹핑, error 키워드 하이라이트](2026-07-name-copy-and-error-highlight.md) - 노드 이름 복사를 main clipboard로 두고, EC2NodeClass를 nodeClassRef 기준으로 묶고, error 낱말을 색으로 표시하기로 한 결정.
* [Pods 탭 정렬은 헤더 클릭, 상태 필터는 Running 아닌 것만 남기는 토글 하나로 둔다](2026-07-pod-sort-and-status-filter.md) - 정렬 대상을 Namespace와 Status로 좁히고 상태 필터를 토글 하나로 두기로 한 결정.
* [Utilize 탭은 over-provisioning manifest를 만들기만 하고 적용하지 않는다](2026-07-overprovision-manifest-generator.md) - manifest 출력 형태와 생성 로직을 main의 순수 함수로 두기로 한 결정.
* [NodePool 표는 숫자 칼럼을 정렬하고 EC2NodeClass 표는 평평하게 되돌린다](2026-07-nodepool-sort-and-flat-ec2nodeclass.md) - NodePool의 AMI 칼럼을 없애고 Weight/Nodes 정렬을 넣으며 EC2NodeClass 그룹핑을 걷어내기로 한 결정.
* [파드 describe는 이름 클릭으로 여는 오른쪽 사이드 패널에서 원문 그대로 보여준다](2026-07-pod-describe-side-panel.md) - describe 출력을 파싱하지 않고 겹치는 사이드 패널에 붙이기로 한 결정.
