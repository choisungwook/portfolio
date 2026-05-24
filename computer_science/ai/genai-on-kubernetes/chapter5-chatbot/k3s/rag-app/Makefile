IMAGE_NAME=choisunguk/ch5-rag-app
IMAGE_TAG=k3s-py312-amd64
PLATFORM=linux/amd64

create-builder:
	docker buildx create --name mybuilder --use

build-push:
	docker buildx build --platform $(PLATFORM) -t $(IMAGE_NAME):$(IMAGE_TAG) --push .

.PHONY: create-builder build-push
