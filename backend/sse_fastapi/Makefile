.PHONY: up up-detached down logs stream client serve-local

up:
	docker compose up --build

up-detached:
	docker compose up --build -d

down:
	docker compose down --remove-orphans

logs:
	docker compose logs -f

stream:
	curl -N http://localhost:8000/events

client:
	uv run sse-client --url http://localhost:8000/events --events 3

serve-local:
	uv run uvicorn sse_fastapi.main:app --host 0.0.0.0 --port 8000 --reload
