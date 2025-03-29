IMAGE_NAME=choisunguk/hikaricp
IMAGE_TAG=jdbc-v1

docker-build:
	./gradlew bootBuildImage
	docker tag $(IMAGE_NAME):latest $(IMAGE_NAME):$(IMAGE_TAG)

docker-build-push: docker-build
	docker push $(IMAGE_NAME):$(IMAGE_TAG)

docker-run:
	docker run -d -p 8080:8080 -t $(IMAGE_NAME):${IMAGE_TAG}

generate:
	@mkdir -p initdb
	@cd initdb && \
		echo "[Info] Downloading sakila-db..." && \
		curl -s -O 'https://downloads.mysql.com/docs/sakila-db.zip' && \
		echo "[Info] Unzipping sakila-db..." && \
		unzip -j sakila-db.zip && rm sakila-db.zip && \
		mv sakila-schema.sql 01_sakila-schema.sql && \
		mv sakila-data.sql 02_sakila-data.sql

up: clean generate
	@echo "[Info] Starting MySQL..."
	@docker compose up -d

down:
	@docker compose down

clean:
	@echo "[Info] Cleaning up..."
	@rm -rf initdb
