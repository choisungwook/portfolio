COMPOSE = PROJECT_ROOT=$(CURDIR) docker compose -f manifests/docker-compose/docker-compose.yml

.PHONY: help up down

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets"
	@echo "  up          Start stack in background"
	@echo "  down        Stop stack and remove volumes"

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down -v
