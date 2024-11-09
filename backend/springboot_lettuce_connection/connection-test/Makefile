IMAGE_NAME=choisunguk/lettuce-connection
IMAGE_TAG=v1

copy-to-kind:
	docker build -t $(IMAGE_NAME):${IMAGE_TAG} .
	kind load $(IMAGE_NAME):${IMAGE_TAG} --name redis-example

create-builder:
	docker buildx create --name mybuilder --use

build-push:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(IMAGE_NAME):${IMAGE_TAG} --push .
