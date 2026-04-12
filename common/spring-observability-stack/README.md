# Spring Boot 관측 스택 템플릿

Spring Boot + HikariCP 실습 프로젝트에 Prometheus와 Grafana를 빠르게 붙이기 위한 템플릿이다.

실사례: [`computer_science/jvm_warmup`](../../computer_science/jvm_warmup)

## 포함 내용

| 파일 | 설명 |
|---|---|
| `docker-compose.observability.yml` | Prometheus + Grafana 서비스 정의 |
| `prometheus.yml.template` | 스크레이프 설정 템플릿 (`{{APP_NAME}}`, `{{APP_TARGET}}` 교체 필요) |
| `grafana/provisioning/` | 데이터소스/대시보드 자동 프로비저닝 설정 |
| `grafana/dashboards/spring-hikaricp-jvm.json` | HikariCP + JVM + Latency 대시보드 |

## 사전 조건

새 Spring Boot 프로젝트에 붙이기 전에 다음 세 가지를 확인한다.

**pom.xml에 의존성 추가:**

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

**application.yml에 엔드포인트 노출:**

```yaml
management:
  endpoints:
    web:
      exposure:
        include: prometheus,health,metrics
  metrics:
    tags:
      # Grafana에서 앱을 구분하는 label — 반드시 설정한다
      app: ${APP_LABEL:my-app}
    distribution:
      percentiles-histogram:
        http.server.requests: true
```

**docker-compose 환경변수 추가:**

```yaml
environment:
  APP_LABEL: my-app
```

## 적용 절차

1. 이 디렉터리 전체를 프로젝트 하위로 복사한다:

```bash
cp -r common/spring-observability-stack/. my-project/observability/
```

1. `prometheus.yml.template`을 `observability/prometheus.yml`로 복사하고 플레이스홀더를 교체한다:

```bash
sed 's/{{APP_NAME}}/my-app/g; s/{{APP_TARGET}}/app:8080/g' \
  prometheus.yml.template > prometheus.yml
```

1. 프로젝트의 `docker-compose.yml`에 Prometheus/Grafana 서비스를 추가한다. `docker-compose.observability.yml`에서 services 블록을 복사한다.

2. 스택을 실행하고 `http://localhost:3000`에서 대시보드를 확인한다:

```bash
docker compose up -d --build
```

## 대시보드 패널 설명

| 패널 | 무엇을 보는가 |
|---|---|
| API Latency p95/p99 | 배포 직후 스파이크 여부 |
| HikariCP Acquire Time | connection 대기 시간 — 높으면 pool 워밍업 필요 |
| HikariCP Usage Time | 쿼리 실행 시간 자체 |
| HikariCP Active/Pending | pending이 지속되면 pool size 증설 검토 |
| JVM Heap | GC 압력 추이 |
| Process CPU | JIT 컴파일 구간 식별 |
| Request Rate | 부하 수준 확인 |

## 커스터마이징

- 인스턴스가 여러 개이면 Prometheus 스크레이프 타깃을 추가하고 `app` label을 다르게 설정한다. Grafana 대시보드의 `$app` variable이 자동으로 목록을 만들어준다.
- 스크레이프 간격(`scrape_interval`)은 실습에서는 2s, 장기 운영에서는 15s 이상으로 늘린다.
