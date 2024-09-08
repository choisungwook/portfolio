IMAGE_NAME=choisunguk/statefulset_pythonapp
IMAGE_TAG=v2

create-builder:
	docker buildx create --name mybuilder --use

build-push:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(IMAGE_NAME):${IMAGE_TAG} --push .

.PHONY: create-builder build-push
