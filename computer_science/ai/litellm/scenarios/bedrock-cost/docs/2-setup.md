# 실습 환경

LiteLLM proxy v1.99.1, Postgres, Redis, Prometheus, cloudwatch-exporter를 docker compose로 띄웁니다. 뒤의 둘은 관찰용이고 절차는 [6-observe.md](6-observe.md)에 있습니다. 필요한 도구는 docker, `jq`, AWS CLI입니다.

## 준비: Bedrock을 호출할 IAM 키

`.env.example`을 복사해 값을 채웁니다. `.env`는 `.gitignore`에 걸려 있어 커밋되지 않습니다.

```bash
cp .env.example .env
```

IAM 사용자에는 아래 권한이 필요합니다. global inference profile은 요청을 여러 리전으로 보내므로 foundation model ARN의 리전을 비워 둡니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
    "Resource": [
      "arn:aws:bedrock:*:*:inference-profile/global.anthropic.claude-sonnet-4-6",
      "arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-6",
      "arn:aws:bedrock:::foundation-model/anthropic.claude-sonnet-4-6"
    ]
  }]
}
```

Bedrock serverless 모델은 계정에서 기본으로 열려 있어 모델 액세스를 따로 신청하지 않습니다. Anthropic 모델은 계정에서 처음 호출할 때 use case 제출을 한 번 요구할 수 있습니다(확인 필요). 호출이 `AccessDeniedException`으로 실패하면 Bedrock 콘솔의 **Model catalog**에서 해당 모델을 열어 안내를 따릅니다.

`scripts/report-aws.sh`는 컨테이너가 아니라 호스트의 AWS CLI 프로파일로 CloudWatch와 Cost Explorer를 읽습니다. `cloudwatch:GetMetricStatistics`와 `ce:GetCostAndUsage` 권한이 있는 프로파일을 씁니다.

## up

```bash
docker compose up -d
```

기동을 확인하고 예산 상한이 걸린 virtual key를 만듭니다. `max_budget`은 LiteLLM spend 기준 $4입니다.

```bash
set -a; source .env; set +a
curl -s localhost:4020/health/liveliness
curl -s localhost:4020/key/generate -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"key_alias":"cost-test","max_budget":4,"models":["claude-sonnet"]}' | jq -r .key
```

출력된 key를 셸에 넣어 두면 `scripts/scenario.sh`가 master key 대신 이 key를 씁니다.

```bash
export LITELLM_KEY=sk-...
```

관리 화면은 `http://localhost:4020/ui`입니다. `UI_USERNAME`과 `UI_PASSWORD`를 따로 주지 않았으므로 사용자 이름은 `admin`, 비밀번호는 `.env`의 `LITELLM_MASTER_KEY` 값입니다. spend log는 **Logs** 메뉴에서 요청 단위로 볼 수 있습니다.

## down

```bash
docker compose down
```

`down`은 named volume을 지우지 않습니다. spend log와 virtual key는 `pgdata`에, 응답 캐시는 `redisdata`(AOF)에 남아서 다시 `up` 하면 이어집니다. 라우팅 설정은 bind mount한 `config.yaml`에 있습니다. 기록까지 전부 지울 때만 `-v`를 붙입니다.

```bash
docker compose down -v
```

`.env`의 `POSTGRES_PASSWORD`를 나중에 바꾸면 proxy가 기동하지 못합니다. Postgres는 이 값을 데이터 디렉터리를 처음 만들 때만 쓰므로, 볼륨에는 예전 비밀번호가 그대로 남아 있기 때문입니다. 증상은 host의 4020 포트에 연결은 되는데 바로 끊기는 것이고, 로그에는 `P1000: Authentication failed`가 반복됩니다. 기록을 버려도 되면 볼륨째 지우고 다시 만듭니다.

```bash
docker compose down -v && docker compose up -d
```

기록을 살려야 하면 DB 안의 비밀번호를 `.env` 값으로 바꿉니다.

```bash
set -a; source .env; set +a
docker compose exec -T -e PGPASSWORD=<예전_비밀번호> db psql -h db -U litellm -d litellm \
  -c "ALTER USER litellm WITH PASSWORD '$POSTGRES_PASSWORD'"
docker compose restart litellm
```

## 이 구성에서 기본값과 다르게 둔 것

| 설정 | 값 | 이유 |
|---|---|---|
| `LITELLM_LOCAL_MODEL_COST_MAP` | `True` | 끄면 proxy가 기동할 때 GitHub main의 가격표를 받아옵니다. 같은 v1.99.1이라도 실행한 날에 따라 단가가 달라져 실험을 재현할 수 없습니다 |
| `num_retries` | `0` | 재시도는 LiteLLM 요청 1건에 Bedrock 호출을 여러 건 만듭니다. 시나리오가 분리하려는 변수가 아니라서 끕니다 |
| `require_auth_for_metrics_endpoint` | `false` | `/metrics`를 Prometheus가 토큰 없이 긁게 엽니다. 지표에 key alias와 team 이름이 들어 있으므로 운영에서는 켭니다 |
| `cache_params.ttl` | `86400` | 하루 안에 시나리오 2를 다시 돌리면 Bedrock 호출이 0건이 됩니다. 다시 1건부터 보려면 `docker compose exec redis redis-cli FLUSHALL`을 실행합니다 |
