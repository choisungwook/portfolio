.PHONY: up down test

up:
	uv sync --all-groups

down:
	@echo "No local service is running; remove .venv only when you no longer need it."

test:
	uv run pytest
