# Cache Warmup 효과를 눈으로 확인하는 데모

## 요약

- **캐시 워밍업(Cache Warmup)은 애플리케이션 시작 시점에 캐시를 미리 채워두는 기법**
- 워밍업이 없으면 첫 요청들이 모두 DB를 조회해서 느림 (cold start)
- 워밍업이 있으면 첫 요청부터 캐시 히트로 빠른 응답
- 이 데모는 Kind 클러스터에 두 버전을 동시에 배포하고, K6 부하 테스트 + Grafana 대시보드로 차이를 비교

## 목차

- [캐시 워밍업이란?](#캐시-워밍업이란)
- [프로젝트 구조](#프로젝트-구조)
- [사전 준비](#사전-준비)
- [실습](#실습)
- [K6 부하 테스트](#k6-부하-테스트)
- [Grafana 대시보드](#grafana-대시보드)
- [정리](#정리)
- [참고자료](#참고자료)

## 캐시 워밍업이란?

Cache Warmup은 두 단어를 합친 용어입니다. Cache + Warmup

1. Cache: 자주 조회하는 데이터를 메모리에 저장해두는 저장소
2. Warmup: 미리 데이터를 채워두는 행위
3. Cache Warmup: **애플리케이션이 시작될 때, 트래픽을 받기 전에 캐시를 미리 채워두는 기법**

### 워밍업이 없으면 어떤 일이 생길까?

애플리케이션이 시작된 직후 캐시는 비어 있습니다. 모든 요청이 DB를 직접 조회하게 됩니다.

```
요청 → 캐시 확인 (비어있음) → DB 조회 (느림) → 캐시 저장 → 응답
```

트래픽이 많은 서비스에서 배포 직후 모든 요청이 DB로 몰리면 latency spike가 발생합니다.

### 워밍업을 하면?

시작 시점에 캐시를 채워두면 첫 요청부터 캐시 히트입니다.

```
[시작 시] DB 조회 → 캐시에 미리 저장
[요청 시] 요청 → 캐시 확인 (히트!) → 즉시 응답
```

## 프로젝트 구조

```
cache_warmup/
├── app/
│   ├── main.py              # FastAPI 애플리케이션
│   ├── run_with_warmup.py   # 워밍업 활성화 진입점
│   ├── requirements.txt
│   └── Dockerfile
├── k8s/
│   ├── app/
│   │   ├── deployment-no-warmup.yaml
│   │   ├── deployment-with-warmup.yaml
│   │   └── service.yaml
│   └── monitoring/
│       ├── prometheus-config.yaml
│       ├── prometheus.yaml
│       ├── grafana.yaml
│       ├── grafana-datasource.yaml
│       └── grafana-dashboard.yaml
├── k6/
│   ├── load-test.js         # 일정 부하 테스트
│   └── spike-test.js        # 스파이크 부하 테스트
├── kind-config.yaml
├── setup.sh                 # 한방 배포 스크립트
└── cleanup.sh               # 클러스터 삭제
```

두 개의 동일한 API를 배포합니다. 차이는 딱 하나, 시작할 때 캐시를 채우느냐 안 채우느냐입니다.

| 항목 | No Warmup | With Warmup |
|------|-----------|-------------|
| 시작 시 캐시 | 비어있음 | 100개 상품 미리 로드 |
| 첫 요청 latency | ~50ms (DB 조회) | ~0.1ms (캐시 히트) |
| NodePort | 30080 | 30081 |

## 사전 준비

- [Docker](https://docs.docker.com/get-docker/)
- [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [K6](https://k6.io/docs/get-started/installation/)

## 실습

### 1. 클러스터 생성 + 배포

`setup.sh` 하나로 Kind 클러스터 생성, 이미지 빌드, 앱 배포, 모니터링 배포까지 완료됩니다.

```bash
./setup.sh
```

### 2. 배포 확인

```bash
kubectl get pods
```

Pod 4개가 Running이면 정상입니다.

| Pod | 역할 |
|-----|------|
| product-api-no-warmup-* | 워밍업 없는 API |
| product-api-with-warmup-* | 워밍업 있는 API |
| prometheus-* | 메트릭 수집 |
| grafana-* | 대시보드 |

### 3. API 동작 확인

워밍업 없는 버전은 첫 요청에서 cache miss가 발생합니다.

```bash
curl http://localhost:30080/products/1
# {"data": {...}, "cache": "miss", "latency_ms": 50.xx}
```

워밍업 있는 버전은 첫 요청부터 cache hit입니다.

```bash
curl http://localhost:30081/products/1
# {"data": {...}, "cache": "hit", "latency_ms": 0.xx}
```

## K6 부하 테스트

### Load Test (일정 부하)

두 API에 초당 20개 요청을 60초간 보냅니다.

```bash
k6 run k6/load-test.js
```

### Spike Test (스파이크 부하)

초당 5 → 100 요청으로 급격히 증가하는 시나리오입니다. 배포 직후 트래픽이 몰리는 상황을 시뮬레이션합니다.

```bash
k6 run k6/spike-test.js
```

**스파이크 테스트에서 워밍업의 효과가 가장 두드러집니다.** 워밍업이 없으면 모든 요청이 DB를 조회하면서 latency가 치솟습니다.

## Grafana 대시보드

http://localhost:30030 에 접속하면 "Cache Warmup Comparison" 대시보드가 자동으로 프로비저닝되어 있습니다.

| 패널 | 설명 |
|------|------|
| P50 Latency Comparison | 중간값 latency 비교 |
| P99 Latency Comparison | 꼬리 latency 비교 |
| Request Rate | 초당 요청 수 (cache hit/miss 구분) |
| Cache Hit Rate | 캐시 적중률 (%) |
| Latency Heatmap | latency 분포를 히트맵으로 시각화 |

### 어떤 차이가 보일까?

- **No Warmup**: 초반에 cache miss가 대량 발생하면서 P99 latency가 50ms 이상
- **With Warmup**: 처음부터 cache hit이므로 P99 latency가 1ms 미만
- 시간이 지나면 No Warmup도 캐시가 채워지면서 latency가 떨어짐 → 하지만 이미 초반 사용자는 느린 응답을 경험

## 정리

```bash
./cleanup.sh
```

Kind 클러스터가 삭제됩니다.

## 참고자료

- https://fastapi.tiangolo.com/advanced/events/#lifespan
- https://kind.sigs.k8s.io/
- https://k6.io/docs/
- https://prometheus.io/docs/introduction/overview/
- https://grafana.com/docs/grafana/latest/
