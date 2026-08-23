.PHONY: up down infra-up runtime-env compose-up test format-check scenario1-korean scenario1-harmful scenario1-openai scenario2-curl scenario2-python scenario2-harmful

up: infra-up runtime-env compose-up

infra-up:
	uv sync
	terraform -chdir=terraform init
	terraform -chdir=terraform apply

runtime-env:
	./scripts/export-runtime-env.sh

compose-up:
	docker compose up -d --wait

down:
	docker compose down -v
	terraform -chdir=terraform destroy

test:
	uv sync --dev
	uv run pytest
	uv run ruff check .
	terraform -chdir=terraform fmt -check -recursive
	terraform -chdir=terraform validate
	docker compose --env-file .env.example config --quiet

format-check:
	uv run ruff check .
	terraform -chdir=terraform fmt -check -recursive

scenario1-korean:
	./scripts/litellm_search.sh "2026년 8월 Amazon Bedrock의 최신 웹 검색 기능을 한국어로 찾아줘"

scenario1-harmful:
	./scripts/litellm_safety_probe.sh

scenario1-openai:
	./scripts/litellm_openai_agent.sh

scenario2-curl:
	set -a; . ./.runtime.env; set +a; ./scripts/direct_curl.sh

scenario2-python:
	set -a; . ./.runtime.env; set +a; .venv/bin/python scripts/direct_search.py "2026년 8월 Amazon Bedrock의 최신 웹 검색 기능을 한국어로 찾아줘"

scenario2-harmful:
	set -a; . ./.runtime.env; set +a; .venv/bin/python scripts/safety_probe.py
