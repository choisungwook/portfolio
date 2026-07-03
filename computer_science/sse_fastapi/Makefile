.PHONY: up down logs stream headers client

up:
	docker compose up -d --build
	@echo "SSE demo: http://localhost:8000"

down:
	docker compose down --remove-orphans

logs:
	docker compose logs -f sse-api

stream:
	curl -N http://localhost:8000/events

headers:
	curl -i -N http://localhost:8000/events

client:
	docker compose exec sse-api uv run sse-client
