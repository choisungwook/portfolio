# Bottlerocket 핸즈온

Bottlerocket 원리, EKS 노드 긴급 접속 3가지 경로, EC2 단독 실습, 운영 주의사항을 다루는 workspace다.

글로벌 규칙은 @../../AGENTS.md를 따른다.

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../.claude/rules/knowledge.md)를 따른다.

## 검증 상태

- terraform/eks, terraform/ec2는 `init -backend=false`, `fmt -check`, `validate`만 통과했다. AWS에 apply하지 않았다
- user data TOML은 admin SSH 키가 있을 때와 없을 때 모두 렌더링해 Python `tomllib`로 파싱을 확인했다
- docs 3, 5, 6의 결과 열은 Bottlerocket 공식 문서와 control, admin container 소스 기준 예상이다. 실측하면 결과로 바꾸고 문서 상단의 "확인 필요" 안내를 지운다
- 실측에서 가장 먼저 볼 것은 EKS가 TOML user data에 `settings.kubernetes`를 병합하는지다. [3-eks-emergency-access.md](docs/3-eks-emergency-access.md)의 병합 확인 절

## 수정할 때

- user data TOML은 eks와 ec2가 같은 형태다. admin container 설정을 바꾸면 두 `user_data.tf`를 같이 고친다
