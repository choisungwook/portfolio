.PHONY: up down logs clean zip

# Start local development environment
up:
	docker compose up -d
	@echo "WordPress: http://localhost:8080"
	@echo "Theme is auto-mounted. Edit files and refresh browser."

# Stop environment
down:
	docker compose down

# View logs
logs:
	docker compose logs -f wordpress

# Remove all data (fresh start)
clean:
	docker compose down -v

# Build theme zip for deployment
zip:
	@cd .. && zip -r akbun.zip akbun/ \
		-x "akbun/docker-compose.yml" \
		-x "akbun/.devcontainer/*" \
		-x "akbun/Makefile" \
		-x "akbun/.git/*" \
		-x "akbun/node_modules/*"
	@echo "Created ../akbun.zip"
