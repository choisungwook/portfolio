IMAGE_NAME=choisunguk/spring-helloworld-prometheus
IMAGE_TAG=v1.0

create-builder:
	docker buildx create --name mybuilder --use

build-push:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(IMAGE_NAME):${IMAGE_TAG} --push .
