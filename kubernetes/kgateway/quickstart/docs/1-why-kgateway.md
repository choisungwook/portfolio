# kgateway가 무엇이고 어디에 서 있는가

kgateway는 Kubernetes Gateway API를 구현한 Envoy 기반 control plane이다. Gateway 리소스를 만들면 kgateway가 Envoy 프록시를 파드로 띄우고, HTTPRoute를 읽어 그 Envoy의 라우팅 설정을 xDS로 밀어 넣는다.

## Ingress가 아니라 Gateway API인 이유

- Ingress는 스펙이 작아서 재시도, timeout, 헤더 조작 같은 것을 표준으로 표현할 수 없다. 구현체마다 annotation으로 우회했고 그래서 컨트롤러를 바꾸면 설정이 통째로 안 맞는다.
- Gateway API는 그 역할을 세 리소스로 쪼갠다. 인프라 담당이 GatewayClass와 Gateway를, 앱 담당이 HTTPRoute를 갖는다.
- 권한 경계가 리소스 경계와 같아서 namespace RBAC만으로 "앱 팀은 자기 route만 고친다"가 성립한다.

| 리소스 | 소유자 | 담는 것 |
|---|---|---|
| GatewayClass | 플랫폼 | 어느 구현체가 처리할지. kgateway가 설치되면 `kgateway`가 생긴다 |
| Gateway | 인프라 | listener. 포트, 프로토콜, 어느 namespace의 route를 붙일지 |
| HTTPRoute | 앱 | hostname, path 매칭, backend와 가중치 |

## kgateway의 위치

- control plane은 `kgateway-system`에 파드 하나로 뜬다. 트래픽이 여기를 지나가지 않는다.
- data plane은 Gateway 리소스마다 따로 뜨는 Envoy 파드다. Gateway를 지우면 같이 사라진다.
- 즉 Gateway 하나가 곧 프록시 한 벌이다. 팀별로 Gateway를 나누면 프록시도 나뉜다.

## 표준으로 모자란 부분은 kgateway CRD가 채운다

Gateway API 표준에 없는 정책은 `gateway.kgateway.dev` 그룹의 CRD로 붙인다. v2.4.2 기준 여덟 개다.

| CRD | 쓰임 |
|---|---|
| TrafficPolicy | rate limit, 인증, 변환, timeout, retry. 이 핸즈온에서 다루는 것 |
| BackendConfigPolicy | backend 쪽 연결 설정 |
| Backend | 클러스터 밖 대상(정적 host, AWS 등)을 backend로 선언 |
| DirectResponse | backend 없이 고정 응답 |
| GatewayParameters | Gateway가 만들 Envoy Deployment와 Service의 모양 |
| HTTPListenerPolicy / ListenerPolicy | listener 단위 설정 |
| GatewayExtension | 외부 처리 서버(extAuth, extProc) 연결 |

정책은 `targetRefs`로 HTTPRoute나 Gateway에 붙는다. 정책이 리소스를 참조하지, 리소스가 정책을 참조하지 않는다. 그래서 앱 팀이 HTTPRoute를 고쳐도 플랫폼이 건 정책은 그대로 남는다.

## AI 트래픽은 지금 어디에 있는가

- kgateway v2.1에서 Envoy 기반 AI Gateway와 Envoy 기반 Inference Extension이 deprecated됐다. 같은 기능을 agentgateway data plane에서 구현하기 때문이다.
- v2.4.2 helm chart에는 `inferenceExtension` 값이 없고, control plane의 ClusterRole에도 `inference.networking.k8s.io` 권한이 없다. Envoy 쪽에서는 제거가 끝난 상태다.
- 그래서 `--set inferenceExtension.enabled=true`나 InferencePool을 쓰는 글은 v2.0~v2.1 시절 문서다. 지금 그대로 따라 하면 값이 무시되거나 InferencePool이 아무에게도 처리되지 않는다.
- 이 핸즈온의 LLM 라우팅([6-llm-routing.md](6-llm-routing.md))은 InferencePool 없이 표준 HTTPRoute로만 한다. 모델 인지 라우팅까지 필요하면 그때 agentgateway를 얹는다.

## 다음

맥에서 kind cluster를 띄우는 [2-setup.md](2-setup.md)로 넘어간다.
