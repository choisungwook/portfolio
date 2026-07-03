COMPOSE ?= docker compose

.PHONY: up down logs client curl

up:
	$(COMPOSE) up --build -d sse-server

down:
	$(COMPOSE) down --remove-orphans

logs:
	$(COMPOSE) logs -f sse-server

client:
	$(COMPOSE) run --rm sse-client

curl:
	curl -N "http://localhost:8000/events?limit=5&interval=1"
