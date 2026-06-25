# 헤더 propagation과 trace는 어디에서 확인할까

Gateway에서 preview 체인으로 잘 보냈더라도, 서비스 내부 호출에서 헤더가 끊기면 실제 검증 결과는 믿기 어렵습니다. 그렇다면 A Pod에서 받은 preview 맥락이 C Pod까지 이어지는지 어떻게 확인할 수 있을까요?

이 문서는 응답 JSON과 Zipkin UI로 propagation을 확인하는 방법입니다.

## 어떤 헤더를 확인할까

이 예제는 세 가지 헤더를 확인합니다.

| 헤더 | 목적 |
|---|---|
| `x-pr-preview` | 요청이 어떤 preview 버전을 대상으로 하는지 표시 |
| `x-request-id` | 한 번의 요청을 서비스 로그나 응답에서 따라가기 위한 ID |
| `traceparent` | W3C Trace Context 형식의 trace 전달 |

`x-pr-preview`는 사람이 이해하기 쉬운 preview 선택값입니다. `traceparent`는 tracing 도구가 호출 체인을 묶는 데 사용하는 값입니다.

## main 체인은 어떻게 보일까

Gateway port-forward가 켜진 상태에서 `main` 체인을 호출합니다.

```bash
make call_main
```

응답에는 A, B, C 서비스의 `version`이 모두 `main`으로 표시되어야 합니다. `x-pr-preview` 헤더를 보내지 않았기 때문에 service A가 기본값으로 `main`을 설정하고 B와 C에 전달합니다.

## preview 체인은 어떻게 보일까

이번에는 preview 헤더를 넣어 호출합니다.

```bash
make call_preview
```

응답에는 A, B, C 서비스의 `version`이 모두 `pr-101`로 표시되어야 합니다. 이 값이 중간에 `main`으로 바뀌면 라우팅 또는 서비스 간 URL 설정이 잘못된 것입니다.

## trace는 왜 Zipkin에서 볼까

응답 JSON만으로도 헤더 전달은 확인할 수 있습니다. 하지만 실제 운영에서는 호출이 여러 서비스로 퍼지기 때문에 JSON 하나만 보아서는 전체 흐름을 이해하기 어렵습니다.

Zipkin을 port-forward합니다.

```bash
make port_forward_zipkin
```

브라우저에서 `http://127.0.0.1:9411`을 열고 `service-a-main`, `service-b-main`, `service-c-main` 또는 `service-a-pr-101`, `service-b-pr-101`, `service-c-pr-101`을 조회합니다.

장점은 요청 하나가 A -> B -> C로 이어지는지 시각적으로 볼 수 있다는 점입니다. 단점은 이 예제가 최소 구현이라 sampling, 로그 연계, 에러 태그 같은 운영 APM 요소는 다루지 않는다는 점입니다.

## 헤더가 끊기면 어디를 볼까

먼저 `HTTPRoute`가 preview 헤더를 기준으로 service A를 올바르게 선택했는지 봅니다.

```bash
kubectl describe httproute pr-preview-route -n pr-preview
```

그 다음 service A와 service B의 환경변수를 확인합니다.

```bash
kubectl get deployment service-a-pr-101 -n pr-preview -o yaml
kubectl get deployment service-b-pr-101 -n pr-preview -o yaml
```

service A의 `SERVICE_B_URL`이 `service-b-pr-101`을 보고, service B의 `SERVICE_C_URL`이 `service-c-pr-101`을 보면 preview 체인 설정은 맞습니다.

## 정리하면 무엇을 믿을 수 있을까

정리하면, PR Preview는 Gateway에서 한 번 갈라지는 것으로 끝나지 않습니다. 서비스 내부 호출에서도 preview 헤더와 trace context가 유지되어야 같은 변경사항을 검증했다고 말할 수 있습니다.

## 참고자료

- W3C Trace Context: <https://www.w3.org/TR/trace-context/>
- Zipkin API: <https://zipkin.io/zipkin-api/>
