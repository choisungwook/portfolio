.PHONY: up down logs open load-no-warmup load-with-warmup restart-no-warmup restart-with-warmup

# 전체 스택 기동 (빌드 포함)
up:
	docker compose up -d --build

# 전체 스택 종료 및 볼륨 삭제
down:
	docker compose down -v

# 앱 로그 실시간 확인
logs:
	docker compose logs -f app-no-warmup app-with-warmup

# Grafana 대시보드 열기 (macOS: open, Linux: xdg-open)
open:
	@echo "Grafana: http://localhost:3000"
	@if command -v open >/dev/null 2>&1; then open http://localhost:3000; \
	elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:3000; \
	else echo "브라우저에서 http://localhost:3000 을 직접 열어주세요."; fi

# no-warmup 앱에 burst 부하 — cold start 스파이크 확인용
load-no-warmup:
	docker compose --profile loadtest run --rm k6-no-warmup

# with-warmup 앱에 동일한 burst 부하 — no-warmup과 latency 비교
load-with-warmup:
	docker compose --profile loadtest-with run --rm k6-with-warmup

# 컨테이너 재시작으로 배포 직후 cold start를 재현한다
restart-no-warmup:
	docker compose restart app-no-warmup

restart-with-warmup:
	docker compose restart app-with-warmup
