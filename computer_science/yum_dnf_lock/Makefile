COMPOSE ?= docker compose
SERVICE ?= dnf-lab

.PHONY: up down shell hold compete observe logs config

up:
	$(COMPOSE) up -d --build dnf-lab

down:
	$(COMPOSE) down --remove-orphans --volumes

shell:
	$(COMPOSE) exec $(SERVICE) /bin/bash

hold:
	$(COMPOSE) --profile lock up -d --build lock-holder

compete:
	$(COMPOSE) --profile run run --rm competitor

observe:
	$(COMPOSE) exec dnf-lab /workspace/scripts/show_lock_owner.sh

logs:
	$(COMPOSE) logs --tail=80 lock-holder competitor

config:
	$(COMPOSE) config
