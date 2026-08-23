-include .env
export

.PHONY: test format-check bedrock-web-search agentcore-web-search agentcore-harmful

test:
	uv sync --dev
	uv run pytest
	uv run ruff check .
	bash -n scripts/*.sh
	docker compose --env-file .env.example config --quiet

format-check:
	uv run ruff check .

agentcore-harmful:
	./scripts/litellm_safety_probe.sh

bedrock-web-search:
	uv run python scripts/bedrock_web_search.py

agentcore-web-search:
	uv run python scripts/agentcore_web_search.py
