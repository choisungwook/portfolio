# envoy gateway 예제 모음

이 디렉터리는 envoy gateway를 사용한 kubernetes Gateway API 실습 예제들을 포함합니다.

## 사전 준비

모든 예제를 실행하기 전에 다음 사항이 준비되어 있어야 합니다:

1. Kind cluster가 실행 중이어야 합니다.
2. envoy gateway가 설치되어 있어야 합니다.
3. MetalLB가 설치 및 구성되어 있어야 합니다.

자세한 환경 구축 방법은 [envoy gateway 실습 가이드](../../example_envoy_gateway.md)를 참고하세요.

## 예제 목록

| 번호 | 예제 이름 | 설명 |
|------|-----------|------|
| 0 | [Quickstart](./quickstart) | envoy gateway 기본 동작을 확인하는 예제입니다. |
| 1 | [HTTPS/TLS](./01_https_tls) | TLS 인증서를 사용하여 HTTPS 통신을 설정합니다. |
| 2 | [Canary Deployment](./02_canary_deployment) | 가중치 기반으로 트래픽을 분산하고 점진적으로 배포합니다. |
| 3 | [Rate Limiting](./03_rate_limiting) | 요청 속도를 제한하여 서비스를 보호합니다. |

## 예제별 주요 학습 내용

### Quickstart

- Gateway, HTTPRoute 기본 개념
- envoy gateway의 동작 원리를 학습합니다.
- 기본 라우팅을 설정합니다.

### HTTPS/TLS

- TLS 인증서를 생성하고 관리합니다.
- kubernetes secret을 활용합니다.
- TLS Termination을 설정합니다.
- 프로덕션 환경에서 인증서를 관리하는 방법을 학습합니다.

### Canary Deployment

- 트래픽 가중치(Weight)를 설정합니다.
- 점진적 배포 전략(10% → 50% → 100%)을 학습합니다.
- Blue-Green 배포 방법을 학습합니다.
- 롤백 시나리오를 학습합니다.

### Rate Limiting

- BackendTrafficPolicy 리소스를 사용합니다.
- Local Rate Limiting과 Global Rate Limiting의 차이를 학습합니다.
- DDoS 방어 기법을 학습합니다.
- API 쿼터를 관리하는 방법을 학습합니다.

## 참고자료

- [Envoy Gateway 공식 문서](https://gateway.envoyproxy.io/)
- [Kubernetes Gateway API 공식 문서](https://gateway-api.sigs.k8s.io/)
- [Envoy Gateway 실습 가이드](../../example_envoy_gateway.md)
