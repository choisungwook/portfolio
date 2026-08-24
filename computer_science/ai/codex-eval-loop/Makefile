.PHONY: up down test train holdout loop reset

up:
	UV_CACHE_DIR=.uv-cache uv sync --frozen

down: reset

test:
	UV_CACHE_DIR=.uv-cache uv run python -m unittest discover -s tests -v

train:
	UV_CACHE_DIR=.uv-cache uv run python scripts/train_gate.py

holdout:
	UV_CACHE_DIR=.uv-cache uv run python scripts/holdout_gate.py

loop:
	UV_CACHE_DIR=.uv-cache uv run python scripts/run_loop.py

reset:
	cp candidate/path_policy_baseline.py candidate/path_policy.py
