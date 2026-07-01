.PHONY: up down logs dumps clean-dumps

up:
	mkdir -p dumps
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f metaspace-oom

dumps:
	ls -lh dumps

clean-dumps:
	rm -f dumps/*.hprof dumps/*.log
