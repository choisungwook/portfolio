.PHONY: up down logs status pool-exhaust tcp-watch tcp-capture clean

up:
	docker compose -f manifests/docker-compose.yml up -d --build

up-separate:
	docker compose -f manifests/docker-compose-separate-network.yml up -d --build

down:
	docker compose -f manifests/docker-compose.yml down -v
	docker compose -f manifests/docker-compose-separate-network.yml down -v 2>/dev/null || true

logs:
	docker compose -f manifests/docker-compose.yml logs -f app

status:
	@curl -s http://localhost:8080/pool-status && echo ""

tcp-check:
	@bash scripts/check-tcp-connections.sh

tcp-watch:
	@bash scripts/watch-pool-and-tcp.sh

pool-exhaust:
	@bash scripts/simulate-pool-exhaustion.sh

tcp-capture:
	@sudo bash scripts/tcpdump-mysql.sh

clean: down
	docker rmi $$(docker images -q '*db-pool*') 2>/dev/null || true
