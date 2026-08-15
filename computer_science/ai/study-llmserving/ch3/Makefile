.PHONY: sync notebook lint format create_kind delete_kind up watch down

sync:
	uv sync --dev

notebook:
	uv run jupyter lab

lint:
	uv run ruff format --check .
	uv run ruff check .

format:
	uv run ruff format .
	uv run ruff check --fix .

create_kind:
	kind create cluster --name ch03 --config 01_setup/kind-cluster.yaml

delete_kind:
	kind delete cluster --name ch03

up:
	docker compose --profile cpu up -d --build --force-recreate serving

watch:
	docker compose --profile cpu watch serving

down:
	docker compose down
