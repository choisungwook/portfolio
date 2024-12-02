IMAGE_NAME=choisunguk/iptables_exporter
IMAGE_TAG-AMD=v3
IMAGE_TAG-ARM=v3

up:
	@kind create cluster --config kind-config.yaml
	@helm upgrade --install metrics-server -n kube-system -f ./metrics_server_values.yaml metrics-server/metrics-server
	@helm upgrade --install prometheus-stack -n monitoring --create-namespace -f prometheus_stack_values.yaml prometheus-community/kube-prometheus-stack

down:
	@kind delete cluster --name iptables-exporter

create-builder:
	docker buildx create --name mybuilder --use

build-push-amd:
	docker buildx build --platform linux/amd64 -t $(IMAGE_NAME):amd-${IMAGE_TAG-AMD} -f Dockerfile-amd --push .

build-push-arm:
	docker build --platform linux/arm64 -t $(IMAGE_NAME):arm-${IMAGE_TAG-ARM} -f Dockerfile-arm --push .

.PHONY: create-builder build-push-amd build-push-arm up down
