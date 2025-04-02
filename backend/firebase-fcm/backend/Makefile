IMAGE_NAME=choisunguk/fcm-push
IMAGE_TAG=9.2.0-rc.2

create-builder:
	docker buildx create --name mybuilder --use

build-push:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(IMAGE_NAME):${IMAGE_TAG} --push .
