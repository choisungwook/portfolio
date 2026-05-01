KIND_IMAGE := kindest/node:v1.35.1
CLUSTER := langgraph-handson

.PHONY: cluster-up cluster-down apply-broken clean-broken

cluster-up:
	kind create cluster --name $(CLUSTER) --image $(KIND_IMAGE)

cluster-down:
	kind delete cluster --name $(CLUSTER)

apply-broken:
	kubectl apply -f manifests/broken-nginx.yaml

clean-broken:
	kubectl delete -f manifests/broken-nginx.yaml --ignore-not-found
