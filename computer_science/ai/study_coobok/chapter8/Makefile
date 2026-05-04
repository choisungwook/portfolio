.PHONY: env build chat evaluate down clean

env:
	test -f .env || cp .env.example .env
	@echo ".env 준비 완료. OPENAI_API_KEY를 채우세요."

build: env
	docker compose build

chat: env
	docker compose run --rm copilot

evaluate: env
	docker compose --profile eval run --rm evaluate

down:
	docker compose down --remove-orphans

clean: down
	docker image rm study-coobok/network-copilot:latest 2>/dev/null || true
