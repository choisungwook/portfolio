COMPOSE ?= docker compose

.PHONY: build config down locks race shell up

build:
	$(COMPOSE) build

config:
	$(COMPOSE) config

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down --remove-orphans

race:
	$(COMPOSE) run --rm dnf-lab /lab/scripts/run-lock-race.sh

locks:
	$(COMPOSE) run --rm dnf-lab /lab/scripts/show-locks.sh

shell:
	$(COMPOSE) run --rm dnf-lab bash
