.PHONY: up up-vllm up-aws-login down provider-bedrock test check

up:
	docker compose --progress quiet up -d searxng litellm

up-vllm:
	docker compose --progress quiet up -d vllm

up-aws-login:
	docker compose -f compose.yaml -f compose.aws-login.yaml --progress quiet up -d --build --force-recreate vllm litellm

down:
	docker compose --profile cpu --profile client --profile bedrock down -v

provider-bedrock:
	docker compose -f compose.yaml -f compose.aws-login.yaml --profile bedrock run --rm bedrock-provider-search

test:
	uv run pytest

check:
	uv run ruff check .
	uv run ruff format --check .
