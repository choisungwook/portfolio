CLIENT_IMAGE_REPO ?= choisungwook/tcp-client
SERVER_IMAGE_REPO ?= choisungwook/tcp-server
VERSION ?= 0.1.0
PLATFORM ?= linux/amd64
CLIENT_IMAGE := $(CLIENT_IMAGE_REPO):v$(VERSION)
SERVER_IMAGE := $(SERVER_IMAGE_REPO):v$(VERSION)

validate_version:
	@printf '%s\n' "$(VERSION)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$'

lock:
	uv lock

build: build_server build_client

build_server: validate_version
	docker buildx build --platform $(PLATFORM) -f tcp-server/Dockerfile -t $(SERVER_IMAGE) --load .

build_client: validate_version
	docker buildx build --platform $(PLATFORM) -f tcp-client/Dockerfile -t $(CLIENT_IMAGE) --load .

push: push_server push_client

push_server: validate_version
	docker buildx build --platform $(PLATFORM) -f tcp-server/Dockerfile -t $(SERVER_IMAGE) --push .

push_client: validate_version
	docker buildx build --platform $(PLATFORM) -f tcp-client/Dockerfile -t $(CLIENT_IMAGE) --push .

run_server:
	uv run python tcp-server/server.py

run_client_interval:
	MODE=interval uv run python tcp-client/client.py

run_client_manual:
	MODE=manual uv run python tcp-client/client.py

.PHONY: validate_version lock build build_server build_client push push_server push_client run_server run_client_interval run_client_manual
