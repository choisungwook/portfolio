# S06 자체 도메인 TLS NLB 직결(재암호화) 시나리오 추가

- Issue: 미생성 (repo-pr-ship 2단계에서 생성)
- Branch: claude/vpc-endpoint-agentcore-example-ggq0ao

## 실행 계획

- [x] 1. terraform/ root에 S06 opt-in 리소스 추가 (TLS NLB·TLS target group·Route 53 A alias·output)
- [x] 2. terraform test(mock)·fmt·validate 통과
- [x] 3. scenarios/s06_own_domain_tls_nlb.py + tests 작성, pytest·ruff 통과
- [x] 4. docs/scenarios/s06/1-setup.md, 2-experiment.md, 0-requirements·4-validation·8-runtime-config·README·AGENTS 갱신
- [x] 5. knowledge decision 추가, index·log 갱신
- [ ] 6. repo-pr-ship 실행 (MCP 환경: Copilot 리뷰 요청까지)

## 다음 세션이 알아야 할 것

- 이 환경은 gh CLI·terraform·aws CLI 없음. terraform은 scratchpad에 바이너리 내려받아 사용
- 실제 AWS 검증은 이 세션에서 불가. 문서에 "미검증" 상태로 명시
