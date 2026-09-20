# 실습 시나리오

시나리오마다 디렉터리 하나다. 각 디렉터리는 자기 compose 파일, 자기 config, 자기 `.env`를 갖는다. 다른 시나리오를 띄운 채로 올려도 컨테이너 이름, 볼륨, host port가 겹치지 않는다.

| 디렉터리 | 무엇을 하나 | host port | compose project |
|---|---|---|---|
| [set-model/](set-model/) | 모델과 로깅이 켜진 완성본으로 라우팅·인증·team·감사를 실습한다 | 4000 | `litellm-set-model` |
| [manual/](manual/) | 빈 config로 띄우고 웹 UI에서 모델·key·team을 손수 등록한다 | 4010 | `litellm-manual` |
| [bedrock-cost/](bedrock-cost/) | Bedrock을 호출해 LiteLLM spend와 AWS 청구가 어긋나는 지점을 측정한다. Prometheus로 두 장부를 한 화면에서 본다 | 4020, 9090, 3000 | `litellm-bedrock-cost` |

## 띄우고 내리기

시나리오 디렉터리 안에서 실행한다.

```bash
cp .env.example .env && docker compose up -d
```

`docker compose down`은 볼륨을 지우지 않는다. 기록까지 지울 때만 `-v`를 붙인다.

```bash
docker compose down
```

## 간섭하지 않는 이유

- compose 파일 맨 위의 `name:`이 project 이름을 고정한다. 컨테이너 이름과 볼륨 이름이 여기서 갈린다. 디렉터리 이름에 기대지 않으므로 디렉터리를 옮겨도 볼륨이 바뀌지 않는다.
- host port가 시나리오마다 다르다. 컨테이너 안쪽은 모두 4000이고 host 쪽만 갈린다.
- `.env`는 시나리오 디렉터리 안에 있고 커밋하지 않는다. 한 시나리오의 key가 다른 시나리오로 새지 않는다.

`name:`을 넣기 전에 manual을 띄운 적이 있으면 옛 볼륨(`manual_litellm-db`)이 남는다. 새 project 이름으로는 빈 DB가 만들어지므로, 옛 기록이 필요 없으면 `docker volume rm manual_litellm-db`로 지운다.

시나리오를 새로 추가할 때는 `name:`과 host port를 위 표에 없는 값으로 정하고 표에 한 줄 추가한다.
