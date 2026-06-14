IMAGE_NAME=choisunguk/nikolaik-harmes
BUILD_DATE=20260614
IMAGE_VERSION=v2
IMAGE_TAG=$(BUILD_DATE)-$(IMAGE_VERSION)
BUILDER_NAME=mybuilder
PLATFORMS=linux/amd64,linux/arm64

create-builder:
	docker buildx create --name $(BUILDER_NAME) --driver docker-container --use --bootstrap

build:
	docker build -t $(IMAGE_NAME):${IMAGE_TAG} .

build-push:
	docker buildx build --platform $(PLATFORMS) -t $(IMAGE_NAME):${IMAGE_TAG} --push .

verify:
	docker run --rm $(IMAGE_NAME):${IMAGE_TAG} sh -lc 'python --version && node --version && npm --version && command -v graphify && command -v notesmd-cli && command -v obsidian && obsidian --version && test ! -d /root/.cache/pip && test ! -d /root/.npm'
