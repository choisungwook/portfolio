IMAGE_NAME=choisunguk/tensorflow
IMAGE_TAG=2.19.0

create-builder:
	docker buildx create --name mybuilder --use

build-push:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(IMAGE_NAME):${IMAGE_TAG} --push .
