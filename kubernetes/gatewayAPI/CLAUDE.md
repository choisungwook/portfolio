# kubernetes gateway API

- 이 프로젝트는 kubernetes gateway API 핸즈온입니다.

## 실습환경

실습 환경은 두 가지입니다.

- 로컬: kind cluster를 구성하고 envoy gateway를 사용합니다.
- EKS: AWS EKS를 사용하고 AWS ALB Controller를 사용합니다.
- EKS환경에서는 public route53 hostzone이 있고 externalDNS로 Route53 레코드를 제어합니다. 도메인은 choilab.xyz입니다.
- EKS는 1.34를 설치했고 ALB controller, external DNS controller가 설치되어 있습니다.

## 제약 (Limitation)

- kubectl 또는 kubernetes API를 사용할 때는 조회만 할 수 있습니다. 리소스 생성, 수정, 삭제는 하지 마세요. 생성, 수정, 삭제는 제가 수동으로 진행합니다.

## 디렉터리 구조

- kind-cluster: kind cluster 설치에 필요한 리소스 모음입니다.
- manifests
  - envoy-gateway: envoy gateway 예제입니다.
  - MetalLB: kind cluster에서 LoadBalancer service를 사용하기 위해 MetalLB를 설치합니다.
  - netshoot: netshoot를 생성하는 리소스입니다.
- EKS: AWS EKS 설치에 필요한 리소스 모음입니다.

## Claude Subagent 사용

### ALB Gateway Guide Subagent

AWS EKS에서 ALB Controller를 사용한 kubernetes Gateway API 실습 가이드를 제공하는 전문 서브 에이전트입니다. 언제 사용하나요?

- AWS ALB/NLB를 사용한 Gateway API 실습이 필요할 때
- ALB Controller의 GatewayClass, Gateway, HTTPRoute 등 리소스 사용법을 알고 싶을 때
- AWS 환경에서 Gateway API 설정 방법을 질문할 때

호출 방법:

```sh
/alb-gateway-guide [질문 또는 요청]
```

예시:

```sh
/alb-gateway-guide ALB를 사용한 기본 HTTP 라우팅 실습 가이드를 만들어주세요

/alb-gateway-guide NLB를 사용한 L4 Gateway 설정 방법을 알려주세요

/alb-gateway-guide HTTPRoute에서 경로 기반 라우팅하는 방법을 알려주세요
```

참고사항:

- 서브 에이전트는 AWS ALB Controller 공식 문서를 참조하여 답변합니다
- example_envoy_gateway.md와 유사한 스타일로 한국어 가이드를 제공합니다
- ALB Controller가 자동으로 생성하는 CRD (예: TargetGroupBinding)는 수동으로 정의하지 않도록 안내합니다
