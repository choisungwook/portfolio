# manual: 웹 UI로 직접 구성하는 gateway

모델도 라우팅도 로깅도 비어 있는 config로 gateway를 띄우고, 웹 UI(/ui)에서 모델·virtual key·team을 손수 등록하는 것이 목표다. config.yaml로 선언하는 방식은 [../set-model/](../set-model/)과 비교한다.

## 띄우기

먼저 예시를 복사해 `.env`를 만든다. 깡통 상태에서는 provider key가 필요 없다. 모델을 추가할 때 웹 UI 폼에 넣으면 gateway가 암호화해 DB에 저장한다. master key·salt·DB 비밀번호만 채우면 뜬다.

```bash
cp .env.example .env
docker compose up -d
```

## 다음 순서

1. 웹 UI로 모델·virtual key·team 구성 — [../../docs/manual/web-ui-setup.md](../../docs/manual/web-ui-setup.md)
2. compose·env 구조 — [docker-compose.md](docker-compose.md)
