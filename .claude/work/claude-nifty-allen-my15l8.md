# SSM Inventory 핸즈온 (PutInventory, EC2/ECS/Lambda 가능 여부)

- Issue: 미생성
- Branch: claude/nifty-allen-my15l8

## 실행 계획

- [x] 1. 공식 문서 조사 (PutInventory, custom inventory, quota, managed node 유형)
- [x] 2. workspace 생성 (aws/ssm/inventory, knowledge 복사, AGENTS.md)
- [x] 3. terraform (EC2, association, resource data sync S3)
- [x] 4. Python 스크립트 (PutInventory, 불가 대상 확인)
- [x] 5. docs 작성 (concept, 기본 수집, PutInventory, 불가 대상, data sync, setup)
- [-] 6. 실제 AWS 실행 — 건너뜀: 클라우드 세션에 AWS CLI와 자격증명 없음
- [x] 7. terraform validate, mermaid 렌더, python 문법 확인
- [ ] 8. knowledge, 루트 README, commit, push, Issue, PR

## 다음 세션이 알아야 할 것

- AWS 실습 미실행. 문서 출력 예시는 공식 문서 기준이며 README에 (실습 미진행) 표시
