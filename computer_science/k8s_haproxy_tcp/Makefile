KIND_CLUSTER ?= haproxy-tcp
CLIENT_IMAGE_REPO ?= choisungwook/tcp-client
SERVER_IMAGE_REPO ?= choisungwook/tcp-server
VERSION ?= 0.1.0

create_kind:
	kind get clusters | grep -qx "$(KIND_CLUSTER)" || kind create cluster --name $(KIND_CLUSTER) --config kind/cluster.yaml

delete_kind:
	kind delete cluster --name $(KIND_CLUSTER)

build:
	$(MAKE) -C app build CLIENT_IMAGE_REPO=$(CLIENT_IMAGE_REPO) SERVER_IMAGE_REPO=$(SERVER_IMAGE_REPO) VERSION=$(VERSION)

push:
	$(MAKE) -C app push CLIENT_IMAGE_REPO=$(CLIENT_IMAGE_REPO) SERVER_IMAGE_REPO=$(SERVER_IMAGE_REPO) VERSION=$(VERSION)

load_kind:
	kind load docker-image $(SERVER_IMAGE_REPO):v$(VERSION) --name $(KIND_CLUSTER)
	kind load docker-image $(CLIENT_IMAGE_REPO):v$(VERSION) --name $(KIND_CLUSTER)

apply_tcp_echo:
	kubectl apply -f manifests/tcp-echo/

install_envoy_local:
	helm upgrade --install tcp-echo-envoy manifests/envoy \
		-f manifests/envoy/values.yaml \
		-f manifests/envoy/values-local.yaml

install_envoy_eks:
	helm upgrade --install tcp-echo-envoy manifests/envoy \
		-f manifests/envoy/values.yaml \
		-f manifests/envoy/values-eks.yaml

port_forward:
	kubectl port-forward svc/tcp-echo-envoy 2000:2000

port_forward_admin:
	kubectl port-forward svc/tcp-echo-envoy-admin 9901:9901

up: create_kind build load_kind apply_tcp_echo install_envoy_local

down:
	helm uninstall tcp-echo-envoy --ignore-not-found
	kubectl delete -f manifests/tcp-echo/ --ignore-not-found

.PHONY: create_kind delete_kind build push load_kind apply_tcp_echo install_envoy_local install_envoy_eks port_forward port_forward_admin up down
