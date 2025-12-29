# Gateway API vs Ingress 비교

동일한 Private ALB HTTP 설정을 Gateway API와 Ingress로 구현한 비교 자료입니다.

## 아키텍처

두 방식 모두 동일한 결과를 만듭니다:
- **Private ALB** (internal scheme)
- **HTTP:80** listener
- **IP target mode** (Pod IP 직접 등록)
- **Route53 레코드**: private-alb-http.choilab.xyz

---

## Gateway API 방식

### 필요한 리소스 (5개)

```
1. GatewayClass      ← 컨트롤러 지정
2. Gateway           ← ALB 생성 (listeners 정의)
3. HTTPRoute         ← 라우팅 규칙
4. TargetGroupConfiguration ← Target Group 설정
5. Service + Deployment
```

### 1. GatewayClass (gatewayclass.yaml)

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: alb
spec:
  controllerName: gateway.k8s.aws/alb
```

**역할**: ALB Controller를 사용하도록 지정

---

### 2. Gateway (gateway.yaml)

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: priavte-alb-http
spec:
  gatewayClassName: alb
  listeners:
  - name: http
    protocol: HTTP
    port: 80
```

**역할**:
- ALB 생성 (scheme은 subnet tag로 자동 결정)
- HTTP:80 listener 정의

**특징**:
- Scheme, Subnet 등의 AWS 설정은 별도 리소스로 분리
- Listener만 선언적으로 정의

---

### 3. HTTPRoute (httproute.yaml)

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: private-alb-http-route
spec:
  parentRefs:
  - name: priavte-alb-http
  hostnames:
  - "private-alb-http.choilab.xyz"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: backend
      port: 3000
```

**역할**:
- Gateway와 Service 연결
- Hostname, 경로 기반 라우팅 정의
- ExternalDNS가 `spec.hostnames` 읽음

**특징**:
- Gateway와 분리된 라우팅 규칙
- 여러 HTTPRoute가 하나의 Gateway 공유 가능

---

### 4. TargetGroupConfiguration (targetgroupconfig.yaml)

```yaml
apiVersion: gateway.k8s.aws/v1beta1
kind: TargetGroupConfiguration
metadata:
  name: backend-tg-config
spec:
  targetReference:
    name: backend
  defaultConfiguration:
    targetType: ip
    protocol: HTTP
    healthCheckConfig:
      healthCheckProtocol: HTTP
      healthCheckPath: /
      healthCheckPort: "3000"
      healthCheckInterval: 30
      healthCheckTimeout: 5
      healthyThresholdCount: 2
      unhealthyThresholdCount: 2
```

**역할**:
- Target Group 설정 (IP mode, Health Check)

**특징**:
- Service별로 독립적인 설정 가능
- AWS 전용 CRD

---

## Ingress 방식

### 필요한 리소스 (2개)

```
1. Ingress           ← 모든 설정이 annotation에
2. Service + Deployment
```

### Ingress (ingress.yaml)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: private-alb-http
  annotations:
    # ALB Controller 지정
    kubernetes.io/ingress.class: alb

    # Scheme: internal
    alb.ingress.kubernetes.io/scheme: internal

    # Target Type: IP mode
    alb.ingress.kubernetes.io/target-type: ip

    # Listener: HTTP:80
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP":80}]'

    # Health Check
    alb.ingress.kubernetes.io/healthcheck-protocol: HTTP
    alb.ingress.kubernetes.io/healthcheck-port: "3000"
    alb.ingress.kubernetes.io/healthcheck-path: /
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: "30"
    alb.ingress.kubernetes.io/healthcheck-timeout-seconds: "5"
    alb.ingress.kubernetes.io/healthy-threshold-count: "2"
    alb.ingress.kubernetes.io/unhealthy-threshold-count: "2"

    # ExternalDNS
    external-dns.alpha.kubernetes.io/hostname: private-alb-http.choilab.xyz
spec:
  rules:
  - host: private-alb-http.choilab.xyz
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: backend
            port:
              number: 3000
```

**역할**:
- ALB 생성 + Listener + Target Group + 라우팅 규칙 모두 포함

**특징**:
- 모든 설정이 annotation으로 집중
- 하나의 리소스로 완결

---

## 비교표

### 리소스 수

| 항목 | Gateway API | Ingress |
|------|-------------|---------|
| **필요한 리소스** | 5개 (GatewayClass, Gateway, HTTPRoute, TargetGroupConfig, Service) | 2개 (Ingress, Service) |
| **설정 복잡도** | 분산됨 | 집중됨 |

### 설정 위치

| 설정 항목 | Gateway API | Ingress |
|----------|-------------|---------|
| **Controller 지정** | GatewayClass.spec.controllerName | annotation: kubernetes.io/ingress.class |
| **Scheme** | LoadBalancerConfiguration.spec.scheme 또는 자동 | annotation: alb.ingress.kubernetes.io/scheme |
| **Listener** | Gateway.spec.listeners | annotation: alb.ingress.kubernetes.io/listen-ports |
| **Target Type** | TargetGroupConfiguration.defaultConfiguration.targetType | annotation: alb.ingress.kubernetes.io/target-type |
| **Health Check** | TargetGroupConfiguration.defaultConfiguration.healthCheckConfig | annotation: alb.ingress.kubernetes.io/* |
| **Hostname** | HTTPRoute.spec.hostnames | Ingress.spec.rules[].host |
| **라우팅** | HTTPRoute.spec.rules | Ingress.spec.rules[].http.paths |

### 설정 방식

| 측면 | Gateway API | Ingress |
|------|-------------|---------|
| **설정 분리** | ✅ 인프라(Gateway), 라우팅(HTTPRoute), Target(TargetGroupConfig) 분리 | ❌ 모두 하나의 리소스에 집중 |
| **재사용성** | ✅ 하나의 Gateway를 여러 HTTPRoute가 공유 | ❌ Ingress마다 독립적 |
| **타입 안정성** | ✅ CRD로 타입 검증 | ❌ Annotation은 문자열 (오타 위험) |
| **표준화** | ✅ Kubernetes 표준 API | ⚠️ 컨트롤러마다 annotation 다름 |
| **학습 곡선** | 높음 (여러 리소스 이해 필요) | 낮음 (하나의 리소스만) |
| **마이그레이션** | 어려움 (여러 리소스 작성) | 쉬움 (기존 annotation 활용) |

### ExternalDNS 연동

| 항목 | Gateway API | Ingress |
|------|-------------|---------|
| **Hostname 위치** | HTTPRoute.spec.hostnames | Ingress.spec.rules[].host |
| **ExternalDNS annotation** | 불필요 (spec 사용 권장) | Ingress metadata.annotations |
| **Sources 설정** | `gateway-httproute` | `ingress` |

### 고급 기능

| 기능 | Gateway API | Ingress |
|------|-------------|---------|
| **Multi-listener** | ✅ Gateway.spec.listeners 배열 | ⚠️ annotation 복잡 |
| **Weight 기반 라우팅** | ✅ HTTPRoute.backendRefs[].weight | ❌ 지원 안 함 (Ingress 표준) |
| **Header 기반 라우팅** | ✅ HTTPRoute.matches[].headers | ⚠️ annotation 필요 |
| **여러 Gateway 공유** | ✅ HTTPRoute.parentRefs 배열 | ❌ 불가능 |

---

## 장단점

### Gateway API

**장점**:
- ✅ 관심사 분리: 인프라 팀(Gateway), 개발 팀(HTTPRoute) 역할 분리
- ✅ 재사용성: 하나의 Gateway를 여러 HTTPRoute가 공유
- ✅ 타입 안전: CRD 스키마로 검증
- ✅ 표준화: Kubernetes 표준 API (벤더 중립)
- ✅ 고급 라우팅: Weight, Header 매칭 등 내장

**단점**:
- ❌ 복잡성: 여러 리소스 이해 필요
- ❌ 학습 곡선: 개념 이해에 시간 필요
- ❌ 마이그레이션 비용: Ingress에서 전환 시 리팩토링 필요

### Ingress

**장점**:
- ✅ 단순함: 하나의 리소스로 완결
- ✅ 학습 곡선: 이해하기 쉬움
- ✅ 레거시 호환: 기존 시스템과 통합 용이

**단점**:
- ❌ Annotation 지옥: 모든 설정이 문자열 annotation
- ❌ 벤더 종속: ALB Controller 전용 annotation
- ❌ 타입 안전성 부족: 오타 시 런타임 에러
- ❌ 재사용성 부족: Ingress마다 중복 설정

---

## 배포 순서 비교

### Gateway API
```sh
kubectl apply -f gatewayclass.yaml
kubectl apply -f gateway.yaml
kubectl apply -f backend.yaml
kubectl apply -f targetgroupconfig.yaml
kubectl apply -f httproute.yaml
```

### Ingress
```sh
kubectl apply -f backend.yaml
kubectl apply -f ingress.yaml
```

---

## 언제 무엇을 사용할까?

### Gateway API를 사용하는 경우

- ✅ 새로운 프로젝트 시작
- ✅ 멀티 테넌트 환경 (플랫폼 팀 vs 개발 팀 역할 분리)
- ✅ 고급 라우팅 기능 필요 (Weight, Header 매칭)
- ✅ 여러 Route가 하나의 Gateway 공유
- ✅ 벤더 중립적 설정 선호

### Ingress를 사용하는 경우

- ✅ 기존 Ingress 사용 중 (마이그레이션 비용)
- ✅ 단순한 HTTP 라우팅만 필요
- ✅ 빠른 프로토타이핑
- ✅ 팀의 Ingress 경험 풍부

---

## 결론

| 측면 | 추천 |
|------|------|
| **새 프로젝트** | Gateway API |
| **레거시 유지보수** | Ingress |
| **엔터프라이즈 환경** | Gateway API |
| **간단한 앱** | Ingress |
| **장기적 관점** | Gateway API (Kubernetes 표준) |

Gateway API는 Ingress의 다음 세대로 설계되었으며, Kubernetes 커뮤니티의 공식 표준입니다. 초기 학습 비용은 있지만, 장기적으로는 더 나은 선택입니다.
