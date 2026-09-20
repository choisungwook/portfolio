# 시나리오 1용 지표 패널 분리

- Issue: 미생성
- Branch: claude/funny-ride-p76obc

## 실행 계획

- [x] 1. Grafana 대시보드 추가: 지표 하나에 패널 하나, 전부 timeseries
- [x] 2. cloudwatch-dashboard.sh 위젯 분리: Invocations 단독, input/output/캐시 각각
- [x] 3. docs/6-observe.md 대시보드 목록과 위젯 개수 갱신

## 다음 세션이 알아야 할 것

- LiteLLM 지표는 counter 누적, Bedrock 지표는 최근 10분 구간 합이라 패널에서 읽는 법이 다름
- increase()는 이 실험처럼 몇 초에 몰린 요청에서 값이 어긋남(6-observe.md). 누적 counter를 그대로 그리고 legend last로 읽음
