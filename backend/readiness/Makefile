IMAGE_NAME=choisunguk/springboot-readiness
IMAGE_TAG=1.0-liveness

create-builder:
	docker buildx create --name mybuilder --use

build-push:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(IMAGE_NAME):${IMAGE_TAG} --push .
