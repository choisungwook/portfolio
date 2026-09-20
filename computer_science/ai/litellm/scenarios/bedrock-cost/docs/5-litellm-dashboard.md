# LiteLLM 대시보드에서 token을 파고듭니다

"대시보드"라고 부를 수 있는 화면이 두 개입니다. LiteLLM이 자기 안에 가진 관리 콘솔과, Prometheus 지표를 그리는 Grafana입니다. 보는 단위가 달라서 쓰는 곳도 다릅니다.

| 화면 | 주소 | 보는 단위 | 언제 씁니까 |
|---|---|---|---|
| LiteLLM 관리 콘솔 | `http://localhost:4020/ui` | 요청 한 건 | 어느 요청이 token을 많이 썼는지 찾을 때 |
| Grafana | `http://localhost:3000` | 합계와 추이 | 전체가 어긋나는지, 언제부터인지 볼 때 |

두 장부를 나란히 놓는 것은 Grafana 쪽입니다. 절차는 [6-observe.md](6-observe.md)에 있습니다. 이 문서는 LiteLLM이 보여 주는 숫자만 다룹니다.

## 관리 콘솔에 들어갑니다

사용자 이름은 `admin`이고 비밀번호는 `.env`의 `LITELLM_MASTER_KEY` 값입니다. 로그인 화면이 그렇게 안내합니다. `UI_USERNAME`과 `UI_PASSWORD`를 따로 주면 그 값으로 바뀝니다.

```bash
open http://localhost:4020/ui
```

왼쪽 메뉴에서 token을 볼 수 있는 곳은 **Logs**와 **Usage** 둘입니다.

## Logs: 요청 한 건의 token 내역

**Logs**는 `LiteLLM_SpendLogs` 테이블을 그대로 보여 줍니다. 표에는 `prompt_tokens`, `completion_tokens`, `total_tokens`와 spend가 요청마다 한 줄씩 있습니다.

여기서 알아 둘 것이 하나 있습니다. **표의 `prompt_tokens`에는 캐시 token이 이미 섞여 있습니다.** 시나리오 3의 요청은 이 열에 10,529로 보이지만, 그중 10,502는 Bedrock이 캐시에서 읽은 것입니다. 표만 보면 이 요청이 입력을 1만 개 넘게 썼다고 오해합니다.

쪼갠 값은 행을 펼쳐서 봅니다. 요청 상세의 metadata에 `usage_object`가 있고 그 안에 네 종류가 나뉘어 있습니다.

```json
{
  "prompt_tokens": 10529,
  "prompt_tokens_details": { "text_tokens": 27, "cached_tokens": 10502 },
  "cache_read_input_tokens": 10502,
  "cache_creation_input_tokens": 0,
  "completion_tokens": 6
}
```

`text_tokens` 27이 Bedrock의 `InputTokenCount`에 해당하는 값입니다. 나머지는 캐시입니다.

화면을 거치지 않고 같은 것을 보려면 DB에서 바로 읽습니다.

```bash
docker compose exec -T db psql -U litellm -d litellm -c \
  "SELECT request_id, prompt_tokens, completion_tokens, round(spend::numeric,6),
          metadata::jsonb #>> '{usage_object,prompt_tokens_details,text_tokens}' AS 캐시아닌입력,
          metadata::jsonb #>> '{usage_object,cache_read_input_tokens}' AS 캐시읽기,
          metadata::jsonb #>> '{usage_object,cache_creation_input_tokens}' AS 캐시쓰기
     FROM \"LiteLLM_SpendLogs\" ORDER BY \"startTime\" DESC LIMIT 10;"
```

## 콘솔에서 token이 이상해 보일 때 짚는 순서

숫자가 커 보이는 원인은 대개 셋 중 하나입니다. 위에서부터 확인합니다.

1. **`cache_hit` 열이 `True`인가.** LiteLLM 응답 캐시가 돌려준 요청입니다. Bedrock을 부르지 않았는데 token은 원래 응답의 값이 그대로 적힙니다. spend는 0입니다.
2. **`cache_read_input_tokens`가 큰가.** Bedrock prompt caching이 동작한 요청입니다. `prompt_tokens`가 커 보이지만 그 부분의 단가는 10분의 1입니다.
3. **`status`가 `failure`인가.** 모델에 닿지 못한 요청입니다. `prompt_tokens`는 LiteLLM이 추정한 값이고 청구는 없습니다.

세 가지 중 어느 것도 아니면 그 요청은 실제로 입력을 많이 쓴 것입니다.

## Usage: 합계와 상위 사용자

**Usage**는 같은 데이터를 날짜, key, team, model 단위로 합쳐 보여 줍니다. 여기 나오는 token 합계는 위 세 가지가 섞인 값입니다. 청구서와 대조할 숫자가 아니라 "우리 쪽에서 누가 많이 썼는가"를 보는 숫자로 씁니다.

금액을 볼 때는 spend 열을 씁니다. 캐시 hit이 0으로 들어가서 청구서와 같은 기준입니다. 이유는 [4-why-different.md](4-why-different.md)에 있습니다.

## Grafana의 LiteLLM 공식 대시보드

LiteLLM 저장소가 유지하는 대시보드를 그대로 가져와 `observability/grafana/dashboards/litellm-prod-v2.json`에 두었습니다. 원본은 `cookbook/litellm_proxy_server/grafana_dashboard/dashboard_v2`입니다. 고친 것은 datasource 변수의 기본값 하나뿐입니다.

Grafana 왼쪽 메뉴의 **Dashboards**에서 **LiteLLM Prod v2 (공식)**를 엽니다. 패널 10개가 요청 수, 실패율, 지연, 남은 rate limit을 보여 줍니다.

이 대시보드에는 **캐시 token 패널이 없습니다.** 운영 상태를 보는 대시보드이지 token 회계를 보는 대시보드가 아닙니다. 캐시를 포함한 token 내역은 이 실습이 따로 만든 대시보드 세 개에서 봅니다. 목록은 [6-observe.md](6-observe.md)에 있습니다.

## 콘솔과 Grafana의 숫자가 다를 때

같은 proxy를 보는데 값이 다르면 대개 기준 시점이 다릅니다.

- 콘솔은 DB에 쌓인 전체 기간을 봅니다. `docker compose down`으로는 지워지지 않습니다.
- Grafana의 LiteLLM 지표는 proxy가 뜬 뒤로만 셉니다. `docker compose restart litellm`을 하면 0에서 다시 시작합니다.

그래서 실험할 때는 proxy를 다시 띄우고 시작합니다. `scripts/run-all.sh`가 그 일을 먼저 합니다.
