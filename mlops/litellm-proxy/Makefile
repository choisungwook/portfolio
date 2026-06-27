COMPOSE=docker compose

.PHONY: up down logs ps request

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f litellm

ps:
	$(COMPOSE) ps

request:
	curl -sS http://localhost:4000/v1/chat/completions \
		-H 'Content-Type: application/json' \
		-H 'Authorization: Bearer sk-local-change-me' \
		-d '{"model":"local-mock","messages":[{"role":"user","content":"hello"}]}' \
		| jq .
