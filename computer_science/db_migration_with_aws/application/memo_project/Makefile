IMAGE_NAME=choisunguk/dms-example-memo
IMAGE_TAG=v1

create-builder:
	docker buildx create --name mybuilder --use

build-push:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(IMAGE_NAME):${IMAGE_TAG} --push .

.PHONY: create-builder build-push
