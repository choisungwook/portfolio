# EKS Custom AMI — Agent Context

## 프로젝트 목적

AWS EKS optimized AMI(AL2023, x86_64)를 base로 추가 패키지를 설치한 커스텀 AMI를 Packer로 빌드한다.

## 핵심 제약

- EKS 핵심 컴포넌트(kubelet, containerd, nodeadm)를 수정하지 않는다
- Shell script provisioner를 사용한다 (Ansible 아님)
- Public SSH로 Packer가 EC2에 접근한다 (SSM은 별도 주제)
- 패키지 설치는 `scripts/setup.sh`의 Step 2에 추가한다

## Used Skills

| 작업 | Skill |
|------|-------|
| 기술 문서 작성 | `writing-with-akbunstyle` |
| 커밋 메시지 | `suggest-git-commit-message` |
| PR 생성 | `create-github-pr` |
| 문서 리뷰 | `docs_reviewer` |
