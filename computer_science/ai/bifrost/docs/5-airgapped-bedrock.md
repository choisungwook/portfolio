# 폐쇄망 인프라는 그대로, gateway만 Bifrost로 바꾼다

LiteLLM track에서 NAT도 없는 폐쇄망에 gateway를 올리고 Bedrock을 불렀다. 그 인프라(VPC, endpoint, EC2, IAM)는 어떤 gateway를 쓰든 똑같다. gateway가 바뀌어도 폐쇄망 설계가 바뀌지 않는다는 게 이 문서의 핵심이다. 그래서 Terraform을 새로 만들지 않고 재사용하고, EC2 위에서 도는 컨테이너와 config만 Bifrost로 바꾼다.

## 왜 인프라를 다시 안 만드나

폐쇄망의 요구는 gateway 종류와 무관하다. 인터넷을 막고, 운영에 필요한 통신을 VPC endpoint로 여는 것. Bifrost든 LiteLLM이든 필요한 endpoint가 같다.

- ssm·ssmmessages·ec2messages — EC2 접속
- s3 gateway — AL2023 패키지, ECR 이미지 layer
- ecr.api·ecr.dkr — 컨테이너 이미지 pull
- bedrock-runtime — LLM 호출

그래서 폐쇄망 환경 구축은 옆 LiteLLM 워크스페이스의 setup 문서 [../../litellm/docs/6-setup.md](../../litellm/docs/6-setup.md)를 그대로 따른다. VPC·endpoint·EC2·IAM은 동일하다. 이 문서는 그 위에서 달라지는 두 가지, 즉 EC2에 올리는 이미지와 config만 다룬다.

## Bifrost 이미지를 폐쇄망 안으로

이미지는 ECR로 공급한다. LiteLLM setup이 만든 ECR repository는 LiteLLM용이므로, Bifrost용 repository를 하나 더 두거나 같은 패턴으로 추가한다. 로컬(인터넷 가능)에서 Bifrost 이미지를 받아 push한다. EC2가 Graviton이라 arm64로 받는다.

```bash
ECR=<account>.dkr.ecr.ap-northeast-2.amazonaws.com/litellm-airgap/bifrost
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin "$ECR"
docker pull --platform linux/arm64 maximhq/bifrost:latest
docker tag maximhq/bifrost:latest "$ECR:latest"
docker push "$ECR:latest"
```

## Bedrock을 부르는 config: 여기서도 장기 key가 없다

Bifrost의 Bedrock provider는 정적 IAM key뿐 아니라 EC2 instance profile 자격증명도 받는다. 폐쇄망 EC2에는 [../../litellm/terraform/iam.tf](../../litellm/terraform/iam.tf)가 붙인 instance role이 있으니, config.json에 access key를 넣지 않아도 된다. LiteLLM track과 똑같이, 폐쇄망 안에 장기 자격증명이 존재하지 않는다.

Bedrock provider를 등록한 config.json은 대략 이렇다. 정적 key를 생략하면 Bifrost가 AWS 기본 자격증명 체인(=instance profile)을 쓴다.

```json
{
  "$schema": "https://www.getbifrost.ai/schema",
  "providers": {
    "bedrock": {
      "keys": [
        {
          "name": "bedrock",
          "models": ["apac.anthropic.claude-sonnet-4-5-20250929-v1:0"],
          "weight": 1.0,
          "bedrock_key_config": { "region": "ap-northeast-2" }
        }
      ]
    }
  }
}
```

확인 필요: instance profile 자격증명일 때 `bedrock_key_config`에 access key를 비우는 정확한 표기와 region 지정 위치는 실습 시점의 [Bifrost Bedrock provider 문서](https://www.getmaxim.ai/bifrost/guides/providers/bedrock)에서 확인한다. ap-northeast-2에서 Claude는 US 접두사(`us.`)가 아니라 APAC(`apac.`) inference profile을 써야 한다는 점은 LiteLLM track과 같다. IAM 권한도 [../../litellm/terraform/iam.tf](../../litellm/terraform/iam.tf)의 `bedrock:InvokeModel`이 그대로 적용된다.

이 문서의 Bedrock 호출 부분은 AWS 과금이 필요해 이 실습 저장소에서는 부팅까지 검증하지 않았다. 로컬 docker 검증([3-routing.md](3-routing.md), [4-governance.md](4-governance.md))으로 config 형식과 거버넌스 동작을 확인한 뒤, 폐쇄망 apply는 비용을 감안해 진행한다.

## 인터넷 없이 LLM이 되는지 증명한다

EC2에 SSM으로 접속해 Bifrost 컨테이너를 ECR에서 pull해 띄운 뒤, LiteLLM track과 같은 두 가지를 확인한다.

```bash
# 인터넷은 막혀 있다 (타임아웃 실패가 정상)
curl -m 3 https://google.com ; echo "exit=$?"

# 그런데 LLM 호출은 된다 (bedrock-runtime endpoint 경유)
curl -s http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "bedrock/apac.anthropic.claude-sonnet-4-5-20250929-v1:0", "messages": [{"role": "user", "content": "ping"}]}'
```

첫 명령이 실패하고 둘째가 성공하면, gateway를 Bifrost로 바꿔도 "인터넷 없는 곳에 AI gateway를 구축한다"는 요건이 그대로 재현된다. 두 track을 관통하는 결론은 하나다. gateway는 갈아 끼워도, 폐쇄망 설계와 애플리케이션의 OpenAI 호환 호출은 바뀌지 않는다.

실습이 끝나면 LiteLLM setup 문서의 정리 절차대로 폐쇄망 인프라를 반드시 destroy 한다.

```bash
cd ../../litellm/terraform && terraform destroy
```

## 참고자료

- [Bifrost AWS Bedrock provider](https://www.getmaxim.ai/bifrost/guides/providers/bedrock)
- [Bifrost GitHub (maximhq/bifrost)](https://github.com/maximhq/bifrost)
- LiteLLM track 폐쇄망 setup: [../../litellm/docs/6-setup.md](../../litellm/docs/6-setup.md)
