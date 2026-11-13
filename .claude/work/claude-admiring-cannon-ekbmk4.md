# 규칙 문장을 결정적 검사로 옮기기

- Issue: 미생성 (PR 직전에 생성)
- Branch: claude/admiring-cannon-ekbmk4

## 실행 계획

- [ ] 1. product 버전 올림 검사 (`check_product_versions.py`)
- [ ] 2. product 인덱스 3곳 일치 검사 (`check_product_index.py`)
- [ ] 3. Markdown 상대 링크, knowledge frontmatter 검사
- [ ] 4. workflow 이름 통일과 이름 형식 검사 (`unused/`는 건드리지 않음)
- [ ] 5. Terraform, Kubernetes, Python 규칙을 검사로 이전
- [ ] 6. product 공통 lint (biome, 바뀐 파일만)
- [ ] 7. 기능 지도와 공용 페이지 검증 스크립트 (2~3개 product)
- [ ] 8. 옮긴 문장을 규칙 파일에서 삭제, `verify-pull-request.yml` 연결
- [ ] 9. 서브에이전트 리뷰, Issue와 PR 생성

## 다음 세션이 알아야 할 것

- 검사 스크립트는 `.github/scripts/checks/`에 Python으로 둠. 외부 도구(tflint, trivy, kube-linter) 대신 저장소 규칙만 보는 자체 검사를 고름
- 추가된 파일의 실패는 PR 실패, 고친 기존 파일의 실패는 경고 (`verify-pull-request.yml` 기존 방식)
