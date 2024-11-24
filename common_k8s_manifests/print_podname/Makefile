IMAGE_NAME=choisunguk/print-podname
IMAGE_TAG=python-rc1.2

create-builder:
	docker buildx create --name mybuilder --use

build-push:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(IMAGE_NAME):${IMAGE_TAG} --push .

.PHONY: create-builder build-push
