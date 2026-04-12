---
name: spring-observability-stack
description: >
  Spring Boot + HikariCP 실습 프로젝트에 Prometheus + Grafana 관측 스택을 붙인다.
  HikariCP 메트릭(acquire time, usage time, pending), JVM(heap, GC, loaded classes),
  process CPU, API latency p95/p99 패널이 포함된 대시보드를 자동으로 프로비저닝한다.
  Triggers on: "spring boot 모니터링", "grafana 대시보드", "hikaricp 메트릭",
  "관측 스택 붙여줘", "prometheus 붙여줘", "메트릭 보고 싶어", "actuator prometheus",
  "add monitoring", "add grafana", "add prometheus"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Spring Boot 관측 스택 적용 Skill

## 개요

`common/spring-observability-stack/`에 준비된 템플릿을 이용해서 Spring Boot 실습 프로젝트에
Prometheus + Grafana를 빠르게 붙인다.

실사례: `computer_science/jvm_warmup`

## 사전 조건 체크리스트

적용 전에 대상 프로젝트에서 다음을 확인한다.

- [ ] `pom.xml`에 `spring-boot-starter-actuator` 있음
- [ ] `pom.xml`에 `micrometer-registry-prometheus` 있음 (없으면 추가)
- [ ] `application.yml`에 `management.endpoints.web.exposure.include: prometheus` 있음
- [ ] `application.yml`에 `management.metrics.tags.app: ${APP_LABEL:이름}` 있음
- [ ] `docker-compose.yml`에 앱 서비스에 `APP_LABEL` 환경변수 있음

## 적용 절차

### 1단계 — 사전 조건 충족

**pom.xml에 추가:**

```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

**application.yml에 추가:**

```yaml
management:
  endpoints:
    web:
      exposure:
        include: prometheus,health,metrics
  metrics:
    tags:
      app: ${APP_LABEL:my-app}
    distribution:
      percentiles-histogram:
        http.server.requests: true
```

**docker-compose.yml 앱 서비스에 추가:**

```yaml
environment:
  APP_LABEL: my-app
```

### 2단계 — 관측 디렉터리 생성

`common/spring-observability-stack/` 구조를 기준으로 프로젝트 하위에 `observability/` 디렉터리를 만든다:

```
project/
└── observability/
    ├── prometheus.yml              # prometheus.yml.template 참고해서 작성
    └── grafana/
        ├── provisioning/
        │   ├── datasources/prometheus.yml
        │   └── dashboards/dashboards.yml
        └── dashboards/
            └── dashboard.json
```

`prometheus.yml` 작성 시 `common/spring-observability-stack/prometheus.yml.template`의
`{{APP_NAME}}`과 `{{APP_TARGET}}`을 실제 값으로 교체한다.

### 3단계 — docker-compose에 서비스 추가

`common/spring-observability-stack/docker-compose.observability.yml`의 서비스 블록을
프로젝트 `docker-compose.yml`에 병합한다.

### 4단계 — Makefile 타깃 추가 (선택)

```makefile
open:
 open http://localhost:3000
```

## 대시보드 패널 해석 가이드

| 패널 | 언제 보는가 | 이상 징후 |
|---|---|---|
| API Latency p95/p99 | 배포 직후, 부하 테스트 중 | 초기 스파이크 후 수렴하지 않음 |
| HikariCP Acquire Time | 배포 직후 | 지속적으로 높음 → pool 워밍업 필요 |
| HikariCP Usage Time | 쿼리 성능 분석 시 | 증가 추세 → 쿼리 최적화 필요 |
| HikariCP Active/Pending | 부하 테스트 중 | pending 지속 → pool size 증설 |
| JVM Heap | 장기 운영 중 | 계속 증가 → 메모리 누수 의심 |
| Process CPU | 배포 직후 | JIT 컴파일 구간 확인 (일시적 급등은 정상) |
| Request Rate | 항상 | 부하가 실제로 들어오는지 확인 |

## 여러 인스턴스 비교

동일 앱을 설정만 다르게 두 개 띄울 때 (예: jvm_warmup의 no-warmup vs with-warmup):

1. Prometheus 스크레이프 타깃을 두 개로 나눈다
2. 각 타깃에 `APP_LABEL`을 다르게 설정한다 (`no-warmup`, `with-warmup`)
3. Grafana 대시보드의 `$app` variable이 두 인스턴스를 자동으로 목록에 올린다

## 템플릿 위치

- 템플릿 디렉터리: `common/spring-observability-stack/`
- 일반화된 대시보드 JSON: `common/spring-observability-stack/grafana/dashboards/spring-hikaricp-jvm.json`
- 실사례 대시보드: `computer_science/jvm_warmup/observability/grafana/dashboards/jvm-warmup-dashboard.json`
