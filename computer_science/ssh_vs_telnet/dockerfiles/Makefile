SSH_SERVER_IMAGE_NAME=choisunguk/ssh-server
SSH_SEVER_IMAGE_TAG=v1-ubuntu2204
TELNET_SERVER_IMAGE_NAME=choisunguk/telnet-server
TELNET_SEVER_IMAGE_TAG=v1-ubuntu2204

create-builder:
	docker buildx create --name mybuilder --use

build-push:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(SSH_SERVER_IMAGE_NAME):${SSH_SEVER_IMAGE_TAG} -f ssh-server.Dockerfile --push .
	docker buildx build --platform linux/amd64,linux/arm64 -t $(TELNET_SERVER_IMAGE_NAME):${TELNET_SEVER_IMAGE_TAG} -f telent-server.Dockerfile --push .

.PHONY: create-builder build-push
