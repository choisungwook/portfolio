# LiteLLM(ECS) 멀티 계정 모니터링 방안 비교 핸즈온

- Issue: 미정 (repo-pr-ship에서 생성)
- Branch: claude/litellm-monitoring-architecture-sj0ory
- Workspace: aws/cloudwatch/multi-account-litellm

## 실행 계획

- [x] 1. workspace 골격, knowledge 복사
- [x] 2. 로컬 compose 실습(방안3 축소판: dev 1, prod 2 replica, 계정별 vmagent → 중앙 VictoriaMetrics + Grafana) 작성·기동·series 수 측정
- [x] 3. 비용 계산기(scripts/cost.py) 작성·실행
- [x] 4. terraform: source(ECS LiteLLM) + 방안1 대시보드 + 방안2 OAM + 방안3 self-hosted + 방안4 AMP/AMG, validate
- [x] 5. docs 작성(문제, setup, 방안 1~4, 추가 방안, 비교·추천)
- [x] 6. AGENTS.md, README, knowledge decision, 루트 README 목차
- [ ] 7. repo-pr-ship (Issue, PR, Copilot 리뷰, merge)

## 다음 세션이 알아야 할 것

- 가격 기준 2026-09, ap-northeast-2. 문서에 프로젝트 인원·기간은 쓰지 않음(사용자 지시)
- 조사 결과(가격, LiteLLM metrics, 버전)는 docs에 반영하며 출처를 남김
- 이 환경은 docker image blob 호스트가 정책 차단되어 compose 기동 불가. LiteLLM(PyPI 1.102.1), VictoriaMetrics·vmagent(GitHub release binary)를 네이티브로 띄워 같은 config로 검증함
- 측정값: replica당 LiteLLM series ≈ 23 + 93 × (key×model 조합). histogram bucket 18개가 대부분
- LiteLLM /metrics는 /metrics/로 307 redirect. require_auth_for_metrics_endpoint 기본값 true
- JSON_LOGS 로그에는 access log와 에러만 있고 team·model·token은 없음 → 비용 분석은 metric 또는 DB
- terraform: registry.terraform.io 차단 → releases.hashicorp.com 파일 미러(/tmp/claude-0/tfmirror, TF_CLI_CONFIG_FILE)로 init. validate·fmt·`terraform test`(mock provider plan 2개) 통과
- 수집기 설정 템플릿 4조합을 otelcol-contrib 0.158 validate로 확인(amp 조합은 STS 호출 단계까지 진행 = 스키마 통과)
- OTel prometheusremotewrite는 이름 중간 total을 지움 → add_metric_suffixes: false로 원래 이름 유지(대시보드 15개 쿼리 재검증 완료)
- 비용(기준): A 100 < 1·2 122 < 3 173 < B 191 < 4 223 USD/월. 대규모: 3 184 < 1·2 364 < A 534 < B 596 < 4 746
- 추천 결론: 2(OAM) 먼저 + LiteLLM metric은 4(AMP+AMG), IAM Identity Center 없거나 viewer 많으면 B, 비용 최소면 A PoC
