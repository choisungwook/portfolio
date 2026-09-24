# Bottlerocket 핸즈온

Bottlerocket 원리, EC2 단독 실습(접속, 거부되는 작업, 설정과 A/B 업데이트), EKS NotReady 노드 긴급 접속 3가지 경로, 운영 주의사항을 다루는 workspace다. 문서 순서는 입문자 기준으로 EC2 단독이 EKS보다 앞이다. 순서를 바꾸기 전에 `knowledge/decisions/`의 문서 순서 결정을 읽는다.

글로벌 규칙은 @../../AGENTS.md를 따른다.

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../.claude/rules/knowledge.md)를 따른다.

## 검증 상태

- terraform/eks, terraform/ec2는 `init -backend=false`, `fmt -check`, `validate`만 통과했다. AWS에 apply하지 않았다
- user data TOML은 admin SSH 키가 있을 때와 없을 때 모두 렌더링해 Python `tomllib`로 파싱을 확인했다
- docs 4, 5, 6, 8의 결과 열은 Bottlerocket 공식 문서와 control, admin container 소스 기준 예상이다. 실측하면 결과로 바꾸고 문서 상단의 "확인 필요" 안내를 지운다. 8장의 `systemctl stop kubelet` 장애 재현도 미실측이다
- 실측에서 가장 먼저 볼 것은 EKS가 TOML user data에 `settings.kubernetes`를 병합하는지다. [7-setup-eks.md](docs/7-setup-eks.md)의 "노드가 조인하지 않을 때" 절

## 수정할 때

- user data TOML은 eks와 ec2가 같은 형태다. admin container 설정을 바꾸면 두 `user_data.tf`를 같이 고친다
- 실습 문서(3~8장)는 원리, 실습, 트러블슈팅, 정리 순서다. 절을 추가할 때 이 순서를 유지한다
