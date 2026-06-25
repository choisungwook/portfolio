KIND_CLUSTER ?= pr-preview-kind
NAMESPACE ?= pr-preview
ENVOY_GATEWAY_VERSION ?= v1.8.1
GATEWAY_HOST ?= preview.localtest.me

SERVICE_A_IMAGE ?= pr-preview/service-a:local
SERVICE_B_IMAGE ?= pr-preview/service-b:local
SERVICE_C_IMAGE ?= pr-preview/service-c:local

ENVOY_GATEWAY_INSTALL_URL = https://github.com/envoyproxy/gateway/releases/download/$(ENVOY_GATEWAY_VERSION)/install.yaml

create_kind:
	kind get clusters | grep -qx "$(KIND_CLUSTER)" || kind create cluster --name $(KIND_CLUSTER) --config kind/cluster.yaml

delete_kind:
	kind delete cluster --name $(KIND_CLUSTER)

build:
	docker build -t $(SERVICE_A_IMAGE) apps/service-a
	docker build -t $(SERVICE_B_IMAGE) apps/service-b
	docker build -t $(SERVICE_C_IMAGE) apps/service-c

load_kind:
	kind load docker-image $(SERVICE_A_IMAGE) --name $(KIND_CLUSTER)
	kind load docker-image $(SERVICE_B_IMAGE) --name $(KIND_CLUSTER)
	kind load docker-image $(SERVICE_C_IMAGE) --name $(KIND_CLUSTER)

install_gateway:
	kubectl apply -f $(ENVOY_GATEWAY_INSTALL_URL)
	kubectl wait --namespace envoy-gateway-system --for=condition=Available deployment/envoy-gateway --timeout=180s

apply:
	kubectl apply -f manifests/namespace/
	kubectl apply -f manifests/observability/
	kubectl apply -f manifests/apps/
	kubectl apply -f manifests/gateway/

wait:
	kubectl wait --namespace $(NAMESPACE) --for=condition=Available deployment --all --timeout=180s

gateway_service:
	kubectl get service --namespace envoy-gateway-system -l gateway.envoyproxy.io/owning-gateway-name=pr-preview-gateway

port_forward_gateway:
	kubectl port-forward --namespace envoy-gateway-system service/$$(kubectl get service --namespace envoy-gateway-system -l gateway.envoyproxy.io/owning-gateway-name=pr-preview-gateway -o jsonpath='{.items[0].metadata.name}') 8080:80

port_forward_zipkin:
	kubectl port-forward --namespace $(NAMESPACE) service/zipkin 9411:9411

call_main:
	curl -sS -H "Host: $(GATEWAY_HOST)" http://127.0.0.1:8080/start

call_preview:
	curl -sS -H "Host: $(GATEWAY_HOST)" -H "x-pr-preview: pr-101" http://127.0.0.1:8080/start

up: create_kind build load_kind install_gateway apply wait

down:
	kubectl delete -f manifests/gateway/ --ignore-not-found
	kubectl delete -f manifests/apps/ --ignore-not-found
	kubectl delete -f manifests/observability/ --ignore-not-found
	kubectl delete -f manifests/namespace/ --ignore-not-found
	kubectl delete -f $(ENVOY_GATEWAY_INSTALL_URL) --ignore-not-found

.PHONY: create_kind delete_kind build load_kind install_gateway apply wait gateway_service port_forward_gateway port_forward_zipkin call_main call_preview up down
