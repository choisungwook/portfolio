# 로그와 메트릭

AWS CLI 생성 스크립트가 Gateway APPLICATION_LOGS를 CloudWatch Logs로 전송합니다. 로그 보존 기간은 7일입니다.

## 로그 확인

```bash
gateway_id="$(aws bedrock-agentcore-control list-gateways \
  --profile "$AWS_PROFILE" \
  --region us-east-1 \
  --query "items[?name=='agentcore-web-search-handson'].gatewayId | [0]" \
  --output text)"
log_group="/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/$gateway_id"
aws logs tail "$log_group" \
  --profile "$AWS_PROFILE" \
  --region us-east-1 \
  --since 10m
```

지속해서 확인할 때만 `--follow`를 추가합니다.

```bash
aws logs tail "$log_group" \
  --profile "$AWS_PROFILE" \
  --region us-east-1 \
  --since 10m \
  --follow
```

Gateway 로그에서 확인할 항목입니다.

- 요청 시작과 완료
- 잘못된 인증 header
- MCP method와 parameter 오류
- target 구성 오류
- 요청과 응답 payload

payload에는 사용자 query와 검색 snippet이 들어갈 수 있습니다. 운영에서는 접근 권한, 보존 기간, masking 정책을 먼저 정합니다.

## 메트릭 확인

AgentCore Gateway 메트릭은 `AWS/Bedrock-AgentCore` namespace에 약 1분 단위로 모입니다.

```bash
aws cloudwatch list-metrics \
  --namespace AWS/Bedrock-AgentCore \
  --region us-east-1
```

주요 메트릭입니다.

| 메트릭 | 확인 목적 |
| --- | --- |
| `Invocations` | 전체 호출량과 비용 추세 |
| `Throttles` | quota 초과와 backoff 필요 여부 |
| `SystemErrors` | AWS 또는 target 계층 오류 |
| `UserErrors` | 인증, method, parameter 오류 |
| `Latency` | Gateway 전체 응답 지연 |
| `Duration` | 요청 처리 시간 |
| `TargetExecutionTime` | Web Search target 실행 시간 |
| `TargetType` | MCP target 사용량 |

## LiteLLM 로그

```bash
docker compose logs --tail=100 litellm
```

OpenAI 오류와 AgentCore 오류를 구분합니다. 로그를 공유하기 전 AWS credential, bearer token, query, 검색 결과에 민감정보가 없는지 확인합니다.

## 권장 경보

- `Throttles > 0`
- `SystemErrors`와 `UserErrors`의 5분 합계
- `Latency` p90 또는 p99 임계치
- 예상 query budget을 넘는 `Invocations`

## 참고 자료

- [Gateway 관측성 데이터](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-gateway-metrics.html)
- [AgentCore Observability](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability.html)
