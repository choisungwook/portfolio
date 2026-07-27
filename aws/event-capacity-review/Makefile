JAR       := app/target/capacity-lab-1.0.0.jar
RUN       := .run
JAVA      ?= java

# knobs the experiments change
THREADS       ?= 200
POOL          ?= 10
POOL_TIMEOUT  ?= 3000
HIT           ?= 0.0
DB_WORKERS    ?= 4
DB_SERVICE_MS ?= 20
DB_MAXCONN    ?= 60
STAGES        ?= 1,2,4,8,16,32,64,128
SECONDS       ?= 5

.PHONY: up down scale-out load stats reset coldstart build

$(JAR):
	cd app && mvn -q -B package -DskipTests

build: $(JAR)

up: $(JAR)
	@mkdir -p $(RUN)
	@$(JAVA) -jar $(JAR) --spring.profiles.active=db --server.port=9000 \
		--lab.db.workers=$(DB_WORKERS) --lab.db.service-ms=$(DB_SERVICE_MS) \
		--lab.db.max-connections=$(DB_MAXCONN) > $(RUN)/db.log 2>&1 & echo $$! > $(RUN)/db.pid
	@$(MAKE) --no-print-directory wait PORT=9000 WHAT=db
	@$(JAVA) -jar $(JAR) --spring.profiles.active=app --server.port=8080 \
		--server.tomcat.threads.max=$(THREADS) --lab.pool.size=$(POOL) \
		--lab.pool.timeout-ms=$(POOL_TIMEOUT) --lab.cache.hit-ratio=$(HIT) \
		> $(RUN)/app-8080.log 2>&1 & echo $$! > $(RUN)/app-8080.pid
	@$(MAKE) --no-print-directory wait PORT=8080 WHAT=app
	@echo "up: db=:9000 workers=$(DB_WORKERS) service=$(DB_SERVICE_MS)ms | app=:8080 threads=$(THREADS) pool=$(POOL) hit=$(HIT)"

scale-out: $(JAR)
	@$(JAVA) -jar $(JAR) --spring.profiles.active=app --server.port=8081 \
		--server.tomcat.threads.max=$(THREADS) --lab.pool.size=$(POOL) \
		--lab.pool.timeout-ms=$(POOL_TIMEOUT) --lab.cache.hit-ratio=$(HIT) \
		> $(RUN)/app-8081.log 2>&1 & echo $$! > $(RUN)/app-8081.pid
	@$(MAKE) --no-print-directory wait PORT=8081 WHAT=app
	@echo "up: second app instance on :8081"

down:
	@for f in $(RUN)/*.pid; do [ -e "$$f" ] && kill $$(cat $$f) 2>/dev/null; done; true
	@rm -rf $(RUN)
	@echo "down"

load:
	@uv run loadgen/load.py --targets $(or $(TARGETS),http://127.0.0.1:8080) \
		--stages $(STAGES) --seconds $(SECONDS)

stats:
	@curl -s localhost:8080/stats; echo; curl -s localhost:9000/stats; echo

reset:
	@curl -s -X POST localhost:8080/reset > /dev/null
	@curl -s -X POST localhost:9000/reset > /dev/null

# time from process start to the first request the instance can actually serve
coldstart: $(JAR)
	@mkdir -p $(RUN)
	@start=$$(date +%s%N); \
	$(JAVA) -jar $(JAR) --spring.profiles.active=app --server.port=8090 \
		> $(RUN)/coldstart.log 2>&1 & echo $$! > $(RUN)/coldstart.pid; \
	until curl -s -o /dev/null localhost:8090/stats; do sleep 0.1; done; \
	echo "ready after $$(( ($$(date +%s%N) - start) / 1000000 )) ms"; \
	kill $$(cat $(RUN)/coldstart.pid)

wait:
	@until curl -s -o /dev/null localhost:$(PORT)/stats; do sleep 0.2; done
