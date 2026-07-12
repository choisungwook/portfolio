# 폐쇄망에서 Bedrock을 부른다: 장기 key가 사라진다

앞의 [9-setup.md](9-setup.md)에서 NAT도 없는 폐쇄망과 EC2를 만들었다. 이제 그 안에서 LiteLLM으로 Bedrock을 부른다. Track A와 결정적으로 다른 점은 provider API key가 없다는 것이다. 자격증명을 EC2 instance role에서 가져오기 때문이다. 폐쇄망 안에 장기 API key가 존재하지 않는 것 자체가 이 트랙의 핵심 성과다.

## Bedrock을 등록한 config

EC2 안에서 LiteLLM을 띄운다. config는 Bedrock 모델 하나만 등록하면 된다. `api_key` 줄이 없다는 데 주목한다.

```yaml
model_list:
  - model_name: claude
    litellm_params:
      # ap-northeast-2에서 Claude는 APAC cross-region inference profile로 부른다.
      # 정확한 profile ID는 Bedrock 콘솔에서 확인한다.
      model: bedrock/apac.anthropic.claude-sonnet-4-5-20250929-v1:0
      aws_region_name: ap-northeast-2
```

사전 조건이 둘 있다. 콘솔에서 Bedrock model access를 활성화해야 하고, ap-northeast-2의 Claude는 US 접두사(`us.`)가 아니라 APAC(`apac.`) 또는 global 접두사 inference profile을 써야 한다. [terraform/iam.tf](../terraform/iam.tf)의 `bedrock:InvokeModel` 권한도 이 두 대상(inference profile과 foundation model)에 맞춰 걸려 있다.

## 정말 인터넷이 없는데 LLM이 되는지 증명한다

EC2 안에서 두 개를 나란히 확인한다. 하나는 인터넷이 정말 막혔다는 것, 하나는 그런데도 LLM 호출이 된다는 것이다.

```bash
# 인터넷은 막혀 있다 (타임아웃으로 실패해야 정상)
curl -m 3 https://google.com ; echo "exit=$?"

# 그런데 LLM 호출은 된다 (Bedrock endpoint 경유)
curl -s http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude", "messages": [{"role": "user", "content": "ping"}]}'
```

첫 명령이 실패하고 둘째가 성공하면, "인터넷이 안 되는 곳에 AI gateway를 구축한다"는 엔터프라이즈 요건이 그대로 재현된 것이다. [1-why-ai-gateway.md](1-why-ai-gateway.md)에서 말한 "gateway는 그대로, 뒤의 모델과 네트워크만 바뀐다"가 두 트랙의 대비로 완성된다.

실습이 끝나면 [9-setup.md](9-setup.md)의 정리 절차대로 폐쇄망 인프라를 반드시 destroy 한다.

## 참고자료

- [LiteLLM Bedrock provider](https://docs.litellm.ai/docs/providers/bedrock)
- [Amazon Bedrock VPC endpoint (PrivateLink)](https://docs.aws.amazon.com/bedrock/latest/userguide/usingVPC.html)
- [SSM Session Manager over VPC endpoints](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-privatelink.html)
