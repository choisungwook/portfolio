# JVM Heap Xms vs Xmx 차이 테스트

JVM의 `-Xms`(초기 힙 크기)와 `-Xmx`(최대 힙 크기) 설정이 애플리케이션 성능에 미치는 영향을 비교 테스트하는 프로젝트.

## 핵심 차이점

| 설정 | Xms == Xmx (`-Xms256m -Xmx256m`) | Xms < Xmx (`-Xms64m -Xmx256m`) |
|------|-----------------------------------|----------------------------------|
| 초기 힙 크기 | 256MB (전체 확보) | 64MB (최소한으로 시작) |
| 힙 리사이징 | 없음 | 부하 시 동적으로 확장 |
| GC 빈도 | 상대적으로 낮음 | 힙이 작을 때 빈번하게 발생 |
| 응답 시간 | 안정적 | 힙 확장 시 jitter 발생 |
| 메모리 효율 | 시작부터 전체 점유 | 필요할 때만 확장 |

## 프로젝트 구조

```
backend/jvm_heap_xms/
├── src/                          # Spring Boot 소스
├── k8s/                          # Kubernetes 매니페스트
│   ├── kind-config.yaml          # Kind 클러스터 설정 (NodePort 매핑)
│   ├── namespace.yaml
│   ├── deployment-xms-equal-xmx.yaml   # Xms == Xmx 디플로이먼트
│   ├── deployment-xms-less-xmx.yaml    # Xms < Xmx 디플로이먼트
│   ├── service-xms-equal-xmx.yaml      # NodePort 30081
│   └── service-xms-less-xmx.yaml       # NodePort 30082
├── k6/                           # k6 부하 테스트 스크립트
│   ├── scenario1-allocate.js     # 대량 할당/해제 시나리오
│   ├── scenario2-hold.js         # 메모리 점유 시나리오
│   └── scenario3-mixed.js        # 혼합 시나리오
├── Dockerfile
├── docker-compose.yml
└── build.gradle
```

## API 엔드포인트

| 엔드포인트 | 설명 | 파라미터 |
|------------|------|---------|
| `GET /allocate` | 메모리 할당 후 즉시 해제 | `sizeMb` (기본 10), `count` (기본 50) |
| `GET /hold` | 메모리를 일정 시간 유지 | `sizeMb` (기본 5), `holdMs` (기본 500) |
| `GET /heap` | 현재 힙 메모리 상태 조회 | 없음 |
| `GET /actuator/health/liveness` | Liveness probe | 없음 |
| `GET /actuator/health/readiness` | Readiness probe | 없음 |

## 실행 방법

### 1. Docker Compose로 실행 (로컬 테스트)

```bash
cd backend/jvm_heap_xms

# 빌드 및 실행
docker compose up --build -d

# 확인
curl http://localhost:8081/heap   # Xms == Xmx
curl http://localhost:8082/heap   # Xms < Xmx
```

### 2. Kind 클러스터에서 실행

```bash
# Kind 클러스터 생성
kind create cluster --name heap-test --config k8s/kind-config.yaml

# Docker 이미지 빌드
docker build -t heap-test:latest .

# Kind에 이미지 로드
kind load docker-image heap-test:latest --name heap-test

# Kubernetes 리소스 배포
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deployment-xms-equal-xmx.yaml
kubectl apply -f k8s/deployment-xms-less-xmx.yaml
kubectl apply -f k8s/service-xms-equal-xmx.yaml
kubectl apply -f k8s/service-xms-less-xmx.yaml

# Pod 상태 확인
kubectl get pods -n heap-test -w

# 접속 확인
curl http://localhost:30081/heap   # Xms == Xmx
curl http://localhost:30082/heap   # Xms < Xmx
```

### 3. k6 부하 테스트 실행

```bash
# 시나리오 1: 대량 할당/해제 (Xms == Xmx)
k6 run --env TARGET=http://localhost:30081 k6/scenario1-allocate.js

# 시나리오 1: 대량 할당/해제 (Xms < Xmx)
k6 run --env TARGET=http://localhost:30082 k6/scenario1-allocate.js

# 시나리오 2: 메모리 점유 (Xms == Xmx)
k6 run --env TARGET=http://localhost:30081 k6/scenario2-hold.js

# 시나리오 2: 메모리 점유 (Xms < Xmx)
k6 run --env TARGET=http://localhost:30082 k6/scenario2-hold.js

# 시나리오 3: 혼합 부하 (Xms == Xmx)
k6 run --env TARGET=http://localhost:30081 k6/scenario3-mixed.js

# 시나리오 3: 혼합 부하 (Xms < Xmx)
k6 run --env TARGET=http://localhost:30082 k6/scenario3-mixed.js
```

## 테스트 시나리오 설명

### 시나리오 1: allocate & release (`scenario1-allocate.js`)
- 10MB 바이트 배열을 50회 반복 할당 후 해제
- **관측 포인트**: 힙 확장(heap resizing)으로 인한 응답 시간 차이
- **예상 결과**: `Xms < Xmx`에서 p99 응답 시간이 더 높게 나타남

### 시나리오 2: allocate & hold (`scenario2-hold.js`)
- 5MB를 할당하고 500ms 동안 유지
- 동시 요청이 많아지면 힙 사용량이 누적됨
- **관측 포인트**: 동시 메모리 점유 시 GC 빈도와 stop-the-world 시간
- **예상 결과**: `Xms < Xmx`에서 응답 시간 변동폭(jitter)이 더 큼

### 시나리오 3: 혼합 부하 (`scenario3-mixed.js`)
- allocate와 hold를 동시에 실행하는 혼합 워크로드
- **관측 포인트**: Xms/Xmx 차이가 가장 극적으로 드러나는 시나리오
- **예상 결과**: `Xms < Xmx`에서 Full GC가 발생할 가능성이 높음

## 관측 방법

### GC 로그 확인
```bash
# Docker
docker logs heap-test-equal 2>&1 | grep "GC"
docker logs heap-test-different 2>&1 | grep "GC"

# Kubernetes
kubectl logs -n heap-test deployment/heap-test-equal | grep "GC"
kubectl logs -n heap-test deployment/heap-test-different | grep "GC"
```

### Prometheus 메트릭
```bash
curl http://localhost:30081/actuator/prometheus | grep jvm_memory
curl http://localhost:30082/actuator/prometheus | grep jvm_memory
```

## 정리

```bash
# Kind 클러스터 삭제
kind delete cluster --name heap-test

# Docker Compose 정리
docker compose down
```
