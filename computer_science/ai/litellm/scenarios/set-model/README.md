# set-model: 모델과 로깅이 켜진 완성본

gpt·gemini 두 모델이 등록되고 spend 로깅까지 켜진 config로 gateway를 바로 띄운다. 손볼 것 없이 동작을 먼저 보고 싶을 때 쓴다. 웹 UI에서 손수 등록하는 방식은 [../manual/](../manual/)과 비교한다.

## 띄우기

예시를 복사해 `.env`에 provider key와 master key를 채운 뒤 올린다.

```bash
cp .env.example .env
docker compose up -d
```

등록된 모델은 모델 목록으로 확인한다. `gpt`·`gemini`가 보이면 된다.

```bash
curl -s http://localhost:4000/v1/models -H "Authorization: Bearer $LITELLM_MASTER_KEY"
```
