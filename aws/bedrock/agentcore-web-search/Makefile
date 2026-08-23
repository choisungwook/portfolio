-include .env
export

.PHONY: up down infra-up target-up target-down runtime-env compose-up test format-check bedrock-web-search agentcore-web-search agentcore-harmful

up: infra-up target-up runtime-env compose-up

infra-up:
	uv sync
	terraform -chdir=terraform init
	terraform -chdir=terraform apply

target-up:
	./scripts/install-web-search-target.sh

target-down:
	./scripts/delete-web-search-target.sh

runtime-env:
	./scripts/export-runtime-env.sh

compose-up:
	docker compose up -d --wait

down:
	docker compose down -v
	$(MAKE) target-down
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

agentcore-harmful:
	./scripts/litellm_safety_probe.sh

bedrock-web-search:
	uv run python scripts/bedrock_web_search.py

agentcore-web-search:
	uv run python scripts/agentcore_web_search.py
