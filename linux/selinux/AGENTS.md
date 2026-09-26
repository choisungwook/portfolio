# SELinux와 dm-verity 핸즈온

SELinux 판정 흐름과 컨테이너 라벨, dm-verity 해시 트리와 커널 검증을 실습하고 Bottlerocket 정책에 대응시키는 workspace다.

글로벌 규칙은 @../../AGENTS.md를 따른다.

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../.claude/rules/knowledge.md)를 따른다.

## 검증 상태

- docs/4의 출력은 veritysetup 2.7.0과 `dm-verity-lab/verity_tree.py`로 실측한 값이다. salt와 데이터가 고정이라 같은 root hash가 나와야 한다
- compose 빌드는 작성 환경에서 이미지 pull이 거부되어 돌리지 못했다
- terraform은 `init -backend=false`, `fmt -check`, `validate`만 통과했다. AWS에 apply하지 않았다
- docs/6, 7의 결과는 SELinux targeted 정책과 커널 dm-verity 문서 기준 예상이다. 실측하면 결과로 바꾸고 문서 상단의 "확인 필요" 안내를 지운다

## 수정할 때

- `verity_tree.py`의 계산식을 바꾸면 docs/2의 공식과 docs/4의 출력도 같이 고친다
- visualize/index.html의 트리 크기(데이터 블록 수, 해시 블록당 해시 수)는 설명용으로 줄인 값이다. 실제 값(128)은 docs/2에 있다
