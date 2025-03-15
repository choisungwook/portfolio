.PHONY: up down first-test second-test

up:
	docker-compose up -d

down:
	docker-compose down

first-test:
	@echo "Testing Nginx connectivity..."
	@echo "------------------------------------"
	@echo "| From   | To     | Status |"
	@echo "------------------------------------"
	@for src in nginx1 nginx2; do \
		for dst in 192.168.100.12 192.168.200.12; do \
			if [ "$$src" != "$$dst" ]; then \
				status=$$(docker exec $$src sh -c "curl -s --max-time 1 -o /dev/null -w \"%{http_code}\" http://$$dst"); \
				if [ "$$status" -eq 200 ]; then \
					echo "| $$src | $$dst |  ✅  |"; \
				else \
					echo "| $$src | $$dst |  ❌ ($$status) |"; \
				fi; \
			fi; \
		done; \
	done
	@echo "------------------------------------"

second-test:
	@echo "Testing Nginx connectivity..."
	@echo "------------------------------------"
	@echo "| From   | To     | Status |"
	@echo "------------------------------------"
	@for src in nginx1 nginx2 nginx3; do \
		for dst in 192.168.100.12 192.168.200.12 192.168.210.12; do \
			if [ "$$src" != "$$dst" ]; then \
				status=$$(docker exec $$src sh -c "curl -s --max-time 1 -o /dev/null -w \"%{http_code}\" http://$$dst"); \
				if [ "$$status" -eq 200 ]; then \
					echo "| $$src | $$dst |  ✅  |"; \
				else \
					echo "| $$src | $$dst |  ❌ ($$status) |"; \
				fi; \
			fi; \
		done; \
	done
	@echo "------------------------------------"
