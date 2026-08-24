-include .env
-include .runtime.env
export

.PHONY: test format-check bedrock-web-search agentcore-web-search direct-agentcore-web-search agentcore-harmful

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
	uv run python -m agentcore_web_search.litellm_with_agentcore_web_search

direct-agentcore-web-search:
	AWS_SHARED_CREDENTIALS_FILE=$(CURDIR)/.runtime.aws-credentials AWS_PROFILE=runtime \
		uv run python -m agentcore_web_search.direct_agentcore_web_search
