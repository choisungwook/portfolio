.PHONY: up down hold contend inspect test logs shell

up:
	docker compose up -d --build

down:
	docker compose down -v

hold:
	docker compose exec -d lab bash /workspace/scripts/hold-lock.sh

contend:
	docker compose exec lab bash /workspace/scripts/contend-lock.sh

inspect:
	docker compose exec lab bash /workspace/scripts/inspect-lock.sh

test:
	docker compose exec lab bash /workspace/scripts/test-lock.sh

logs:
	docker compose logs -f lab

shell:
	docker compose exec lab bash
