# SELinux와 dm-verity 핸즈온

Bottlerocket 보안 기능인 SELinux와 dm-verity의 이론, AL2023 EC2 실습, Docker 사용자 공간 실습을 다루는 workspace다.

글로벌 규칙은 @../../AGENTS.md를 따른다.

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../.claude/rules/knowledge.md)를 따른다.

## 검증 상태

- `scripts/verity-userspace.sh`는 compose 컨테이너(ubuntu 24.04)에서 실행해 출력을 docs 6의 A절에 옮겼다
- terraform은 `init -backend=false`, `fmt -check`, `validate`만 통과했다. AWS에 apply하지 않았다
- docs 5, 6의 B절, 7의 출력 예시는 예상값이다. 실측하면 결과로 바꾸고 문서 상단의 "확인 필요" 줄을 지운다
- 실측에서 먼저 볼 것은 AL2023에 `setools-console`이 있는지와 8765, 9999 포트의 기존 label이다

## 수정할 때

- docs 6의 A절 출력은 스크립트 출력이다. 스크립트를 바꾸면 다시 실행해 출력을 교체한다
- 시각화의 판정 규칙은 docs 1, 5의 예시와 같은 label을 쓴다. 한쪽 예시를 바꾸면 다른 쪽도 맞춘다
