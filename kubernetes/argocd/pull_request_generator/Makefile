CLUSTER_NAME ?= argocd-pr-generator
IMAGE_PREFIX ?= pull-request-generator
IMAGE_TAG ?= local
BUILDER_NAME ?= mybuilder
PLATFORMS ?= linux/amd64,linux/arm64

up:
	kind get clusters | grep -qx "$(CLUSTER_NAME)" || kind create cluster --config kind/cluster.yaml

down:
	kind delete cluster --name $(CLUSTER_NAME)

create-builder:
	docker buildx create --name "$(BUILDER_NAME)" --use

build-push:
	docker buildx build --platform "$(PLATFORMS)" -t "$(IMAGE_PREFIX)/pod-a:$(IMAGE_TAG)" --push apps/pod-a
	docker buildx build --platform "$(PLATFORMS)" -t "$(IMAGE_PREFIX)/pod-b:$(IMAGE_TAG)" --push apps/pod-b

.PHONY: up down create-builder build-push
