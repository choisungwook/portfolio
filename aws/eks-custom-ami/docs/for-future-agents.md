# Agent Design Decisions

AI agent가 이 프로젝트를 이어받을 때 읽는 문서다.

## 변경 이력

### 2026-03-29 (Claude Opus 4.6)

- Karpenter 테스트 환경 추가 (manifests/karpenter/, Helm 설치 가이드)
- Terraform: `karpenter_enabled = true`, managed node group에 Name 태그 추가
- docs/concepts.md 결론 보강 (NodeConfig 처리 방식 Managed Node Group vs Karpenter 차이)
- docs/find-eks-ami.md 간소화 (공부 배경, 질문 섹션 제거)
- docs/hands-on.md에 Karpenter 테스트 섹션 추가

### 2026-03-27 (Claude Opus 4.6)

- 최초 작성: Packer 프로젝트, Terraform EKS 구성, 문서 일체
- Packer 빌드 성공 확인
- Managed Node Group 커스텀 AMI 노드 조인 성공 확인

## 검증된 것

- Packer 빌드 성공 (AMI 생성 확인)
- Packer v1.15.1 이상 필요 (v1.11.2에서는 plugin 404 오류)
- EKS 1.35 addon 버전: kube-proxy v1.35.2, vpc-cni v1.21.1, coredns v1.13.2, metrics-server v0.8.1
- 커스텀 AMI는 인증 모드와 무관 (AMI는 소프트웨어만 바꿈)
- 빌드한 AMI로 Managed Node Group 노드 조인 성공
- Default VPC public subnet에서 EKS 노드 정상 동작 확인
- 커스텀 AMI + Managed Node Group = user data에 NodeConfig 필수 (EKS 모듈이 자동 생성)

## 미검증

- Karpenter + 커스텀 AMI에서 NodeConfig 자동 생성 여부
- `dnf update --exclude`로 EKS 컴포넌트가 실제로 제외되는가
- cleanup 스크립트가 nodeadm/kubelet에 영향을 주지 않는가

## 설계 판단

- **Default VPC**: 비용 절약 (NAT Gateway 불필요). 핸즈온이라 보안 미고려.
- **AMI ID를 환경변수로 전달**: `TF_VAR_custom_ami_id`
- **packer/, terraform/ 분리**: 역할별 디렉터리 구분
- **EKS optimized AMI를 base로 사용**: kubelet, containerd, nodeadm이 사전 설치됨. 직접 설치하면 버전 호환성 문제.
- **Karpenter Helm 버전 명시**: install.md에 `KARPENTER_VERSION` 환경변수로 관리 (현재 1.10.0)
