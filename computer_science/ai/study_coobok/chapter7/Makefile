.PHONY: env build up up-v1 up-v2 up-v3 up-v4 logs down clean

# .env가 없으면 .env.example을 복사한다. data 디렉터리도 준비.
env:
	test -f .env || cp .env.example .env
	@mkdir -p data

build: env
	docker compose build --no-cache api-v1

# 전체 4개 버전을 8001~8004 포트로 한번에 기동
up: env
	docker compose up -d --build
	@echo "v1: http://localhost:8001  v2: http://localhost:8002  v3: http://localhost:8003  v4: http://localhost:8004"

up-v1: env
	docker compose up -d --build api-v1
	@echo "v1: http://localhost:8001"

up-v2: env
	docker compose up -d --build api-v2
	@echo "v2: http://localhost:8002"

up-v3: env
	docker compose up -d --build api-v3
	@echo "v3: http://localhost:8003"

up-v4: env
	docker compose up -d --build api-v4
	@echo "v4: http://localhost:8004"

logs:
	docker compose logs -f

down:
	docker compose down --remove-orphans

clean: down
	docker image rm study-coobok/network-ai-backend:latest 2>/dev/null || true
	rm -rf data
