TOOLS_DIR := $(CURDIR)/.tools/bin

export PATH := $(TOOLS_DIR):$(PATH)

.PHONY: tools proto server client up down compose-client

tools:
	mkdir -p $(TOOLS_DIR)
	GOBIN=$(TOOLS_DIR) go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.6
	GOBIN=$(TOOLS_DIR) go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5.1

proto: tools
	mkdir -p gen
	protoc \
		--proto_path=proto \
		--go_out=gen \
		--go_opt=paths=source_relative \
		--go-grpc_out=gen \
		--go-grpc_opt=paths=source_relative \
		proto/echo/v1/echo.proto

server:
	go run ./cmd/server

client:
	go run ./cmd/client -name akbun

up:
	docker compose up --build server

compose-client:
	docker compose run --rm client

down:
	docker compose down --remove-orphans
