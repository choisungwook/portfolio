IMAGE_NAME=choisunguk/java-heapdump
IMAGE_TAG=1.0

.PHONY: build create-builder build-push clean

build:
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .

create-builder:
	docker buildx create --name mybuilder --use

build-push:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(IMAGE_NAME):$(IMAGE_TAG) --push .

clean:
	docker rm -f heapdump-live 2>/dev/null || true
	rm -rf dumps
