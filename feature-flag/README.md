# Feature Flag 실습 예제

## Feature Flag란?

Feature Flag(기능 플래그)는 **코드 배포 없이 기능을 켜고 끌 수 있는 기술**입니다.

### 왜 사용하는가?

| 상황 | Feature Flag 없이 | Feature Flag 사용 |
|------|-------------------|-------------------|
| 새 기능 출시 | 코드 배포 필요 | 플래그만 켜면 됨 |
| 장애 발생 | 롤백 배포 필요 | 플래그만 끄면 됨 |
| A/B 테스트 | 별도 시스템 필요 | 사용자 비율로 조절 |
| 점진적 출시 | 어려움 | 1% → 10% → 100% |

### Feature Flag 사용 사례

```
배포 완료 → 플래그 OFF (기능 숨김) → QA 검증 → 플래그 ON (기능 공개) → 문제 발생 → 플래그 OFF (즉시 비활성화)
```

## 예제 목록

| 예제 | 설명 | 난이도 |
|------|------|--------|
| [01_basic](./01_basic/) | JSON 파일로 feature flag 관리 | 쉬움 |
| [02_env_based](./02_env_based/) | 환경 변수 기반 feature flag + 쿠버네티스 ConfigMap | 보통 |
| [03_openfeature_flagd](./03_openfeature_flagd/) | OpenFeature(CNCF) + flagd로 실시간 feature flag | 보통 |

## 예제 1: JSON 파일 기반 (01_basic)

가장 단순한 방법입니다. JSON 파일을 수정하면 기능이 바로 바뀝니다.

### 실행

```bash
cd 01_basic
docker compose up --build
```

### 테스트

```bash
# 현재 feature flag 상태 확인
curl http://localhost:5000/flags

# 결제 API 호출 (할인 OFF, 새 결제수단 OFF)
curl http://localhost:5000/checkout
```

### feature flag 변경

`01_basic/app/feature_flags.json` 파일을 수정합니다.

```json
{
  "enable_discount": true,
  "discount_rate": 15,
  "enable_new_payment": true
}
```

```bash
# 변경 후 다시 호출하면 할인이 적용되고 결제수단이 추가됨
curl http://localhost:5000/checkout
```

## 예제 2: 환경 변수 기반 (02_env_based)

환경 변수로 feature flag를 관리합니다. 쿠버네티스 ConfigMap과 함께 사용하기 좋습니다.

### 실행

```bash
cd 02_env_based
docker compose up --build
```

### 테스트

docker-compose에서 동일한 앱을 feature flag ON/OFF 두 개로 실행합니다.

```bash
# feature flag OFF 상태 (포트 5001)
curl http://localhost:5001/api/users
# 결과: 기본 필드만 반환

# feature flag ON 상태 (포트 5002)
curl http://localhost:5002/api/users
# 결과: profile_image, last_login 추가 필드 반환
```

### 쿠버네티스에서 사용

```bash
# ConfigMap 적용
kubectl apply -f kubernetes/configmap.yaml
kubectl apply -f kubernetes/deployment.yaml

# feature flag 변경: ConfigMap 수정 후 rollout restart
kubectl edit configmap feature-flags
kubectl rollout restart deployment feature-flag-app
```

## 예제 3: OpenFeature + flagd (03_openfeature_flagd)

[OpenFeature](https://openfeature.dev/)는 CNCF 프로젝트로, feature flag의 **업계 표준 API**입니다.
[flagd](https://flagd.dev/)는 OpenFeature와 함께 사용하는 경량 feature flag 서버입니다.

### 장점

- 벤더 종속성 없음: LaunchDarkly, Split 등 어떤 백엔드든 provider만 교체하면 됨
- 실시간 반영: JSON 파일 수정 시 flagd가 자동으로 감지하여 반영
- 다양한 flag 타입: boolean, string, integer, object 지원

### 실행

```bash
cd 03_openfeature_flagd
docker compose up --build
```

### 테스트

```bash
# 현재 feature flag 상태 확인
curl http://localhost:5000/

# 결제 페이지 (new-checkout-flow가 off이므로 v1)
curl http://localhost:5000/checkout

# 배너 메시지 (기본값은 비어있음)
curl http://localhost:5000/banner
```

### feature flag 변경

`03_openfeature_flagd/flagd/flags.flagd.json` 파일의 `defaultVariant`를 수정합니다.

```json
{
  "new-checkout-flow": {
    "defaultVariant": "on"
  },
  "banner-message": {
    "defaultVariant": "sale"
  }
}
```

flagd가 파일 변경을 자동 감지하므로, **재시작 없이** 바로 반영됩니다.

```bash
# 변경 후 다시 호출
curl http://localhost:5000/checkout
# 결과: checkout_version이 v2로 변경

curl http://localhost:5000/banner
# 결과: 설날 맞이 할인 배너 표시
```

## Feature Flag 관리 도구 비교

| 도구 | 종류 | 특징 |
|------|------|------|
| JSON 파일 | 자체 구현 | 가장 단순, 소규모 프로젝트에 적합 |
| 환경 변수 | 자체 구현 | 12-Factor App, 쿠버네티스 ConfigMap 연동 |
| [flagd](https://flagd.dev/) | 오픈소스 | CNCF, 경량, 실시간 반영 |
| [Unleash](https://www.getunleash.io/) | 오픈소스 | UI 대시보드, A/B 테스트, 자체 호스팅 |
| [LaunchDarkly](https://launchdarkly.com/) | SaaS | 엔터프라이즈, 타겟팅, 분석 |

## 정리

```
JSON 파일 (가장 단순) → 환경 변수 (쿠버네티스 연동) → flagd/OpenFeature (표준 API, 실시간) → Unleash/LaunchDarkly (대시보드, 분석)
```

프로젝트 규모에 맞는 도구를 선택하세요.
